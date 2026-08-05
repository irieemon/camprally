import { getCustomSections } from "@/data/article-sections";
import { productFor, withLivePrice } from "@/lib/catalog";

/**
 * The cheapest currently-quotable product in an article, for the "from $42"
 * line on a card.
 *
 * Same rule as everywhere else on the site: only prices that came from the
 * catalog and are still fresh count. An article whose products have all gone
 * stale returns null and its card simply shows no price rather than a number
 * we cannot stand behind.
 */
export function priceFromFor(slug: string): string | null {
  const values = getCustomSections(slug)
    .flatMap((s) => s.items ?? [])
    .map((i) => withLivePrice(productFor(i.asin ?? i.link))?.priceValue)
    .filter((v): v is number => typeof v === "number" && v > 0);

  if (!values.length) return null;
  const min = Math.min(...values);
  // Whole dollars on cards — cents are noise at this size and the exact figure
  // is one click away on the article itself.
  return `$${Math.round(min)}`;
}

/** How many products an article actually prices, for a "12 picks" style meta line. */
export function pickCountFor(slug: string): number {
  return getCustomSections(slug)
    .flatMap((s) => s.items ?? [])
    .filter((i) => productFor(i.asin ?? i.link)).length;
}
