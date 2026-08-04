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
const page = readFileSync(`${ROOT}src/app/blog/[slug]/page.tsx`, "utf8");
const editorial = [...page.matchAll(/(?:calloutBody|calloutTitle|why|subtitle):\s*"([^"]*)"/g)]
  .map((m) => m[1])
  .filter((t) => CENTS.test(t));
CENTS.lastIndex = 0;
if (editorial.length) {
  failures += editorial.length;
  console.error(`\nFROZEN PRICES in editorial copy (page.tsx): ${editorial.length}`);
  for (const t of editorial) console.error(`  "${t.slice(0, 110)}"`);
}

// ── 2. staleness of the live price file ───────────────────────────────────
const prices = JSON.parse(readFileSync(`${ROOT}src/data/prices.json`, "utf8")).prices ?? {};
const entries = Object.entries(prices);
const stale = entries.filter(([, p]) => Date.now() - Date.parse(p.asOf) > STALE_MS);
if (stale.length) {
  console.warn(
    `\nWARNING: ${stale.length}/${entries.length} live prices are older than 7 days ` +
    `and will render as "Check price" instead of a figure.`,
  );
  console.warn("  cause is usually the Canopy quota — see scripts/lib/canopy-quota.mjs");
}

if (failures) {
  console.error(`\n${failures} frozen price claim(s). Every displayed price must come from src/data/prices.json.`);
  process.exit(1);
}
console.log(
  `price claims clean — 0 frozen figures, ` +
  `${entries.length - stale.length}/${entries.length} live prices fresh`,
);
