#!/usr/bin/env node
/**
 * Guard against the class of bug where the site quotes a price it cannot back.
 *
 *   node scripts/check-price-claims.mjs
 *
 * Two failure modes, both of which shipped to production once:
 *
 *  1. A frozen price written into prose or editorial copy. Nothing refreshes it,
 *     so it drifts from reality — a spotlight card said $34.99 for a bag that
 *     was $94.99 on Amazon. Cent-precision figures are always specific product
 *     claims; round thresholds ("tents under $100") are category language and
 *     are ignored here.
 *
 *  2. A live price that has gone stale because refresh-prices could not run
 *     (Canopy quota, API outage). The render layer already refuses to display
 *     these, but silent degradation to "Check price" across the whole site is
 *     worth knowing about rather than discovering later.
 *
 * Exit: 0 clean · 1 frozen claims found · 0 with warnings only
 */

import { readFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const CENTS = /\$[\d,]+\.\d{2}/g;
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

let failures = 0;

// ── 1. frozen price claims in content and editorial copy ──────────────────
const articles = readFileSync(`${ROOT}src/data/articles.ts`, "utf8");
const proseHits = articles.match(CENTS) ?? [];
if (proseHits.length) {
  failures += proseHits.length;
  console.error(`FROZEN PRICES in src/data/articles.ts: ${proseHits.length}`);
  console.error(`  ${[...new Set(proseHits)].join(", ")}`);
  console.error("  fix: node scripts/strip-prose-prices.mjs");
}

// Editorial fields in the article template (callouts, spotlight rationale,
// section subtitles). The `detail`/`price` fields are legacy data the renderer
// deliberately ignores, so they are not flagged.
// Moved out of the blog route into src/data/ so the home page and blog index
// could read the same per-article product data for their cards.
const page = readFileSync(`${ROOT}src/data/article-sections.ts`, "utf8");
const editorial = [...page.matchAll(/(?:calloutBody|calloutTitle|why|subtitle):\s*"([^"]*)"/g)]
  .map((m) => m[1])
  .filter((t) => CENTS.test(t));
CENTS.lastIndex = 0;
if (editorial.length) {
  failures += editorial.length;
  console.error(`\nFROZEN PRICES in editorial copy (article-sections.ts): ${editorial.length}`);
  for (const t of editorial) console.error(`  "${t.slice(0, 110)}"`);
}

// ── 2. staleness of the catalog's prices ──────────────────────────────────
// Only priced products can be stale. An unpriced one already renders
// "Check price", which is the correct outcome rather than a problem.
const products = JSON.parse(readFileSync(`${ROOT}src/data/catalog.json`, "utf8")).products ?? {};
const priced = Object.values(products).filter((p) => p.price && p.priceAsOf);
const stale = priced.filter((p) => Date.now() - Date.parse(p.priceAsOf) > STALE_MS);
if (stale.length) {
  console.warn(
    `\nWARNING: ${stale.length}/${priced.length} catalog prices are older than 7 days ` +
    `and will render as "Check price" instead of a figure.`,
  );
  console.warn("  cause is usually the Canopy quota — see scripts/lib/canopy-quota.mjs");
}

// ── 3. "under $N" promises that products have outgrown ───────────────────
// A title is a claim. "Best Budget Tents Under $100" stops being true the day a
// featured tent passes $100, and nothing about live pricing fixes that — the
// grid just starts showing a number that contradicts the headline above it.
// This is the check that would have caught the camping-fans article claiming
// "all under $35" while three of its five fans sat at $36.99-$39.99.
const articlesSrc = readFileSync(`${ROOT}src/data/articles.ts`, "utf8");
const broken = [];
for (const chunk of articlesSrc.split(/\n\s*\{\s*\n\s*id: "/).slice(1)) {
  const slug = chunk.match(/slug: "([^"]+)"/)?.[1];
  const title = chunk.match(/title: "([^"]+)"/)?.[1] ?? "";
  const excerpt = chunk.match(/excerpt: "([^"]+)"/)?.[1] ?? "";
  /* A cap is a cap however it is worded.
   *
   * This matched only the literal phrase "under $N", so "7 Days of Budget
   * Camping Meals — $50 Total Food Budget" sailed past while FOUR of its six
   * products cost more than the entire budget the headline promises, one of
   * them $68.99. The check reported clean because of a preposition.
   *
   * "$N budget" and "for $N" are the same promise to a reader, so they are the
   * same claim here. Deliberately NOT matching a bare "$N" anywhere in a title —
   * "The $200 Setup" is a total, not a per-item ceiling, and treating every
   * figure as a cap would flag the correct articles as broken. */
  const claim = `${title} ${excerpt}`;
  const cap = Number((
    claim.match(/under \$(\d[\d,]*)/i)
    ?? claim.match(/\$(\d[\d,]*)\s+(?:total\s+)?\w*\s*budget/i)
    ?? claim.match(/(?:all|each|every)\s+(?:for\s+)?\$(\d[\d,]*)/i)
    ?? []
  )[1]?.replace(/,/g, ""));
  if (!slug || !cap) continue;

  const over = [...new Set([...chunk.matchAll(/\/dp\/(B[0-9A-Z]{9})/g)].map((m) => m[1]))]
    .map((asin) => products[asin])
    .filter((p) => p?.priceValue != null && p.priceValue > cap);

  if (over.length) {
    broken.push({ slug, cap, over });
  }
}
if (broken.length) {
  console.warn(`\nWARNING: ${broken.length} article(s) promise a price cap their products now exceed:`);
  for (const b of broken) {
    console.warn(`  ${b.slug} (claims under $${b.cap}):`);
    for (const p of b.over) console.warn(`    ${p.price.padEnd(9)} ${p.title.slice(0, 62)}`);
  }
  console.warn("  fix: swap the product, or reword the claim — the headline contradicts the grid.");
}

if (failures) {
  console.error(`\n${failures} frozen price claim(s). Every displayed price must come from src/data/catalog.json.`);
  process.exit(1);
}
console.log(
  `price claims clean — 0 frozen figures, ` +
  `${priced.length - stale.length}/${priced.length} catalog prices fresh ` +
  `(${Object.keys(products).length} products total)`,
);
