/**
 * Product discovery via Canopy's Amazon search.
 *
 * This is the capability that makes the pipeline hands-off. Until now
 * write-article.mjs required a human to hand it `--products <asins>`, which
 * meant every new article needed someone to go shopping first. With search we
 * can ask for "camping chairs between $20 and $50", get real ASINs with real
 * prices and ratings, and let the model write about products that actually
 * exist at the price the article promises.
 *
 * It also fixes the inverse problem. On 2026-08-04 a live price refresh found
 * 26 of 47 featured products were off by more than 25% — an article titled
 * "Best Coolers Under $100" was recommending a $149.99 cooler and a $239 one.
 * Discovery lets us find replacements that actually fit the band instead of
 * quietly deleting the claim.
 *
 * BUDGET: each search is one Canopy request against a 100/month free tier.
 * Searches are therefore cached to disk — re-running a band costs nothing.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { canopyKey } from "./price-source.mjs";

const CACHE = new URL("../../state/discovery-cache.json", import.meta.url).pathname;
const ENDPOINT = "https://graphql.canopyapi.co/";

const SEARCH_QUERY = `
query search($term: String!, $min: Float, $max: Float) {
  amazonProductSearchResults(input: {
    domain: US
    searchTerm: $term
    refinements: { priceRange: { min: $min, max: $max } }
  }) {
    productResults {
      results {
        asin
        title
        rating
        ratingsTotal
        price { value display }
      }
    }
  }
}`;

function loadCache() {
  if (!existsSync(CACHE)) return {};
  try { return JSON.parse(readFileSync(CACHE, "utf8")); } catch { return {}; }
}

function saveCache(c) {
  mkdirSync(new URL("../../state/", import.meta.url).pathname, { recursive: true });
  writeFileSync(CACHE, JSON.stringify(c, null, 2) + "\n");
}

/**
 * Search Amazon for products in a price band.
 *
 * @returns {Promise<Array<{asin,title,price,priceValue,rating,ratingsTotal}>>}
 *          Empty array on any failure — callers must handle "found nothing"
 *          rather than receiving fabricated results.
 */
export async function discover(term, { min, max, force = false, nowIso } = {}) {
  const key = `${term}|${min ?? ""}|${max ?? ""}`;
  const cache = loadCache();
  if (!force && cache[key]) return cache[key].results;

  const apiKey = canopyKey();
  if (!apiKey) return [];

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "API-KEY": apiKey },
      body: JSON.stringify({ query: SEARCH_QUERY, variables: { term, min, max } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (json.errors?.length) {
      console.error(`  search error: ${json.errors[0]?.message?.slice(0, 140)}`);
      return [];
    }

    const raw = json.data?.amazonProductSearchResults?.productResults?.results ?? [];
    const results = raw
      .filter((p) => p?.asin && typeof p.price?.value === "number")
      // Amazon's price refinement is advisory — it returns near-misses. Enforce
      // the band ourselves, since the whole point is honouring the article's
      // stated price promise.
      .filter((p) => (min == null || p.price.value >= min) && (max == null || p.price.value <= max))
      // Sponsored and no-review listings are noise; a product with real reviews
      // is both a safer recommendation and likelier to still exist next month.
      .filter((p) => (p.ratingsTotal ?? 0) >= 50)
      .map((p) => ({
        asin: p.asin,
        title: p.title ?? "",
        price: p.price.display ?? `$${p.price.value.toFixed(2)}`,
        priceValue: p.price.value,
        rating: typeof p.rating === "number" ? p.rating : null,
        ratingsTotal: p.ratingsTotal ?? 0,
      }))
      // Best-rated first, with review count breaking ties.
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.ratingsTotal - a.ratingsTotal);

    cache[key] = { term, min, max, fetchedAt: nowIso ?? null, results };
    saveCache(cache);
    return results;
  } catch {
    return [];
  }
}

/**
 * Parse a price ceiling out of an article title or slug.
 * "Best Camping Coolers Under $100" -> 100 ; "...under-50" -> 50
 */
export function priceCeiling(text) {
  const m =
    text.match(/under\s*\$?\s*(\d+)/i) ??
    text.match(/under-(\d+)/i) ??
    text.match(/\$(\d+)\s*(?:or less|and under)/i);
  return m ? Number(m[1]) : null;
}
