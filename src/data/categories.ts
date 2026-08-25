import { articles, byNewest, type Article } from "@/data/articles";

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
  /**
   * The visible paragraph under the hub's H1.
   *
   * Hand-written per group, not templated. Nine hubs whose only difference is a
   * filtered grid and an interpolated count are nine near-identical pages, which
   * is the thin-and-duplicate pattern that gets a hub set ignored rather than
   * ranked. The prose is the part that makes each one worth indexing.
   */
  blurb: string;
  /** The hub's meta description. Same reasoning: unique per group, never templated. */
  description: string;
}

export const categoryGroups: CategoryGroup[] = [
  {
    slug: "shelter",
    name: "Tents & Shelter",
    members: ["Tents", "Shelter"],
    icon: "Tent",
    blurb:
      "A tent is usually the biggest line on a first gear budget, and the easiest place to overspend. These guides cover what actually keeps water out, which specs are worth paying for, and where a cheaper shelter is genuinely good enough.",
    description:
      "Budget tents, tarps and shelters that hold up in real weather — what to look for, which specs matter, and where spending less costs you nothing.",
  },
  {
    slug: "sleep",
    name: "Sleep Systems",
    members: ["Sleeping Gear"],
    icon: "Moon",
    blurb:
      "Cold nights ruin more trips than rain does, and it is almost always the ground rather than the bag. These guides cover bags, pads and the insulation numbers that decide whether you sleep.",
    description:
      "Budget sleeping bags and pads that keep you warm — temperature ratings explained, R-values that matter, and why the pad matters more than the bag.",
  },
  {
    slug: "cooking",
    name: "Cooking & Water",
    members: ["Cookware", "Cooking", "Water"],
    icon: "Flame",
    blurb:
      "Camp cooking gear is where marketing works hardest and matters least. These guides cover stoves, pots and water treatment that do the job without titanium prices — and the safety rules that are not negotiable.",
    description:
      "Budget camp stoves, cookware and water filters that work — practical picks for real meals outdoors, plus the fuel and water-safety rules worth knowing.",
  },
  {
    slug: "clothing",
    name: "Clothing & Footwear",
    members: ["Clothing", "Footwear", "Apparel"],
    icon: "Shirt",
    blurb:
      "What you wear is part of your sleep system and your safety margin, not an afterthought. These guides cover layering that works, boots that last a season, and the one fabric to keep out of your pack when it is cold.",
    description:
      "Budget camping clothing and footwear — layering that actually works, boots worth their price, and why cotton is the wrong call in the cold.",
  },
  {
    slug: "tools",
    name: "Tools & Lighting",
    members: ["Tools", "Lighting", "Navigation", "Optics", "Electronics"],
    icon: "Compass",
    blurb:
      "Headlamps, knives, power and navigation — the small things you only notice when they fail. These guides cover which are worth carrying, which are worth spending on, and which you already own.",
    description:
      "Budget headlamps, knives, power stations and navigation gear for camping — what to carry, what to skip, and where cheap is perfectly fine.",
  },
  {
    slug: "camp",
    name: "Camp Comfort",
    members: ["Furniture", "Coolers", "Accessories", "Hygiene", "Pets"],
    icon: "Armchair",
    blurb:
      "Chairs, coolers, camp kitchens and the rest of what turns a campsite into somewhere you want to spend a weekend. Comfort is the thing that decides whether anyone wants to go again.",
    description:
      "Budget camp chairs, tables, coolers and comfort gear — what makes a campsite livable, what lasts more than one season, and what to leave at home.",
  },
  {
    slug: "safety",
    name: "Safety & First Aid",
    members: ["Safety"],
    icon: "ShieldPlus",
    blurb:
      "The guides where being wrong costs more than money. First aid, fire, carbon monoxide, weather and the handful of mistakes that turn a bad night into an emergency.",
    description:
      "Camping safety and first aid on a budget — fire and carbon monoxide rules, what belongs in your kit, and the common mistakes worth knowing about.",
  },
  {
    slug: "beginners",
    name: "Getting Started",
    members: ["Beginners", "Essentials", "Gear"],
    icon: "Sparkles",
    blurb:
      "Everything you need for a first trip, and a realistic account of what you can borrow, rent or skip. You do not need a $400 tent to spend a night outside.",
    description:
      "How to start camping on a budget — complete beginner setups, what to buy first, what to borrow, and what the gear shops will oversell you.",
  },
  {
    slug: "planning",
    name: "Tips & Planning",
    members: ["Tips", "Tips & Tricks", "Planning", "Skills", "Family"],
    icon: "Map",
    blurb:
      "Where to go, when to go, what it costs and how to make the trip easier once you are there. Free campsites, meal plans, packing strategy and the skills that save money.",
    description:
      "Camping tips, trip planning and money-saving skills — finding free campsites, budget meal plans, packing smarter and camping with kids or dogs.",
  },
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

/**
 * The articles behind a group, newest first.
 *
 * The one function every consumer goes through: the chip counts, the hub page
 * contents, the hub's ItemList schema and the sitemap's per-hub lastmod all
 * derive from this, so they cannot report different numbers for the same group.
 * Before it, `groupCounts` tested `g.members.includes(...)` directly while
 * `matchesCategory` re-implemented the same test a few lines below — two
 * expressions of one rule, which is one more than a rule needs.
 */
export function articlesInGroup(slug: string): Article[] {
  return articles.filter((a) => matchesCategory(a.category, slug)).sort(byNewest);
}

/** Article count per group, so the UI never offers an empty filter. */
export function groupCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const g of categoryGroups) {
    counts.set(g.slug, articlesInGroup(g.slug).length);
  }
  return counts;
}

/** Groups that actually have articles behind them. */
export function populatedGroups(): CategoryGroup[] {
  const counts = groupCounts();
  return categoryGroups.filter((g) => (counts.get(g.slug) ?? 0) > 0);
}
