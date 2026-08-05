#!/usr/bin/env node
/**
 * Publish an article from a JSON spec — atomically, across all three files.
 *
 *   node scripts/publish-article.mjs specs/art-024.json
 *   node scripts/publish-article.mjs specs/art-024.json --dry-run
 *
 * An article lives in two places and the 2026-04-11 journal entry records what
 * happens when they drift: affiliate ASINs were updated in src/data/articles.ts
 * but not in the blog route's product grid, shipping five dead links. A later
 * audit found one dead ASIN serving two unrelated products. Hand-editing two
 * files in sync is exactly the kind of bookkeeping a model does badly and a
 * script does perfectly, so the model never does it — it emits a spec, this
 * runs the edit.
 *
 * Guarantees:
 *   - Fails closed on links. Every product ASIN must be cached LIVE. An ASIN
 *     that is DEAD or has never been confirmed blocks the publish.
 *   - All-or-nothing. If anything fails, including the build, every file is
 *     restored to its prior contents.
 *   - Idempotent. Refuses to publish a slug that already exists.
 *
 * Does NOT commit. Tier 3 (run-cycle) owns git, so a failed build never
 * leaves a half-published commit behind.
 *
 * Exit codes: 0 published · 1 failed · 2 deferred (ASINs unconfirmed)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { EXIT } from "./lib/amazon.mjs";
import { loadCache, classify } from "./lib/asin-cache.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const ARTICLES = `${ROOT}src/data/articles.ts`;
/* Heroes and per-article sections used to live inside the blog route, and this
 * script patched that one file. They were extracted to src/data/ so the home
 * page and blog index could render the same photographs and prices on their
 * cards, which means the publish now edits three files instead of two. The
 * all-or-nothing guarantee covers all three. */
const HEROES = `${ROOT}src/data/heroes.ts`;
const SECTIONS = `${ROOT}src/data/article-sections.ts`;
const TAG = "camprally-20";

const specPath = process.argv[2];
const DRY = process.argv.includes("--dry-run");
if (!specPath) {
  console.error("usage: publish-article.mjs <spec.json> [--dry-run]");
  process.exit(EXIT.FAIL);
}

const spec = JSON.parse(readFileSync(specPath, "utf8"));

// ── validate ──────────────────────────────────────────────────────────────
const REQUIRED = ["id", "slug", "title", "excerpt", "category", "readTime", "date", "body", "products"];
const missing = REQUIRED.filter((k) => !spec[k]);
if (missing.length) {
  console.error(`spec is missing required field(s): ${missing.join(", ")}`);
  process.exit(EXIT.FAIL);
}
if (spec.body.includes("`")) {
  // The body is embedded in a template literal; a backtick would break the file.
  console.error("spec.body contains a backtick, which would break the template literal");
  process.exit(EXIT.FAIL);
}
if (/AMZ_[A-Z_]+/.test(spec.body)) {
  console.error("spec.body still contains unresolved AMZ_ placeholders");
  process.exit(EXIT.FAIL);
}

const articlesSrc = readFileSync(ARTICLES, "utf8");
const heroesSrc = readFileSync(HEROES, "utf8");
const sectionsSrc = readFileSync(SECTIONS, "utf8");

/*
 * --replace regenerates an article that already exists, swapping its body and
 * product grid in place. Needed because articles rot: live pricing revealed
 * that several were recommending products well outside the price band their
 * own title promises, and prose cannot self-correct. Without --replace the
 * only options are hand-editing or leaving a wrong article up.
 *
 * The slug, and therefore the URL and its accumulated SEO age, is preserved.
 */
const REPLACE = process.argv.includes("--replace");
const alreadyPublished = articlesSrc.includes(`slug: "${spec.slug}"`);
if (alreadyPublished && !REPLACE) {
  console.error(`slug "${spec.slug}" is already published — pass --replace to regenerate it`);
  process.exit(EXIT.FAIL);
}
if (!alreadyPublished && REPLACE) {
  console.error(`--replace given but "${spec.slug}" is not published yet`);
  process.exit(EXIT.FAIL);
}

// ── link gate: fail closed ────────────────────────────────────────────────
const asins = spec.products.map((p) => p.asin);
const bodyAsins = [...spec.body.matchAll(/\/dp\/(B[0-9A-Z]{9})/g)].map((m) => m[1]);
const all = [...new Set([...asins, ...bodyAsins])];

const { dead, unseen } = classify(loadCache(), all);
if (dead.length) {
  console.error(`BLOCKED — ${dead.length} ASIN(s) are known dead: ${dead.join(", ")}`);
  process.exit(EXIT.FAIL);
}
if (unseen.length) {
  console.error(
    `DEFERRED — ${unseen.length} ASIN(s) have never been confirmed live: ${unseen.join(", ")}\n` +
    `Run: node scripts/refresh-asins.mjs --all --limit ${unseen.length}`,
  );
  process.exit(EXIT.DEFER);
}
console.log(`link gate: ${all.length} ASIN(s) all cached LIVE`);

// ── build the inserts ─────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const entry =
  "  {\n" +
  `    id: "${esc(spec.id)}",\n` +
  `    slug: "${esc(spec.slug)}",\n` +
  `    title: "${esc(spec.title)}",\n` +
  `    excerpt: "${esc(spec.excerpt)}",\n` +
  `    category: "${esc(spec.category)}",\n` +
  `    date: "${esc(spec.date)}",\n` +
  `    author: "${esc(spec.author ?? "Camp Rally Team")}",\n` +
  `    readTime: "${esc(spec.readTime)}",\n` +
  "    content: `\n" + spec.body + "\n    `\n" +
  "  },\n";

function removeArticleEntry(src, slug) {
  // Entries are `{ id: ... slug: "x" ... },` — find the object containing the
  // slug and cut from its opening brace to the matching `},` that closes it.
  const at = src.indexOf(`slug: "${slug}"`);
  if (at === -1) return src;
  const start = src.lastIndexOf("\n  {", at);
  const end = src.indexOf("\n  },", at);
  if (start === -1 || end === -1) return src;
  return src.slice(0, start) + src.slice(end + "\n  },".length);
}

function removeCustomSections(src, slug) {
  const key = `  "${slug}": [`;
  const at = src.indexOf(key);
  if (at === -1) return src;
  // Walk brackets to find where this slug's section array closes.
  let depth = 0;
  for (let i = at + key.length - 1; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") {
      depth--;
      if (depth === 0) {
        const end = src.indexOf("\n", src.indexOf(",", i));
        return src.slice(0, at) + src.slice(end + 1);
      }
    }
  }
  return src;
}

const baseArticles = REPLACE ? removeArticleEntry(articlesSrc, spec.slug) : articlesSrc;
if (REPLACE && baseArticles === articlesSrc) {
  console.error(`could not locate the existing "${spec.slug}" entry to replace`);
  process.exit(EXIT.FAIL);
}

let nextArticles;
{
  const close = baseArticles.lastIndexOf("];");
  const lastBrace = baseArticles.lastIndexOf("},", close);
  if (close === -1 || lastBrace === -1) {
    console.error("could not locate the end of the articles array");
    process.exit(EXIT.FAIL);
  }
  nextArticles = baseArticles.slice(0, lastBrace + 2) + "\n\n" + entry + baseArticles.slice(close);
}

/* Clear any entry this slug already owns, on EVERY publish rather than only
 * under --replace.
 *
 * Both maps are object literals, so a second entry for the same key is a type
 * error, not a last-write-wins overwrite — and the publisher used to insert
 * blindly on a fresh publish. That wedged the 2026-08-05 09:00 cycle: a hero
 * had been added by hand for how-to-camp-in-rain while the article was still
 * sitting in the queue, so publishing it produced a duplicate key and the run
 * rolled back. It would have failed identically on every cycle thereafter.
 *
 * Making the strip unconditional costs nothing when the key is absent (both
 * helpers return the source unchanged) and makes a publish idempotent against
 * hand edits and against anything a previous rolled-back attempt left behind.
 *
 * `\s*` rather than a single space: entries in heroes.ts are column-aligned,
 * so the separator is a run of spaces. */
let nextHeroes = heroesSrc.replace(new RegExp(`^  "${spec.slug}":\\s*"[^"]*",\\n`, "m"), "");
let nextSections = removeCustomSections(sectionsSrc, spec.slug);
if (spec.hero) {
  const anchor = "\n  default: ";
  const i = nextHeroes.indexOf(anchor);
  if (i === -1) { console.error("could not locate HERO_IMAGES default"); process.exit(EXIT.FAIL); }
  nextHeroes =
    nextHeroes.slice(0, i + 1) +
    `  "${esc(spec.slug)}": "${esc(spec.hero)}",\n` +
    nextHeroes.slice(i + 1);
}

if (spec.products.length) {
  /* Emits only fields CustomSection["items"] actually declares.
   *
   * This previously also wrote `detail` and `note`. Those were stripped from
   * the type and from every existing entry when the catalog became the single
   * source of price and rating data — the renderer had been falling back to
   * `detail` to print a figure frozen at write time, which is how one page
   * managed to quote two different prices for the same product. The publisher
   * was never updated to match, so it kept emitting two fields the type
   * rejects: the next real publish would have failed type-checking and rolled
   * itself back, silently, on every attempt.
   *
   * `asin` is written alongside `link` because the catalog is ASIN-keyed and
   * that is the address the renderer prefers; `link` remains as the href to
   * fall back on for a product the catalog does not have. */
  const items = spec.products
    .map((p) =>
      `        { label: "${esc(p.label)}", category: "${esc(p.category ?? "")}", ` +
      `icon: "${p.icon ?? ""}", asin: "${esc(p.asin)}", ` +
      `link: "https://www.amazon.com/dp/${p.asin}?tag=${TAG}" },`)
    .join("\n");

  const callout = spec.callout
    ? "    {\n" +
      '      type: "callout",\n' +
      `      calloutType: "${esc(spec.callout.type ?? "tip")}",\n` +
      `      calloutTitle: "${esc(spec.callout.title)}",\n` +
      `      calloutBody: "${esc(spec.callout.body)}",\n` +
      "    },\n"
    : "";

  const section =
    `  "${esc(spec.slug)}": [\n` +
    "    {\n" +
    '      type: "product-grid",\n' +
    `      title: "${esc(spec.gridTitle ?? spec.title)}",\n` +
    "      items: [\n" + items + "\n      ]\n" +
    "    },\n" + callout +
    "  ],\n";

  // Matched without the declaration keyword so it survives the const -> export
  // const change that came with the move out of the route file.
  const marker = "ARTICLE_CUSTOM_SECTIONS: Record<string, CustomSection[]> = {\n";
  const j = nextSections.indexOf(marker);
  if (j === -1) { console.error("could not locate ARTICLE_CUSTOM_SECTIONS"); process.exit(EXIT.FAIL); }
  nextSections = nextSections.slice(0, j + marker.length) + section + nextSections.slice(j + marker.length);
}

if (DRY) {
  console.log(`\n[dry run] would add ${spec.id} (${spec.slug})`);
  console.log(`  articles.ts          +${entry.split("\n").length} lines`);
  console.log(`  heroes.ts            hero=${!!spec.hero}`);
  console.log(`  article-sections.ts  products=${spec.products.length} callout=${!!spec.callout}`);
  process.exit(EXIT.OK);
}

// ── write, then verify the build; restore on any failure ──────────────────
writeFileSync(ARTICLES, nextArticles);
writeFileSync(HEROES, nextHeroes);
writeFileSync(SECTIONS, nextSections);
console.log(`wrote articles.ts, heroes.ts and article-sections.ts`);

const restore = (why) => {
  writeFileSync(ARTICLES, articlesSrc);
  writeFileSync(HEROES, heroesSrc);
  writeFileSync(SECTIONS, sectionsSrc);
  console.error(`\nROLLED BACK — ${why}`);
};

/*
 * Build, retrying once on a transient failure.
 *
 * next/font/google fetches Inter and Archivo from Google at build time, so a
 * momentary Google outage fails the build — observed 2026-08-04, where two
 * consecutive builds failed on "Failed to fetch ... from Google Fonts" and the third
 * succeeded with no code change. Without a retry the cycle would roll back a
 * perfectly good article and report it as broken, which is exactly the kind of
 * misleading signal this pipeline exists to eliminate.
 *
 * A genuine error (type error, bad syntax) fails identically both times, so
 * the retry costs one build and never masks a real problem.
 */
const TRANSIENT = /Failed to fetch .* from Google Fonts|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i;

function tryBuild() {
  try {
    execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "pipe" });
    return { ok: true };
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

let build = tryBuild();
if (!build.ok && TRANSIENT.test(build.out)) {
  console.log("build hit a transient network error; retrying once...");
  build = tryBuild();
}
if (!build.ok) {
  const transient = TRANSIENT.test(build.out);
  restore(transient ? "build failed twice on a network error" : "build failed");
  console.error(build.out.slice(-1800));
  // A network failure is not a broken article — defer so the next cycle retries
  // instead of raising a blocker that needs a human.
  process.exit(transient ? EXIT.DEFER : EXIT.FAIL);
}

console.log(`\npublished ${spec.id} — ${spec.slug}`);
console.log(`build passed. ${spec.products.length} product link(s), all verified live.`);
