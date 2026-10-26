/**
 * Give every published article its own hero image.
 *
 * From 2026-10-09 to 10-26 MiniMax refused every image request ("login fail":
 * the key lived in auth-profiles.json, which the OpenClaw 8.35 upgrade removed),
 * write-article treated that as harmless, and ten articles went out on
 * HERO_IMAGES.default — the same stock red tent, one after another. write-article
 * and publish-article now both refuse to ship without a hero; this repairs the
 * ones already live.
 *
 * Two jobs:
 *   1. An article with no entry in heroes.ts gets an image generated exactly as
 *      write-article makes one (heroPrompt, image-01), an entry in heroes.ts,
 *      and `hero` in its spec.
 *   2. A spec with no `hero` whose article DOES have an entry gets the entry
 *      copied into the spec. publish-article rebuilds the heroes.ts entry from
 *      the spec on every publish, so without this a re-render would silently
 *      drop a hero the page already shows.
 *
 * Alt text is left to scripts/backfill-hero-alt.mjs, which looks at the image.
 *
 *   node scripts/backfill-heroes.mjs [--dry-run] [--check]
 *
 * --check changes nothing and exits 1 if any article would show the default.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { generateImage, heroPrompt, lastImageError } from "./lib/minimax-image.mjs";
import { minimaxKey } from "./lib/llm.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const ARTICLES = `${ROOT}src/data/articles.ts`;
const HEROES = `${ROOT}src/data/heroes.ts`;
const DRY = process.argv.includes("--dry-run");
const CHECK = process.argv.includes("--check");

const articles = [...readFileSync(ARTICLES, "utf8").matchAll(/slug:\s*"([^"]+)",\s*\n\s*title:\s*"((?:[^"\\]|\\.)*)"[\s\S]*?category:\s*"([^"]+)"/g)]
  .map((m) => ({ slug: m[1], title: m[2], category: m[3] }));
const allSlugs = [...readFileSync(ARTICLES, "utf8").matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
if (articles.length !== allSlugs.length) {
  // The title/category regex is stricter than the slug one; a mismatch means it
  // missed articles, and a check that cannot see an article cannot pass it.
  console.error(`parsed ${articles.length} articles with title+category but found ${allSlugs.length} slugs — fix the parser`);
  process.exit(2);
}

let heroesSrc = readFileSync(HEROES, "utf8");
const entry = (slug) => heroesSrc.match(new RegExp(`^  "${slug}":\\s*"([^"]+)",`, "m"))?.[1] ?? null;

const onDefault = articles.filter((a) => !entry(a.slug));
console.log(`${articles.length} articles, ${onDefault.length} on the default hero`);
for (const a of onDefault) console.log(`  ${a.slug}`);
if (CHECK) process.exit(onDefault.length ? 1 : 0);

function setSpecHero(slug, hero) {
  const p = `${ROOT}specs/${slug}.json`;
  if (!existsSync(p)) return "no spec";
  const spec = JSON.parse(readFileSync(p, "utf8"));
  if (spec.hero === hero) return "spec ok";
  spec.hero = hero;
  if (!DRY) writeFileSync(p, JSON.stringify(spec, null, 2) + "\n");
  return "spec updated";
}

const failed = [];
for (const a of onDefault) {
  const out = `${ROOT}public/images/heroes/${a.slug}.jpg`;
  process.stdout.write(`\n${a.slug} … `);
  if (DRY) { console.log("would generate"); continue; }
  let path = existsSync(out) ? out : null;
  for (let attempt = 1; !path && attempt <= 3; attempt++) {
    path = await generateImage({ prompt: heroPrompt(a.title, a.category), outPath: out, apiKey: minimaxKey() });
    if (!path && lastImageError()?.kind === "auth") break;
  }
  if (!path) {
    console.log(`FAILED: ${lastImageError()?.message}`);
    failed.push(a.slug);
    if (lastImageError()?.kind === "auth") break;
    continue;
  }
  const hero = `/images/heroes/${a.slug}.jpg`;
  const i = heroesSrc.indexOf("\n  default: ");
  heroesSrc = heroesSrc.slice(0, i + 1) + `  "${a.slug}": "${hero}",\n` + heroesSrc.slice(i + 1);
  writeFileSync(HEROES, heroesSrc);
  console.log(`generated · ${setSpecHero(a.slug, hero)}`);
}

console.log("\nspecs missing a hero their page already has:");
for (const a of articles) {
  const hero = entry(a.slug);
  if (!hero) continue;
  const r = setSpecHero(a.slug, hero);
  if (r === "spec updated") console.log(`  ${a.slug} ← ${hero}${DRY ? " (dry run)" : ""}`);
}

if (failed.length) {
  console.error(`\n${failed.length} still on the default: ${failed.join(", ")}`);
  process.exit(1);
}
