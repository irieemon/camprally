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
import { displayMaxAgeHours } from "./lib/display-window.mjs";
import { fetchPrice, canopyKey } from "./lib/price-source.mjs";
import { sleep, EXIT } from "./lib/amazon.mjs";
import { loadCache, saveCache } from "./lib/asin-cache.mjs";
import { referencedAsins } from "./lib/referenced-asins.mjs";

const ROOT = new URL("..", import.meta.url).pathname;

const args = process.argv.slice(2);
const ALL = args.includes("--all");
const DRY = args.includes("--dry-run");
const LIMIT_ARG = Number(args[args.indexOf("--limit") + 1]) || null;

/*
 * Re-price anything older than this.
 *
 * 168h (7 days) against the render layer's 10-day display window, leaving three
 * days of margin. Those two must never be equal: they were both 7 days once,
 * which meant a price became undisplayable on exactly the day it became
 * eligible for refresh, so a single missed cron blanked prices site-wide.
 * Refresh always runs ahead of the display cutoff.
 *
 * WAS 120h until 2026-08-11. The header of this file has always described
 * "weekly" as the default and quoted its cost; the constant said 5 days. At 130
 * tracked ASINs that gap was about $3/mo and widening, because the bill scales
 * with CATALOG SIZE, not with publishing cadence — every product ever published
 * needs re-pricing forever, and the catalogue only grows. Measured at $0.01/req
 * on pay-as-you-go: 5-day rotation projects ~$25/mo by month three, 7-day
 * ~$18/mo.
 *
 * Do NOT buy further savings by widening the display window instead. Ten days
 * is already generous for a price presented as current, and the whole catalogue
 * layer exists because an article once showed $39 for a bag selling at $94.
 *
 * Pay-as-you-go was enabled 2026-08-04 after the hard 100/mo free cap ate the
 * whole allowance by the 4th and stalled publishing for the month. If billing
 * ever lapses the quota ledger (lib/canopy-quota.mjs) self-arms on the first
 * 402 and the pipeline falls back to cached products — degraded, not dead.
 */
const STALE_HOURS = Number(process.env.PRICE_STALE_HOURS) || 168;

/* Read from the render layer, never restated — see lib/display-window.mjs. */
const DISPLAY_MAX_AGE_HOURS = displayMaxAgeHours();
if (STALE_HOURS >= DISPLAY_MAX_AGE_HOURS) {
  console.error(
    `PRICE_STALE_HOURS (${STALE_HOURS}h) is not below the display cutoff ` +
    `(${DISPLAY_MAX_AGE_HOURS}h). Prices would expire the moment they became ` +
    `eligible for refresh, and one missed run would blank the site.`,
  );
  process.exit(EXIT.FAIL);
}

/* walk() lived here until 2026-08-11. It was the old file-scanning way of
 * finding ASINs, superseded by lib/referenced-asins.mjs, and every identifier
 * in its body — readdirSync, statSync, join, extname, EXT — had already lost
 * its import. It could only ever have thrown a ReferenceError. Deleted rather
 * than repaired: nothing calls it. */

const asins = referencedAsins(ROOT);

const cache = loadCache();
const now = new Date();
const nowIso = now.toISOString();

const ageHours = (a) => {
  const at = cache.entries[a]?.priceCheckedAt;
  return at ? (now - Date.parse(at)) / 3_600_000 : Infinity;
};

/* The full backlog, BEFORE the per-run cap. Slicing first hid this number, and
 * it is the one that says whether the cap is keeping up. */
const backlog = [...asins]
  .filter((a) => ageHours(a) >= STALE_HOURS)
  .sort((a, b) => ageHours(b) - ageHours(a)); // oldest first — they expire soonest

/*
 * The cap SIZES ITSELF to the catalogue instead of sitting at a fixed 40.
 *
 * 40 was chosen when ~50 ASINs were tracked. It is a spend guard, but it was
 * quietly doing a second job nobody had written down: at a fixed 40 per run the
 * pipeline can only keep (40 x runs/day x rotation-days) products fresh, so
 * past roughly 560 ASINs it would fall permanently behind and prices would
 * start vanishing from the site with no warning anywhere. The catalogue reached
 * 130 in its first week and grows about four per article, so that ceiling was
 * roughly ten weeks out.
 *
 * Sizing to the arrival rate keeps the guard honest: a run asks for what one
 * rotation actually requires, plus half again to absorb catch-up after an
 * outage, and never more than HARD_CEILING. The ceiling is what bounds a
 * runaway — worth having explicitly, because pay-as-you-go inverted the old
 * failure mode: the free tier failed CLOSED and stopped working loudly, while
 * PAYG fails OPEN and simply bills.
 */
const HARD_CEILING = 200;            // ~$2/run worst case at $0.01/request
const perRotation = asins.size / (STALE_HOURS / 24);
const LIMIT = LIMIT_ARG ?? (ALL ? Infinity : Math.min(HARD_CEILING, Math.ceil(perRotation * 1.5)));

const stale = backlog.slice(0, LIMIT);

const usingCanopy = Boolean(canopyKey());
console.log(
  `${asins.size} ASIN(s) tracked · ${backlog.length} stale · pricing ${stale.length} ` +
  `(cap ${LIMIT === Infinity ? "none" : LIMIT}) · ` +
  `source: ${usingCanopy ? "Canopy API" : "Amazon direct (no CANOPY_API_KEY — expect throttling)"}`,
);

/*
 * Two distinct warnings, because they mean different things.
 *
 * `expiring` is measured against the DISPLAY cutoff and is the one that
 * matters: those products are about to stop showing a price on the live site,
 * or already have. `behind` says the cap deferred work this run, which is
 * survivable for a run or two and only becomes expiring if it persists.
 */
const expiring = [...asins].filter((a) => ageHours(a) >= DISPLAY_MAX_AGE_HOURS * 0.8);
const behind = backlog.length > stale.length;
if (behind) {
  console.log(
    `  ⚠ cap deferred ${backlog.length - stale.length} ASIN(s) to a later run. ` +
    `At ${asins.size} tracked and a ${+(STALE_HOURS / 24).toFixed(1)}-day rotation this run needs ` +
    `~${Math.ceil(perRotation)}/day to keep up.`,
  );
}
if (expiring.length) {
  console.log(
    `  ⚠ ${expiring.length} ASIN(s) are within 20% of the ${DISPLAY_MAX_AGE_HOURS / 24}-day ` +
    `display cutoff — their prices are about to disappear from the site. ` +
    `Oldest: ${Math.round(Math.max(...expiring.map(ageHours)) / 24)}d.`,
  );
}

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
