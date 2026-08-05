import { articles } from "@/data/articles";

/**
 * Shopping categories.
 *
 * Articles carry 19 distinct `category` strings across 28 pieces, most of them
 * singletons ("Water", "Footwear", "Safety"). Exposing those raw gave a filter
 * rail of one-article dead ends and a nav that pointed at near-empty pages.
 * These groups are the browse-level vocabulary; the raw categories stay as the
 * per-article label.
 *
 * The `slug` is what travels in `?category=` — it is matched against a group
 * first and falls back to a raw category name, so older links keep working.
 */
export interface CategoryGroup {
  slug: string;
  name: string;
  /** Raw article categories rolled up into this group. */
  members: string[];
  /** lucide-react icon name, resolved by the consumer. */
  icon: string;
}

export const categoryGroups: CategoryGroup[] = [
  { slug: "shelter", name: "Tents & Shelter", members: ["Tents"], icon: "Tent" },
  { slug: "sleep", name: "Sleep Systems", members: ["Sleeping Gear"], icon: "Moon" },
  { slug: "cooking", name: "Cooking & Water", members: ["Cookware", "Water"], icon: "Flame" },
  { slug: "clothing", name: "Clothing & Footwear", members: ["Clothing", "Footwear"], icon: "Shirt" },
  { slug: "tools", name: "Tools & Lighting", members: ["Tools", "Lighting", "Navigation"], icon: "Compass" },
  { slug: "camp", name: "Camp Comfort", members: ["Furniture", "Coolers", "Accessories"], icon: "Armchair" },
  { slug: "safety", name: "Safety & First Aid", members: ["Safety"], icon: "ShieldPlus" },
  { slug: "planning", name: "Tips & Planning", members: ["Tips", "Tips & Tricks", "Planning", "Beginners", "Essentials", "Gear"], icon: "Map" },
];

export function groupBySlug(slug: string): CategoryGroup | undefined {
  return categoryGroups.find((g) => g.slug === slug);
}

/**
 * Does an article belong under this `?category=` value?
 *
 * Accepts a group slug, a group display name, or a raw article category, so
 * every link shape that already exists on the site resolves to something.
 */
export function matchesCategory(articleCategory: string, value: string): boolean {
  const group =
    groupBySlug(value) ??
    categoryGroups.find((g) => g.name.toLowerCase() === value.toLowerCase());
  if (group) return group.members.includes(articleCategory);
  return articleCategory.toLowerCase() === value.toLowerCase();
}

/** Article count per group, so the UI never offers an empty filter. */
export function groupCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const g of categoryGroups) {
    counts.set(g.slug, articles.filter((a) => g.members.includes(a.category)).length);
  }
  return counts;
}

/** Groups that actually have articles behind them. */
export function populatedGroups(): CategoryGroup[] {
  const counts = groupCounts();
  return categoryGroups.filter((g) => (counts.get(g.slug) ?? 0) > 0);
}
