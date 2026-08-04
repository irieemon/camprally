#!/usr/bin/env node
/**
 * Publish an article from a JSON spec — atomically, across both files.
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
 *   - All-or-nothing. If anything fails, including the build, both files are
 *     restored to their prior contents.
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
const PAGE = `${ROOT}src/app/blog/[slug]/page.tsx`;
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
const pageSrc = readFileSync(PAGE, "utf8");

if (articlesSrc.includes(`slug: "${spec.slug}"`)) {
  console.error(`slug "${spec.slug}" is already published — nothing to do`);
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

let nextArticles;
{
  const close = articlesSrc.lastIndexOf("];");
  const lastBrace = articlesSrc.lastIndexOf("},", close);
  if (close === -1 || lastBrace === -1) {
    console.error("could not locate the end of the articles array");
    process.exit(EXIT.FAIL);
  }
  nextArticles = articlesSrc.slice(0, lastBrace + 2) + "\n\n" + entry + articlesSrc.slice(close);
}

let nextPage = pageSrc;
if (spec.hero) {
  const anchor = "  default: ";
  const i = nextPage.indexOf(anchor);
  if (i === -1) { console.error("could not locate HERO_IMAGES default"); process.exit(EXIT.FAIL); }
  nextPage = nextPage.slice(0, i) + `  "${esc(spec.slug)}": "${esc(spec.hero)}",\n` + nextPage.slice(i);
}

if (spec.products.length) {
  const items = spec.products
    .map((p) =>
      `        { label: "${esc(p.label)}", detail: "${esc(p.detail ?? "")}", ` +
      `note: "${esc(p.note ?? "")}", category: "${esc(p.category ?? "")}", ` +
      `icon: "${p.icon ?? ""}", link: "https://www.amazon.com/dp/${p.asin}?tag=${TAG}" },`)
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

  const marker = "const ARTICLE_CUSTOM_SECTIONS: Record<string, CustomSection[]> = {\n";
  const j = nextPage.indexOf(marker);
  if (j === -1) { console.error("could not locate ARTICLE_CUSTOM_SECTIONS"); process.exit(EXIT.FAIL); }
  nextPage = nextPage.slice(0, j + marker.length) + section + nextPage.slice(j + marker.length);
}

if (DRY) {
  console.log(`\n[dry run] would add ${spec.id} (${spec.slug})`);
  console.log(`  articles.ts  +${entry.split("\n").length} lines`);
  console.log(`  page.tsx     hero=${!!spec.hero} products=${spec.products.length} callout=${!!spec.callout}`);
  process.exit(EXIT.OK);
}

// ── write, then verify the build; restore on any failure ──────────────────
writeFileSync(ARTICLES, nextArticles);
writeFileSync(PAGE, nextPage);
console.log(`wrote articles.ts and page.tsx`);

const restore = (why) => {
  writeFileSync(ARTICLES, articlesSrc);
  writeFileSync(PAGE, pageSrc);
  console.error(`\nROLLED BACK — ${why}`);
};

/*
 * Build, retrying once on a transient failure.
 *
 * next/font/google fetches Geist from Google at build time, so a momentary
 * Google outage fails the build — observed 2026-08-04, where two consecutive
 * builds failed on "Failed to fetch Geist from Google Fonts" and the third
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
