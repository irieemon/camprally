#!/usr/bin/env node
/**
 * Verify every Amazon ASIN referenced in src/ actually resolves.
 *
 * Exists because of the art-022 incident (2026-04-11): five affiliate links
 * shipped pointing at B00NPLUG9C, a dead ASIN. A later audit found 28 of 70
 * ASINs (40%) were dead across 14 articles, unnoticed for months.
 *
 *   node scripts/verify-asins.mjs             # audit every ASIN in src/
 *   node scripts/verify-asins.mjs B014LSDUA8  # check specific ASINs
 *
 * Exit codes (see lib/amazon.mjs):
 *   0  all confirmed live
 *   1  at least one confirmed DEAD — a real broken link
 *   2  inconclusive (Amazon throttling) — retry later, not a link problem
 *
 * The 1 vs 2 split matters: a cron that treats throttling as failure will cry
 * wolf every time Amazon rate-limits, and one that treats it as success will
 * ship dead links.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { verifyMany, summarize, EXIT } from "./lib/amazon.mjs";

const SRC = new URL("../src", import.meta.url).pathname;
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx"]);

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory()
      ? walk(full)
      : CODE_EXT.has(extname(full))
        ? [full]
        : [];
  });
}

function collectAsins() {
  const found = new Map(); // asin -> Set of files
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const [, asin] of text.matchAll(/\/dp\/(B[0-9A-Z]{9})/g)) {
      if (!found.has(asin)) found.set(asin, new Set());
      found.get(asin).add(file.replace(SRC, "src"));
    }
  }
  return found;
}

const explicit = process.argv.slice(2);
const targets = explicit.length
  ? new Map(explicit.map((a) => [a, new Set(["(cli)"])]))
  : collectAsins();

if (targets.size === 0) {
  console.log("No ASINs found in src/.");
  process.exit(EXIT.OK);
}

console.log(`Verifying ${targets.size} ASIN(s) against Amazon...\n`);

const results = await verifyMany([...targets.keys()], {
  onResult: (asin, r) => {
    const line =
      r.verdict === "LIVE"
        ? `LIVE     ${asin}  ${r.title.slice(0, 68)}`
        : `${r.verdict.padEnd(8)} ${asin}  ${r.reason}`;
    console.log(line);
  },
});

const { live, dead, unknown } = summarize(results);
console.log(`\nLIVE ${live.length}   DEAD ${dead.length}   UNKNOWN ${unknown.length}`);

for (const [label, rows] of [["DEAD", dead], ["UNKNOWN", unknown]]) {
  if (!rows.length) continue;
  console.log(`\n${label}:`);
  for (const [asin, r] of rows) {
    console.log(`  ${asin} — ${r.reason}`);
    for (const f of targets.get(asin) ?? []) console.log(`    ${f}`);
  }
}

if (dead.length) {
  console.log(`\nFAILED: ${dead.length} confirmed dead link(s). Fix before shipping.`);
  process.exit(EXIT.FAIL);
}
if (unknown.length) {
  console.log(
    `\nINCONCLUSIVE: ${unknown.length} ASIN(s) could not be confirmed (Amazon throttling).` +
    `\nThis is not a link failure — re-run later. Exiting ${EXIT.DEFER} (defer).`,
  );
  process.exit(EXIT.DEFER);
}
console.log(`\nAll ${live.length} ASIN(s) confirmed live.`);
