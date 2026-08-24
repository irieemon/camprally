/*
 * Hero photograph per article slug.
 *
 * Lifted out of the article template so the home page and blog index can render
 * the same image on their cards. Cards without a photo were the single biggest
 * reason the site read as a blog rather than a gear store, and the pictures
 * already existed — they were just locked inside the article route.
 *
 * Surfacing them exposed two problems that had been invisible while the map was
 * only ever read one article at a time:
 *
 *   1. Three URLs 404'd (headlamps, rain gear, water filtration). On the
 *      article page that produced a dark band nobody looked twice at; on a card
 *      it is an empty grey tile in the middle of a grid.
 *   2. Eighteen of the 24 entries shared a photo with at least one other
 *      article, and three more slugs were missing entirely and fell through to
 *      `default`. A category listing rendered the same marshmallow picture on
 *      two adjacent cards.
 *
 * Every slug below now has its own topical photograph. All URLs were verified
 * with a request and reviewed as contact sheets before being assigned — an
 * images.unsplash.com URL returns 200 for essentially any well-formed photo id,
 * so "it resolves" is not evidence that it shows what you think it shows.
 *
 * KEEP THESE UNIQUE. If you add an article, add a hero with it.
 */
export const HERO_IMAGES: Record<string, string> = {
  // ── Shelter ──────────────────────────────────────────────────────────────
  "best-budget-tents-under-100":          "https://images.unsplash.com/photo-1478827536114-da961b7f86d2?w=1200&q=80",
  "cheapest-camping-setup-for-beginners": "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=1200&q=80",
  "how-to-start-camping-no-gear":         "https://images.unsplash.com/photo-1537905569824-f89f14cceb68?w=1200&q=80",

  // ── Sleep ────────────────────────────────────────────────────────────────
  "best-budget-sleeping-bags-cold-weather": "https://images.unsplash.com/photo-1517823382935-51bfcb0ec6bc?w=1200&q=80",
  "best-budget-sleeping-pads-under-50":     "https://images.unsplash.com/photo-1558477280-1bfed08ea5db?w=1200&q=80",

  // ── Cooking & water ──────────────────────────────────────────────────────
  "budget-camping-cookware-that-works":      "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80",
  "best-cheap-camping-tables":               "https://images.unsplash.com/photo-1510672981848-a1c4f1cb5ccf?w=1200&q=80",
  "budget-portable-camping-stoves-compared": "https://images.unsplash.com/photo-1546890948-82b45c9712c2?w=1200&q=80",
  "affordable-water-filtration-camping":     "https://images.unsplash.com/photo-1599490255484-e08a364b4975?w=1200&q=80",

  // ── Clothing & footwear ──────────────────────────────────────────────────
  "affordable-rain-gear-camping":        "https://images.unsplash.com/photo-1595174028948-42a4b1786664?w=1200&q=80",
  "best-hiking-boots-camping-under-100": "https://images.unsplash.com/photo-1606036525923-525fa3b35465?w=1200&q=80",

  // ── Tools, lighting & navigation ─────────────────────────────────────────
  "affordable-headlamps-camping":   "https://images.unsplash.com/photo-1630275383125-2ecfa5f431d5?w=1200&q=80",
  "best-budget-multitool-camping":  "https://images.unsplash.com/photo-1606744888344-493238951221?w=1200&q=80",
  "best-budget-camping-knife":      "https://images.unsplash.com/photo-1588202807093-b41294df13af?w=1200&q=80",
  "best-budget-gps-compass-hiking": "https://images.unsplash.com/photo-1519992599773-1e1d4029929d?w=1200&q=80",

  // ── Camp comfort ─────────────────────────────────────────────────────────
  "budget-camp-chairs-that-last":        "https://images.unsplash.com/photo-1551632811-561732d1e306?w=1200&q=80",
  "best-camping-chairs-tailgating":      "https://images.unsplash.com/photo-1605401923238-b45d25aaecc8?w=1200&q=80",
  "best-camping-coolers-under-100":      "https://images.unsplash.com/photo-1604353624377-8f8f7d9a5dde?w=1200&q=80",
  "best-portable-camping-fans":          "https://images.unsplash.com/photo-1626077414855-6dfb9286c109?w=1200&q=80",
  "budget-camping-accessories-under-20": "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=1200&q=80",

  // ── Safety ───────────────────────────────────────────────────────────────
  "best-camping-first-aid-kits-under-50": "https://images.unsplash.com/photo-1516574187841-cb9cc2ca948b?w=1200&q=80",

  // ── Tips & planning ──────────────────────────────────────────────────────
  "budget-camping-hacks-that-work": "https://images.unsplash.com/photo-1445308394109-4ec2920981b1?w=1200&q=80",
  "how-to-pack-light-camping":      "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1200&q=80",
  "how-to-find-free-campsites":     "https://images.unsplash.com/photo-1601662408847-2b3f79efb76c?w=1200&q=80",
  "best-time-year-camp-free":       "https://images.unsplash.com/photo-1444124818704-4d89a495bbae?w=1200&q=80",
  "how-to-camp-in-hot-weather":     "https://images.unsplash.com/photo-1573111651692-39ec7f38fec9?w=1200&q=80",
  /* Generated by write-article.mjs via MiniMax image-01 and committed to the
   * repo — the only locally hosted hero so far. New articles get one of these
   * automatically; the Unsplash URLs above are the pre-generator backlog. */

  "how-to-camp-in-rain": "/images/heroes/how-to-camp-in-rain.jpg",
  "camping-fire-starting-guide": "/images/heroes/camping-fire-starting-guide.jpg",
  "dispersed-camping-beginners-guide": "/images/heroes/dispersed-camping-beginners-guide.jpg",
  "camping-meal-plans-budget-50": "/images/heroes/camping-meal-plans-budget-50.jpg",
  "best-portable-power-station-camping-under-200": "/images/heroes/best-portable-power-station-camping-under-200.jpg",
  "best-camp-kitchen-organization": "/images/heroes/best-camp-kitchen-organization.jpg",
  "camping-with-dogs-checklist": "/images/heroes/camping-with-dogs-checklist.jpg",
  "best-camping-tarp-under-30": "/images/heroes/best-camping-tarp-under-30.jpg",
  "best-budget-trekking-poles": "/images/heroes/best-budget-trekking-poles.jpg",
  "memorial-day-camping-checklist-2026": "/images/heroes/memorial-day-camping-checklist-2026.jpg",
  "camping-bug-tick-prevention-spring": "/images/heroes/camping-bug-tick-prevention-spring.jpg",
  "labor-day-camping-weekend-guide": "/images/heroes/labor-day-camping-weekend-guide.jpg",
  "fall-camping-gear-essentials": "/images/heroes/fall-camping-gear-essentials.jpg",
  "best-camping-blankets-under-40": "/images/heroes/best-camping-blankets-under-40.jpg",
  "how-to-stay-warm-camping-cold-nights": "/images/heroes/how-to-stay-warm-camping-cold-nights.jpg",
  "best-budget-hiking-backpacks-under-100": "/images/heroes/best-budget-hiking-backpacks-under-100.jpg",
  "best-camping-lanterns-under-30": "/images/heroes/best-camping-lanterns-under-30.jpg",
  "best-camping-coffee-makers-under-40": "/images/heroes/best-camping-coffee-makers-under-40.jpg",
  "camping-with-kids-first-trip": "/images/heroes/camping-with-kids-first-trip.jpg",
  "best-camping-socks": "/images/heroes/best-camping-socks.jpg",
  "leaf-peeping-camping-destinations": "/images/heroes/leaf-peeping-camping-destinations.jpg",
  "best-4-season-tents-under-300": "/images/heroes/best-4-season-tents-under-300.jpg",
  "best-sleeping-bag-liners-camping": "/images/heroes/best-sleeping-bag-liners-camping.jpg",
  default: "https://images.unsplash.com/photo-1598507690808-57594afea85f?w=1200&q=80",
};

export function getHeroImage(slug: string): string {
  return HERO_IMAGES[slug] || HERO_IMAGES.default;
}
