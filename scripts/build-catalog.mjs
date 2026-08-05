#!/usr/bin/env node
/**
 * Generate src/data/catalog.json — the one record per product the site renders.
 *
 *   node scripts/build-catalog.mjs
 *
 * Inputs (both already maintained):
 *   state/asin-cache.json        pipeline truth: verdicts, titles, prices, ratings
 *   src/data/product-images.json curated ASIN -> photo URL
 *
 * Output: catalog.json, keyed by ASIN. Nothing else in the site describes a
 * product, and every field a page can render comes from here.
 *
 * WHY ASIN AND NOT NAME: the previous design matched products by substring on
 * their display name — getProductLink("Teton Sports Celsius Regular") worked by
 * finding the key "Teton Sports". Two products sharing a brand word collided
 * silently, and any copy edit to a heading could repoint a link. An ASIN is the
 * product's actual identity, so a lookup either resolves or visibly does not.
 *
 * Separation of concerns is deliberate: state/asin-cache.json is pipeline
 * bookkeeping that six scripts write to, while catalog.json is published data
 * imported at build time. Same split as specs/ versus src/data/articles.ts.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { referencedAsins } from "./lib/referenced-asins.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const AFFILIATE_TAG = "camprally-20";

const cache = JSON.parse(readFileSync(`${ROOT}state/asin-cache.json`, "utf8")).entries ?? {};
const images = JSON.parse(readFileSync(`${ROOT}src/data/product-images.json`, "utf8")).images ?? {};

/* Only products the site actually points at. The cache also accumulates probe
 * ASINs and products from retired articles — publishing those would keep them
 * priced (and billed) forever, and an Echo Dot sat in the catalog this way. */
const referenced = referencedAsins(ROOT);

/* One photo cannot be two DIFFERENT products. The name-keyed map this replaced
 * had the Coleman Sundome's photo attached to a Klymit sleeping pad, so a grid
 * of "compared" products showed a tent where the pad should be. Refuse the
 * image rather than guess which ASIN owns it — an icon tile is honest, a photo
 * of the wrong product is not.
 *
 * Variants are the exception, and they are common enough to matter: Amazon
 * lists "Amazon Basics Camping Chair" and "Amazon Basics Camping Chair Large,
 * Mesh Back" under separate ASINs with one catalog photo, identical price and
 * the same 17,165 ratings. Dropping both would blank two tiles to protect
 * against a mix-up that did not happen.
 *
 * The titles decide it. One product's title being a prefix of the other's means
 * the same product at a different size or colour; the tent/pad case shares no
 * prefix at all and is still refused. */
const norm = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
function sameProduct(a, b) {
  const [x, y] = [norm(cache[a]?.title), norm(cache[b]?.title)].sort((p, q) => p.length - q.length);
  // A bare brand name ("coleman") would prefix half the catalog, so require
  // enough of a run to identify a specific product.
  return x.length >= 12 && y.startsWith(x);
}

const seen = new Map();
const contested = new Set();
for (const [asin, url] of Object.entries(images)) {
  const prior = seen.get(url);
  if (prior && !sameProduct(asin, prior)) {
    contested.add(url);
    console.warn(`  duplicate image: ${asin} and ${prior} are different products sharing a photo — dropping both`);
  } else if (prior) {
    console.log(`  shared photo: ${asin} and ${prior} are variants of one product — keeping`);
  }
  seen.set(url, asin);
}

const products = {};
for (const [asin, e] of Object.entries(cache)) {
  // A product we have never confirmed resolves is not publishable. DEAD entries
  // are kept in the cache on purpose (so we stop re-checking them) but must
  // never reach a page.
  if (e.verdict === "DEAD") continue;
  if (!referenced.has(asin)) continue;

  products[asin] = {
    asin,
    title: e.title ?? "",
    url: `https://www.amazon.com/dp/${asin}?tag=${AFFILIATE_TAG}`,
    image: contested.has(images[asin]) ? null : (images[asin] ?? null),
    price: e.price ?? null,
    priceValue: e.priceValue ?? null,
    rating: e.rating ?? null,
    ratingsTotal: e.ratingsTotal ?? null,
    priceAsOf: e.priceCheckedAt ?? null,
    verifiedAt: e.checkedAt ?? null,
  };
}

/* Rewrite only when a product actually changed.
 *
 * A generatedAt stamped on every run makes the file differ every run, which
 * means a no-op price check still produces a commit, a push, and a full Vercel
 * rebuild — and leaves callers unable to tell "prices moved" from "the script
 * ran". Comparing the products payload keeps the timestamp meaningful: it is
 * when the data last changed, not when the script last executed. */
const OUT = `${ROOT}src/data/catalog.json`;
const previous = (() => {
  try { return JSON.parse(readFileSync(OUT, "utf8")); } catch { return null; }
})();
const unchanged = previous && JSON.stringify(previous.products) === JSON.stringify(products);

const payload = {
  generatedAt: unchanged ? previous.generatedAt : new Date().toISOString(),
  note: "Generated by scripts/build-catalog.mjs from state/asin-cache.json + src/data/product-images.json. Do not edit by hand.",
  products,
};

mkdirSync(`${ROOT}src/data`, { recursive: true });
if (!unchanged) writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n");

const withPrice = Object.values(products).filter((p) => p.price).length;
const withImage = Object.values(products).filter((p) => p.image).length;
console.log(
  `catalog: ${Object.keys(products).length} products · ` +
  `${withPrice} priced · ${withImage} with photos` +
  (unchanged ? " · unchanged" : ""),
);
