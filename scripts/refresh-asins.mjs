#!/usr/bin/env node
/**
 * Re-verify a small batch of the stalest ASINs and update the cache.
 *
 * Designed to be run on a slow cron (a few times a day). It deliberately
 * checks only a handful per run: Amazon rate-limits a residential IP after a
 * few dozen product requests and the block then lasts hours, which would
 * starve the publish pipeline. Small, frequent batches stay under the limit.
 *
 *   node scripts/refresh-asins.mjs           # refresh default batch
 *   node scripts/refresh-asins.mjs --limit 3
 *   node scripts/refresh-asins.mjs --all     # every ASIN, ignores staleness
 *
 * Exit codes:
 *   0  ran (possibly refreshed nothing because nothing was stale)
 *   1  at least one ASIN is confirmed DEAD — needs a human
 *   2  throttled before confirming anything — retry later
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { verifyAsin, sleep, EXIT } from "./lib/amazon.mjs";
import { loadCache, saveCache, record, get, stalest, ageDays, STALE_AFTER_DAYS } from "./lib/asin-cache.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
// Scan specs/ as well as src/. An unpublished article's ASINs only exist in
// its spec, and publish-article fails closed on ASINs it has never confirmed —
// so without this the cron could never verify them and the cycle would defer
// forever, waiting on a check that was never going to run.
const SCAN_DIRS = [`${ROOT}src`, `${ROOT}specs`];
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".json"]);

const args = process.argv.slice(2);
const ALL = args.includes("--all");
const LIMIT = Number(args[args.indexOf("--limit") + 1]) || (ALL ? Infinity : 6);

/* Rejected drafts are not part of the site.
 *
 * specs/quarantine holds articles the content review refused, and they keep
 * their product lists. Walking into it would put those ASINs back in the
 * refresh rotation permanently — the same self-perpetuating set that had an
 * unreferenced Echo Dot billing a price lookup on every run. */
const SKIP_DIRS = new Set(["quarantine"]);

function walk(dir) {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    if (SKIP_DIRS.has(e)) return [];
    return statSync(full).isDirectory() ? walk(full)
      : CODE_EXT.has(extname(full)) ? [full] : [];
  });
}

const asins = new Set();
for (const dir of SCAN_DIRS) {
  if (!existsSync(dir)) continue;
  for (const file of walk(dir)) {
    const text = readFileSync(file, "utf8");
    for (const [, a] of text.matchAll(/\/dp\/(B[0-9A-Z]{9})/g)) asins.add(a);
    // Spec files carry ASINs as bare fields too, not only inside URLs.
    for (const [, a] of text.matchAll(/"asin"\s*:\s*"(B[0-9A-Z]{9})"/g)) asins.add(a);
  }
}

const now = new Date();
const nowIso = now.toISOString();
const cache = loadCache();

const batch = ALL ? [...asins] : stalest(cache, asins, now.getTime(), LIMIT);

if (batch.length === 0) {
  const oldest = [...asins]
    .map((a) => ageDays(get(cache, a), now.getTime()))
    .sort((x, y) => y - x)[0] ?? 0;
  console.log(
    `Nothing stale. ${asins.size} ASIN(s) tracked, oldest check ${oldest.toFixed(1)}d ago ` +
    `(threshold ${STALE_AFTER_DAYS}d).`,
  );
  process.exit(EXIT.OK);
}

console.log(`Refreshing ${batch.length} of ${asins.size} ASIN(s)...\n`);

let confirmed = 0, throttled = 0;
const dead = [];

for (const asin of batch) {
  const r = await verifyAsin(asin);
  if (r.verdict === "UNKNOWN") {
    throttled++;
    console.log(`UNKNOWN  ${asin}  ${r.reason}`);
    // Once Amazon starts stubbing, every subsequent request this run will be
    // stubbed too. Stop rather than burn the batch and deepen the block.
    if (throttled >= 2) {
      console.log(`\nThrottled — stopping early to avoid deepening the block.`);
      break;
    }
  } else {
    confirmed++;
    record(cache, asin, r, nowIso);
    if (r.verdict === "DEAD") dead.push(asin);
    console.log(`${r.verdict.padEnd(8)} ${asin}  ${r.title ?? r.reason}`);
  }
  await sleep(1200);
}

saveCache(cache);

const tracked = Object.keys(cache.entries).length;
console.log(`\nconfirmed ${confirmed}   throttled ${throttled}   cache now holds ${tracked}/${asins.size}`);

if (dead.length) {
  console.log(`\nDEAD LINKS — these need fixing:`);
  for (const a of dead) console.log(`  ${a}`);
  process.exit(EXIT.FAIL);
}
if (confirmed === 0) {
  console.log(`\nNothing confirmed this run (throttled). Retry later.`);
  process.exit(EXIT.DEFER);
}
process.exit(EXIT.OK);
