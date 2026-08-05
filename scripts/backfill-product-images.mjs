#!/usr/bin/env node
/**
 * Fill in missing product photographs in src/data/product-images.json.
 *
 *   node scripts/backfill-product-images.mjs             # only ASINs with no photo
 *   node scripts/backfill-product-images.mjs --limit 10  # cap the run
 *   node scripts/backfill-product-images.mjs --all       # re-fetch everything
 *   node scripts/backfill-product-images.mjs --dry-run
 *
 * product-images.json is hand-maintained, so it lagged the catalog badly: 46 of
 * 73 referenced products had no photo and rendered an icon tile. That was
 * survivable while photos only appeared inside an article, but the card grids
 * on the home page and blog index lead with the image, and a grid of icon tiles
 * does not read as a store.
 *
 * The photo is scraped from the same product page verify-asins.mjs already
 * fetches to confirm the ASIN is live, so this costs no API quota. It is
 * separate from that script because it is a backfill: run it when products are
 * added, not on every cycle.
 *
 * Fails safe in every direction. A throttled or unparseable page leaves the
 * ASIN untouched and the run reports it, so re-running only retries what is
 * still missing. Nothing is ever overwritten with null.
 *
 * Wired into run-cycle.mjs twice: once before the queue check, to retry gaps an
 * earlier run was throttled out of, and once after a publish, which is the
 * first moment that article's ASINs count as referenced. Both calls are no-ops
 * — no network at all — when nothing is missing.
 *
 * Exit codes: 0 OK (even with some misses) · 2 nothing resolved, retry later
 */

import { readFileSync, writeFileSync } from "node:fs";
import { verifyAsin, sleep, EXIT } from "./lib/amazon.mjs";
import { referencedAsins } from "./lib/referenced-asins.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const IMAGES = `${ROOT}src/data/product-images.json`;

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const ALL = argv.includes("--all");
const limitAt = argv.indexOf("--limit");
const LIMIT = limitAt === -1 ? Infinity : Number(argv[limitAt + 1]);

const doc = JSON.parse(readFileSync(IMAGES, "utf8"));
const images = doc.images ?? {};
const cache = JSON.parse(readFileSync(`${ROOT}state/asin-cache.json`, "utf8")).entries ?? {};

/* Same source of truth build-catalog uses. Fetching anything else would put
 * photos in the file for products no page references — the exact drift that let
 * a probe ASIN sit in the catalog being re-priced forever. */
const referenced = [...referencedAsins(ROOT)]
  .filter((asin) => cache[asin]?.verdict !== "DEAD")
  .filter((asin) => ALL || !images[asin])
  .slice(0, LIMIT);

if (!referenced.length) {
  console.log("every referenced product already has a photo — nothing to do");
  process.exit(EXIT.OK);
}

console.log(`fetching ${referenced.length} product page(s)…\n`);

const found = new Map();
const missed = [];

for (const [i, asin] of referenced.entries()) {
  const label = `[${String(i + 1).padStart(2)}/${referenced.length}] ${asin}`;
  const r = await verifyAsin(asin, { retries: 3, baseDelayMs: 2000, timeoutSec: 30 });

  if (r.verdict === "LIVE" && r.image) {
    found.set(asin, r.image);
    console.log(`${label}  OK    ${(r.title ?? "").slice(0, 52)}`);
  } else {
    missed.push([asin, r.verdict === "LIVE" ? "no image on page" : (r.reason ?? r.verdict)]);
    console.log(`${label}  MISS  ${r.verdict === "LIVE" ? "no image on page" : r.reason}`);
  }

  // Pace deliberately. These pages are ~2.4MB and Amazon throttles a fast
  // client by serving a stub, which would turn a good ASIN into a MISS.
  if (i < referenced.length - 1) await sleep(1200);
}

/* One photo cannot belong to two products. build-catalog drops both sides of a
 * contested URL, so catching it here — where we can say which pair collided —
 * is friendlier than watching two tiles silently go blank after a rebuild.
 * Variants of one product (colour, size) legitimately share a photo. */
// Merge before grouping. Scanning the two sources as one list counted every
// re-fetched ASIN twice and reported it as colliding with itself.
const merged = { ...images, ...Object.fromEntries(found) };
const byUrl = new Map();
for (const [asin, url] of Object.entries(merged)) {
  if (!byUrl.has(url)) byUrl.set(url, []);
  byUrl.get(url).push(asin);
}
const collisions = [...byUrl.entries()].filter(([, asins]) => asins.length > 1);

console.log(`\nresolved ${found.size}/${referenced.length}`);
if (missed.length) {
  console.log(`\nstill missing (re-run to retry):`);
  for (const [asin, why] of missed) console.log(`  ${asin}  ${why}`);
}
if (collisions.length) {
  console.log(`\nWARNING — shared photos, build-catalog will drop both sides:`);
  for (const [url, asins] of collisions) console.log(`  ${asins.join(" + ")}\n    ${url}`);
}

if (DRY) {
  console.log("\n[dry run] product-images.json not written");
  process.exit(EXIT.OK);
}
if (!found.size) {
  // DEFER, not FAIL. The overwhelming cause is Amazon throttling, which is
  // transient by definition, and run-cycle reads these codes: FAIL would raise
  // a blocker needing a human over a missing thumbnail.
  console.error("\nnothing resolved — not writing");
  process.exit(EXIT.DEFER);
}

// Sorted so the diff of a backfill is readable rather than append-ordered.
doc.images = Object.fromEntries(
  Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(IMAGES, JSON.stringify(doc, null, 2) + "\n");
console.log(`\nwrote ${found.size} photo(s) to src/data/product-images.json`);
console.log("next: node scripts/build-catalog.mjs");
