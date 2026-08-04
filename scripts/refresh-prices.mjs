#!/usr/bin/env node
/**
 * Refresh live prices and ratings, then emit what the site renders.
 *
 *   node scripts/refresh-prices.mjs               # respects the free-tier budget
 *   node scripts/refresh-prices.mjs --limit 20
 *   node scripts/refresh-prices.mjs --all         # ignore the budget
 *   node scripts/refresh-prices.mjs --dry-run
 *
 * Writes two files, deliberately separated:
 *   state/asin-cache.json  pipeline bookkeeping (verdicts, timestamps, sources)
 *   src/data/catalog.json  the published ASIN-keyed catalog the site imports
 *                          at build time (regenerated via build-catalog.mjs)
 *
 * The site is statically generated, so the delivery path is:
 *   refresh -> commit -> push -> Vercel rebuild -> pages show current prices
 *
 * BUDGET: Canopy's free tier is 100 requests/month. 48 ASINs refreshed weekly
 * is 192/month, roughly $1 at $0.01 over the free allowance. The default limit
 * keeps a single run inside the free tier; --all opts into spending.
 *
 * Never fabricates. An ASIN we could not price keeps whatever the article
 * already said, and the page labels it as indicative rather than current.
 */

import { execFileSync } from "node:child_process";
import { fetchPrice, canopyKey } from "./lib/price-source.mjs";
import { sleep, EXIT } from "./lib/amazon.mjs";
import { loadCache, saveCache } from "./lib/asin-cache.mjs";
import { referencedAsins } from "./lib/referenced-asins.mjs";

const ROOT = new URL("..", import.meta.url).pathname;

const args = process.argv.slice(2);
const ALL = args.includes("--all");
const DRY = args.includes("--dry-run");
const LIMIT = Number(args[args.indexOf("--limit") + 1]) || (ALL ? Infinity : 40);
/*
 * Re-price anything older than this.
 *
 * Budget maths against Canopy's 100 free requests/month for ~50 ASINs:
 *   every 20h  ~1,440 req/mo  ~$13.40/mo   too eager
 *   weekly       ~215 req/mo   ~$1.15/mo   good balance  <-- default
 *   monthly       ~50 req/mo      free     prices drift badly between runs
 *
 * Weekly assumes pay-as-you-go billing on the Canopy account, which Sean
 * enabled 2026-08-04 after the hard 100/mo cap ate the whole allowance by the
 * 4th and stalled publishing for the month. If billing ever lapses, the quota
 * ledger (lib/canopy-quota.mjs) self-arms on the first 402 and the pipeline
 * falls back to cached products — degraded, not dead. Override with
 * PRICE_STALE_HOURS to trade cost for freshness.
 */
/*
 * 120h (5 days) against the render layer's 10-day display window. The two used
 * to both be 7 days, which meant a price became undisplayable on exactly the
 * day it became eligible for refresh — one missed cron and prices blank out
 * site-wide. Refresh must always run ahead of the display cutoff.
 *
 * ~88 tracked ASINs at 5-day staleness is roughly 18 lookups/day, ~530/month,
 * so ~$4-5/mo against Canopy's 100-free-then-pay-as-you-go pricing. Raise
 * PRICE_STALE_HOURS to trade freshness for cost.
 */
const STALE_HOURS = Number(process.env.PRICE_STALE_HOURS) || 120;

function walk(dir) {
  return readdirSync(dir).flatMap((e) => {
    const f = join(dir, e);
    return statSync(f).isDirectory() ? walk(f) : EXT.has(extname(f)) ? [f] : [];
  });
}

const asins = referencedAsins(ROOT);

const cache = loadCache();
const now = new Date();
const nowIso = now.toISOString();

const stale = [...asins]
  .filter((a) => {
    const at = cache.entries[a]?.priceCheckedAt;
    return !at || (now - Date.parse(at)) / 3_600_000 >= STALE_HOURS;
  })
  .slice(0, LIMIT);

const usingCanopy = Boolean(canopyKey());
console.log(
  `${asins.size} ASIN(s) tracked · ${stale.length} need pricing · ` +
  `source: ${usingCanopy ? "Canopy API" : "Amazon direct (no CANOPY_API_KEY — expect throttling)"}`,
);

if (DRY) {
  console.log(`[dry run] would price: ${stale.join(", ") || "(none)"}`);
  process.exit(EXIT.OK);
}

let priced = 0, failed = 0;
for (const asin of stale) {
  const r = await fetchPrice(asin);
  if (r) {
    priced++;
    cache.entries[asin] = {
      ...(cache.entries[asin] ?? { verdict: "LIVE", checkedAt: nowIso }),
      // A successful price lookup is also proof the listing resolves.
      verdict: "LIVE",
      checkedAt: nowIso,
      title: r.title || cache.entries[asin]?.title || "",
      price: r.price,
      priceValue: r.priceValue,
      rating: r.rating,
      ratingsTotal: r.ratingsTotal,
      priceCheckedAt: nowIso,
      priceSource: r.source,
    };
    console.log(`  ${asin}  ${r.price}${r.rating ? `  ${r.rating}★` : ""}  (${r.source})`);
  } else {
    failed++;
    console.log(`  ${asin}  no price available`);
  }
  // Canopy tolerates bursts; direct Amazon does not.
  await sleep(usingCanopy ? 250 : 1500);
}

saveCache(cache);

// Regenerate the published catalog from the cache we just updated. Kept in its
// own script so the catalog can be rebuilt (after a product-image edit, say)
// without spending Canopy requests re-pricing anything.
execFileSync("node", [`${ROOT}scripts/build-catalog.mjs`], { stdio: "inherit" });

console.log(`\npriced ${priced} · failed ${failed}`);
if (priced === 0 && stale.length > 0) {
  console.log(
    usingCanopy
      ? "\nNothing priced — check CANOPY_API_KEY and remaining quota."
      : "\nNothing priced — Amazon is throttling. Set CANOPY_API_KEY for a reliable source.",
  );
  process.exit(EXIT.DEFER);
}
process.exit(EXIT.OK);
