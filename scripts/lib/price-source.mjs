/**
 * Live price and rating lookup for Amazon products.
 *
 * WHY NOT AMAZON'S OWN API: PA-API 5.0 shut down 2026-05-15. Its successor,
 * the Creators API, requires 10 qualified referral sales in the trailing 30
 * days — stricter than the 3 PA-API asked for. This account has 0, so the
 * first-party path is closed until the site converts. It is worth revisiting
 * the moment that threshold is crossed, because it is the only fully
 * compliant source of Product Advertising Content.
 *
 * WHY NOT SCRAPE IT OURSELVES: we already fetch the product page for ASIN
 * verification, so extracting price from that same response costs nothing
 * extra — which is the obvious idea and the reason this module supports it.
 * But it does not survive contact with reality: Amazon rate-limits a
 * residential IP after a few dozen product requests and the block lasted
 * three hours on 2026-08-04. Refreshing 48 ASINs weekly would keep us
 * permanently blocked, so this is the fallback, not the primary.
 *
 * PRIMARY: Canopy API. 100 requests/month free, $0.01 after. 48 ASINs
 * refreshed monthly costs nothing; weekly costs about a dollar. They absorb
 * the proxying and blocking, and return structured fields instead of CSS
 * selectors that break whenever Amazon reshuffles its markup.
 *
 * This module NEVER invents a price. Every function returns null on failure,
 * and callers fall back to whatever copy the article already had.
 */

import { verifyAsin, extractTitle, UA } from "./amazon.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const CANOPY_ENDPOINT = "https://graphql.canopyapi.co/";

export function canopyKey() {
  return process.env.CANOPY_API_KEY || null;
}

/**
 * Canopy GraphQL lookup.
 * @returns {Promise<null | {price:string, priceValue:number|null, rating:number|null, ratingsTotal:number|null, title:string, source:"canopy"}>}
 */
export async function fetchFromCanopy(asin) {
  const key = canopyKey();
  if (!key) return null;

  const query =
    "query amazonProduct($asin: String!) { amazonProduct(input: {asin: $asin}) " +
    "{ title rating ratingsTotal price { value currency display } } }";

  try {
    const res = await fetch(CANOPY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "API-KEY": key },
      body: JSON.stringify({ query, variables: { asin } }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.errors?.length) return null;

    const p = json.data?.amazonProduct;
    if (!p) return null;

    const display = p.price?.display ?? null;
    const value = typeof p.price?.value === "number" ? p.price.value : null;
    // A product with no price is out of stock or unavailable. Returning a
    // half-populated record would render a rating next to a blank price.
    if (!display && value === null) return null;

    return {
      price: display ?? `$${value.toFixed(2)}`,
      priceValue: value,
      rating: typeof p.rating === "number" ? p.rating : null,
      ratingsTotal: typeof p.ratingsTotal === "number" ? p.ratingsTotal : null,
      title: p.title ?? "",
      source: "canopy",
    };
  } catch {
    return null;
  }
}

/** Parse price/rating out of a product page we already had to fetch anyway. */
export function parseFromHtml(html) {
  // .a-offscreen is the accessibility copy of the buy-box price and has been
  // the most stable selector across Amazon's layout churn.
  const price =
    html.match(/class="a-offscreen">\s*(\$[0-9,]+\.[0-9]{2})/)?.[1] ??
    html.match(/"priceAmount"\s*:\s*([0-9.]+)/)?.[1]?.replace(/^/, "$") ??
    null;

  const rating = html.match(/([0-9.]+)\s+out of 5 stars/)?.[1] ?? null;
  const ratingsTotal = html.match(/([0-9,]+)\s+ratings/)?.[1] ?? null;

  if (!price) return null;
  return {
    price: price.startsWith("$") ? price : `$${price}`,
    priceValue: Number(price.replace(/[$,]/g, "")) || null,
    rating: rating ? Number(rating) : null,
    ratingsTotal: ratingsTotal ? Number(ratingsTotal.replace(/,/g, "")) : null,
    title: extractTitle(html),
    source: "amazon-direct",
  };
}

/** Direct Amazon fetch. Often throttled — treat null as "unknown", not "no price". */
export async function fetchFromAmazon(asin) {
  try {
    const { stdout } = await run(
      "curl",
      ["-s", "-L", "--max-time", "25", "-A", UA,
       "-H", "Accept-Language: en-US,en;q=0.9",
       `https://www.amazon.com/dp/${asin}`],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    // Throttle stubs are ~3.8KB and contain no product markup.
    if (stdout.length <= 6000) return null;
    return parseFromHtml(stdout);
  } catch {
    return null;
  }
}

/**
 * Best available price for an ASIN, trying sources in order of reliability.
 * Also returns the verification verdict so a single pass can confirm the link
 * is alive and price it at the same time.
 */
export async function fetchPrice(asin, { allowAmazonFallback = true } = {}) {
  const viaCanopy = await fetchFromCanopy(asin);
  if (viaCanopy) return viaCanopy;
  if (!allowAmazonFallback) return null;
  return await fetchFromAmazon(asin);
}

export { verifyAsin };
