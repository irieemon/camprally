/**
 * Hand-maintained topical map from a printable's slug to what it is about.
 *
 * printables.json is regenerated wholesale by scripts/sync-printables.mjs
 * from the sibling camprally-printables repo (see its own header comment) —
 * any field added there is overwritten on the next sync. This file is the
 * separate, committed place a relevance rule can live without that risk.
 *
 * Deliberately ZERO imports (see the note on `PrintableRelevanceRule` in
 * src/lib/printable-relevance.ts for why): that is what lets
 * scripts/check-printable-relevance.mjs import this file directly under
 * plain Node (`node --experimental-strip-types`) to re-run the exact same
 * scorer the site uses, against the real article corpus, whenever this map
 * is retuned.
 *
 * `keywords` are regex-alternation SOURCE fragments, not literal strings —
 * they are joined with "|" and wrapped in one `\b(?:…)\b`, case-insensitive.
 * That is why a plain word ("recipe") and a small pattern ("first[- ]time")
 * can sit in the same array. Deliberately no bare "budget": it appears in
 * most gear-guide titles ("Best Budget Tents…") as a price qualifier, not a
 * signal about the budget-TRACKING printable — see camping-budget-tracker
 * below, which uses "save money" / "free camping" phrasing instead.
 *
 * KEEP KEYWORDS SPECIFIC, NOT JUST TOPICAL. src/lib/printable-relevance.ts
 * requires a title-or-excerpt hit before a match counts at all, so a bare,
 * generic word ("hikes?", "spending", "backpack(?:s|ing)?") reliably fires on
 * an article that merely MENTIONS the activity in passing — one item in a
 * list of use-cases or trip types — rather than one that is actually ABOUT
 * it. Three of the four wrong pairings found in the first tuning pass
 * (2026-09-02) were exactly this: "night hikes" in a headlamp guide's
 * excerpt, "before spending under $50" in a hammock guide's, "backpacking"
 * as one of three trip types in a shower guide's. Prefer a phrase over a
 * bare word whenever the bare word could plausibly appear as an aside.
 */

export interface PrintableRelevanceRule {
  /** Category-group slugs (src/data/categories.ts `categoryGroups[].slug`) this printable is naturally tied to. */
  groups?: string[];
  keywords: string[];
}

export const printableRelevance: Record<string, PrintableRelevanceRule> = {
  "hiking-log-book": {
    // No bare "hikes?": it matched "night hikes" in a headlamp guide's
    // excerpt (2026-09-02 review) — one activity mentioned in passing, not
    // the guide's subject. "hiking" stays: in this corpus it only ever
    // appears as a topic-defining word ("Hiking Boots", "for Hiking").
    keywords: ["hiking", "trails?", "trailheads?", "summits?"],
  },
  "campfire-cooking-recipe-cards": {
    groups: ["cooking"],
    keywords: ["recipes?", "dutch oven", "campfire cooking", "cook over", "camp cooking", "cook log"],
  },
  "camping-budget-tracker": {
    groups: ["planning"],
    // No bare "spending": nearly every gear guide states a price ("before
    // spending under $50"), so it fired on an article that is not about
    // budgeting at all (2026-09-02 review). No "camp(?:ing)? free" either:
    // it matched a title's "Camp Free" on an off-grid-skills guide that
    // isn't about tracking spending — "free camping" / "free campsite"
    // below already cover the legitimate free-camping-as-savings case.
    keywords: [
      "save money", "money-saving", "financial", "afford",
      "free campsite", "free camping", "cut costs",
      "cost of camping",
    ],
  },
  "backpacking-gear-planner": {
    // No bare "backpack(?:s|ing)?": it matched "backpacking" as one of three
    // trip types listed in a portable-shower guide's excerpt ("backpacking,
    // dispersed campsites, or road trips") — not evidence the guide is about
    // backpacking gear planning (2026-09-02 review). Phrases only, so a hit
    // requires the article to actually be framed around backpacking.
    keywords: [
      "backpacking trip", "backpacking gear", "multi-day backpacking",
      "backpack planner", "thru-hik(?:e|ing)",
      "base weight", "base-weight", "ultralight", "pack weight",
    ],
  },
  "kids-camping-activity-pack": {
    groups: ["planning"],
    keywords: ["kids", "children", "child-friendly", "with kids", "family camping", "family trip", "kid-friendly"],
  },
  "campsite-review-journal": {
    groups: ["planning"],
    keywords: ["choose a campsite", "choosing a campsite", "site selection", "pick a (?:good )?(?:camp)?site", "campsite review", "rate a campsite"],
  },
  "first-time-camper-starter-pack": {
    groups: ["beginners"],
    // "beginners?", not bare "beginner": the singular form never matched a
    // plural title ("Dispersed Camping for BEGINNERS") — the \b…\b wrapper
    // requires a word boundary right after "beginner", which a trailing "s"
    // breaks. Fixing it is what correctly pulls that guide here instead of
    // camping-budget-tracker (2026-09-02 review).
    keywords: ["first[- ]time", "beginners?", "first camping trip", "new to camping", "no gear", "getting started"],
  },
  "rv-maintenance-log-book": {
    keywords: ["\\brv\\b", "camper van", "\\btrailer\\b", "motorhome"],
  },
  "camping-trip-planner": {
    groups: ["planning"],
    // "plan(?:ning)? (?:a|your) …trip" tolerates ONE word in between ("Plan
    // your AUTUMN camping trip") — the exact-adjacency version silently
    // missed a real leaf-peeping/trip-planning guide that phrased it that
    // way (2026-09-02 review), which is the kind of miss a phrase-only rule
    // risks after dropping single-word triggers elsewhere in this file.
    keywords: [
      "trip planner", "itinerary", "reservation", "book a (?:camp)?site",
      "trip planning", "booking tips", "early booking",
      "plan(?:ning)? (?:a|your) (?:\\w+ )?(?:camping )?trip",
    ],
  },
  "camping-meal-planner": {
    groups: ["cooking"],
    keywords: ["meals?", "groceries?", "grocery", "menus?", "meal prep", "food budget"],
  },
  "ultimate-camping-packing-checklist-pack": {
    groups: ["planning"],
    keywords: ["checklist", "packing list", "what to (?:bring|pack)", "gear list", "pack light", "master checklist"],
  },
};

/**
 * Per-article forced pick, keyed by article slug — bypasses scoring entirely
 * for a case the scorer gets wrong or that deserves a specific tie-break.
 * Empty until a real one is needed.
 */
export const printableOverrides: Record<string, string> = {};
