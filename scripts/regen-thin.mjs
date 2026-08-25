/**
 * Regenerate the thin published articles.
 *
 * The April seed corpus predates every gate this pipeline now has: 18 of the 50
 * published articles are under the 500-word floor, eight of them under 110
 * words, and between them they carry 13 product links, 12 generic
 * `amazon.com/s?k=` search links and ZERO internal links. A healthy article on
 * this site averages 1,410 words, 5.4 product links and 2.3 internal links.
 *
 * SHOPPING MODE. `--discover` searches Amazon per topic and gives products
 * actually matched to the article; `--from-cache` picks from stock already
 * verified for other guides and spends no Canopy budget. Discover is better and
 * is the default.
 *
 * The cache path exists because on a FREE Canopy tier the daily cycle has no
 * spec runway — every pending brief needs its own search — so spending eighteen
 * searches on eighteen already-published articles would stall NEW publishing
 * until the monthly reset. On a metered plan that trade does not apply and
 * there is no reason to accept the weaker products.
 *
 * Sequential on purpose. The models are rate-limited, the publish step runs a
 * full Next build each time, and a failure halfway through should leave a
 * coherent tree rather than a pile of half-written specs.
 *
 *   node scripts/regen-thin.mjs [--from-cache] [--limit N] [--words N] [--dry-run]
 */
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const DRY = process.argv.includes("--dry-run");
/* Discover by default; --from-cache opts into the zero-Canopy path. */
const SHOP = process.argv.includes("--from-cache") ? "--from-cache" : "--discover";
const lIdx = process.argv.indexOf("--limit");
const LIMIT = lIdx > -1 ? Number(process.argv[lIdx + 1]) : Infinity;
const wIdx = process.argv.indexOf("--words");
const FLOOR = wIdx > -1 ? Number(process.argv[wIdx + 1]) : 500;

/** Published articles whose body is under the floor, thinnest first. */
function thinArticles() {
  const src = readFileSync(`${ROOT}src/data/articles.ts`, "utf8");
  return src
    .split(/\n    slug: "/)
    .slice(1)
    .map((part) => {
      const slug = part.slice(0, part.indexOf('"'));
      const i = part.indexOf("content: `");
      if (i < 0) return null;
      const body = part.slice(i + 10, part.indexOf("`,", i + 10));
      return { slug, words: body.split(/\s+/).filter(Boolean).length };
    })
    .filter((a) => a && a.words < FLOOR)
    .sort((a, b) => a.words - b.words);
}

const targets = thinArticles().slice(0, LIMIT);
console.log(`${targets.length} article(s) under ${FLOOR} words — shopping via ${SHOP}\n`);
if (!targets.length) process.exit(0);
if (DRY) {
  targets.forEach((t) => console.log(`  ${String(t.words).padStart(4)}  ${t.slug}`));
  process.exit(0);
}

mkdirSync(`${ROOT}specs`, { recursive: true });
const done = [];
const failed = [];

for (const [i, target] of targets.entries()) {
  const spec = `${ROOT}specs/${target.slug}.json`;
  console.log(`\n━━ [${i + 1}/${targets.length}] ${target.slug} (${target.words} words) ━━`);

  try {
    execFileSync(
      "node",
      ["scripts/write-article.mjs", target.slug, SHOP, "--out", spec],
      { cwd: ROOT, stdio: "inherit" },
    );
  } catch (err) {
    /* Exit 2 is a deliberate deferral — most often "the cache cannot field four
     * relevant products for this topic", which is a correct refusal rather than
     * a fault. Record it and keep going; a topic the cache cannot serve is one
     * to revisit with --discover after the quota resets. */
    const why = err.status === 2 ? "deferred (no relevant products)" : `write failed (exit ${err.status})`;
    console.log(`  ${why}`);
    failed.push({ slug: target.slug, why });
    continue;
  }

  if (!existsSync(spec)) {
    failed.push({ slug: target.slug, why: "no spec written" });
    continue;
  }

  try {
    execFileSync("node", ["scripts/publish-article.mjs", spec, "--replace"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    done.push(target.slug);
  } catch (err) {
    console.log(`  publish failed (exit ${err.status})`);
    failed.push({ slug: target.slug, why: `publish failed (exit ${err.status})` });
  }
}

console.log(`\n━━ done: ${done.length} republished, ${failed.length} skipped ━━`);
for (const f of failed) console.log(`  ${f.slug} — ${f.why}`);
