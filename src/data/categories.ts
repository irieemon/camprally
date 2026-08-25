import { articles } from "@/data/articles";

/**
 * Shopping categories.
 *
 * Articles carry many distinct `category` strings, most of them singletons
 * ("Water", "Footwear", "Safety"). Exposing those raw gave a filter rail of
 * one-article dead ends and a nav that pointed at near-empty pages. These
 * groups are the browse-level vocabulary; the raw categories stay as the
 * per-article label.
 *
 * The `slug` is what travels in the URL — it is matched against a group first
 * and falls back to a raw category name, so older links keep working.
 *
 * EVERY RAW CATEGORY MUST BE A MEMBER OF SOME GROUP. A category no group claims
 * does not error anywhere: the article renders fine and simply appears under no
 * filter and on no hub, reachable only from the flat index. Eight of the first
 * fifty published articles were in that state on 2026-08-25 — `Cooking`,
 * `Skills`, `Electronics`, `Pets`, `Shelter`, `Family`, `Apparel` — with
 * `Optics` and `Hygiene` waiting in the queue behind them. Most were
 * near-synonyms of a member that already existed (Cooking/Cookware,
 * Shelter/Tents, Apparel/Clothing), which is exactly why nobody noticed.
 *
 * scripts/lib/taxonomy.mjs reads the `members` arrays below and
 * scripts/write-article.mjs refuses to write an article whose brief carries a
 * category none of them claims, so this can no longer drift silently. Adding a
 * genuinely new category means adding it here first — that is the intended
 * workflow, not an obstacle to route around.
 *
 * Group sizes are deliberately kept off the extremes. "Tips & Planning" used to
 * absorb Gear, Essentials and Beginners as well and held 25 of 68 articles,
 * which is not a browse category so much as a second index; those three are now
 * "Getting Started". Adding a new group is the right move when one passes
 * roughly a dozen — a hub nobody can skim ranks for nothing.
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
  { slug: "shelter", name: "Tents & Shelter", members: ["Tents", "Shelter"], icon: "Tent" },
  { slug: "sleep", name: "Sleep Systems", members: ["Sleeping Gear"], icon: "Moon" },
  { slug: "cooking", name: "Cooking & Water", members: ["Cookware", "Cooking", "Water"], icon: "Flame" },
  { slug: "clothing", name: "Clothing & Footwear", members: ["Clothing", "Footwear", "Apparel"], icon: "Shirt" },
  { slug: "tools", name: "Tools & Lighting", members: ["Tools", "Lighting", "Navigation", "Optics", "Electronics"], icon: "Compass" },
  { slug: "camp", name: "Camp Comfort", members: ["Furniture", "Coolers", "Accessories", "Hygiene", "Pets"], icon: "Armchair" },
  { slug: "safety", name: "Safety & First Aid", members: ["Safety"], icon: "ShieldPlus" },
  { slug: "beginners", name: "Getting Started", members: ["Beginners", "Essentials", "Gear"], icon: "Sparkles" },
  { slug: "planning", name: "Tips & Planning", members: ["Tips", "Tips & Tricks", "Planning", "Skills", "Family"], icon: "Map" },
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
