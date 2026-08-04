#!/usr/bin/env node
/**
 * Remove hardcoded product prices (and the star ratings quoted beside them)
 * from legacy article prose.
 *
 *   node scripts/strip-prose-prices.mjs --dry-run
 *   node scripts/strip-prose-prices.mjs
 *
 * Why this exists: a spotlight card quoted $34.99 for a sleeping bag that was
 * $94.99 on Amazon. The rendered components now read exclusively from
 * src/data/prices.json, but prose written before that rule still asserts
 * figures nothing refreshes — "the Etekcity canister stove at $12.99" is a
 * claim the site cannot keep true, and the Associates agreement does not allow
 * presenting non-API prices as current.
 *
 * Every article's live price grid sits above the body, so removing the frozen
 * numbers loses no information: the reader still sees a price, just a real one.
 *
 * Only cent-precision figures ($12.99) are touched — those are always specific
 * product claims. Round thresholds ("tents under $100", "$5 gas-station
 * multi-tools") are category language that stays true and stays put.
 */

import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../src/data/articles.ts", import.meta.url).pathname;
const DRY = process.argv.includes("--dry-run");

const P = String.raw`\$[\d,]+\.\d{2}`; // cent-precision only

/** [description, pattern, replacement] applied in order. */
const rules = [
  // "**$31.95 | Rating: 4.8★**" — a whole spec line superseded by the live grid.
  ["spec line (price | rating)", new RegExp(String.raw`^\*\*${P} \| Rating: [\d.]+★\*\*\n`, "gm"), ""],

  // "**Price:** $19.99 | **Rating:** 4.4/5 | **Battery:** 25 hours"
  // Drop the price and rating fields; keep any real spec that follows.
  // Removing both fields can empty the line entirely; the \n{3,} tidy below
  // collapses the gap, so no separate blank-line rule is needed.
  ["Price/Rating fields", new RegExp(String.raw`\*\*Price:\*\* ${P} \| \*\*Rating:\*\* [\d.]+/5(?: \| )?`, "g"), ""],

  // "**Total: $192.93**" — a sum of seven frozen prices.
  ["frozen total", new RegExp(String.raw`^\*\*Total: ${P}\*\*\n`, "gm"), ""],

  // "1. **Shelter** - Coleman Sundome 2P: $49.99"
  ["list item price", new RegExp(String.raw`: ${P}$`, "gm"), ""],

  // "[YETI Trailhead Camp Chair $149.95](https://...)"
  ["price in link text", new RegExp(String.raw` ${P}(?=\]\()`, "g"), ""],

  // "**SteriPEN Ultra ($99.99)** kills"
  ["parenthetical price", new RegExp(String.raw` \(${P}\)`, "g"), ""],

  // "the Etekcity canister stove at $12.99 boils water" / "for $34.99."
  ["inline at/for price", new RegExp(String.raw` (?:at|for) ${P}`, "g"), ""],

  // Savings claim derived from two prices that have both moved since.
  ["derived savings claim", /If you want to save \$5 and skip the lantern/g,
   "If you do not need the built-in lantern"],
];

let src = readFileSync(FILE, "utf8");
const before = src;
const report = [];

for (const [name, pattern, replacement] of rules) {
  const hits = (src.match(pattern) ?? []).length;
  if (hits) report.push(`  ${String(hits).padStart(3)}  ${name}`);
  src = src.replace(pattern, replacement);
}

/* Tidy only the artifacts the removals leave behind, and only mid-line: a
 * naive / {2,}/ also eats the TypeScript file's own indentation, which shows up
 * as a 700-line whitespace diff around a 31-line content change. Both lookarounds
 * are required — they pin the match between two non-space characters. */
src = src
  .replace(/(?<=\S) {2,}(?=\S)/g, " ")
  // (?!\d) keeps product names intact: "UltraLite .5" and "UltraLite .7" are
  // size designations, not stray spaces before a full stop.
  .replace(/(?<=\S) +([.,])(?!\d)/g, "$1")
  .replace(/\n{3,}/g, "\n\n");

const remaining = (src.match(new RegExp(P, "g")) ?? []).length;

console.log("stripped:");
console.log(report.join("\n") || "  (nothing matched)");
console.log(`\ncent-precision figures remaining in prose: ${remaining}`);

if (DRY) {
  console.log("\n(dry run — nothing written)");
} else if (src !== before) {
  writeFileSync(FILE, src);
  console.log(`\nwrote ${FILE}`);
} else {
  console.log("\nno changes needed");
}
