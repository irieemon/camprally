import type { Printable } from "@/components/Printables";
import type { PrintableRelevanceRule } from "@/data/printable-relevance";

/**
 * Which printable (if any) is relevant to a given guide.
 *
 * The scoring functions below (`scoreMatch`, `rankPrintables`) take the
 * catalogue and the rule map as plain arguments rather than importing them —
 * that is what makes them a PURE function of their inputs, and what lets
 * scripts/check-printable-relevance.mjs exercise the exact same formula
 * outside Next, over the real 58-article corpus, when the map in
 * src/data/printable-relevance.ts is retuned. The two `import type`s above
 * are erased at compile time either way (by tsc for the app, by Node's type
 * stripping for the check script), so they cost that script nothing even
 * though the paths they name don't resolve under plain Node.
 */

export interface RelevanceInput {
  title: string;
  excerpt: string;
  content: string;
  /** Category-group slug the article's raw category resolves to, if any. */
  groupSlug?: string;
}

/** A title/excerpt hit is REQUIRED (see scoreMatch); group membership and a body hit only corroborate one that already exists. */
const STRONG_WEIGHT = 6;
const GROUP_WEIGHT = 3;
const WEAK_WEIGHT = 1;
/** Body hits are capped so one word repeated through a long guide can't out-score a real title match. */
const WEAK_CAP = 3;
/** Equal to STRONG_WEIGHT: since a strong hit is gated on above, any strong hit already clears this by itself; group/body only add margin. */
export const DEFAULT_THRESHOLD = 6;

function keywordRegex(keywords: string[]): RegExp | null {
  const source = keywords.map((k) => k.trim()).filter(Boolean).join("|");
  return source ? new RegExp(`\\b(?:${source})\\b`, "gi") : null;
}

/**
 * Score one (article, printable-rule) pair. Exported so the check script can
 * print the breakdown, not just the winner.
 *
 * A TITLE-OR-EXCERPT (strong) HIT IS A PRECONDITION, not just one path among
 * several to the threshold. The first tuning pass (2026-09-02) had group
 * membership (3) plus capped body mentions (up to 3) able to clear the
 * DEFAULT_THRESHOLD (6) on their own, with no keyword ever appearing where a
 * reader could see it — e.g. a "Tips" article that happened to mention
 * "family" three times in unrelated asides outscored a real match. Gating on
 * a strong hit first means group/body evidence can only ever corroborate a
 * keyword that's actually visible in the guide's own title or excerpt, never
 * manufacture a match neither ever states.
 */
export function scoreMatch(article: RelevanceInput, rule: PrintableRelevanceRule): number {
  const re = keywordRegex(rule.keywords);
  if (!re || !re.test(`${article.title} ${article.excerpt}`)) return 0;
  let score = STRONG_WEIGHT;
  if (rule.groups?.length && article.groupSlug && rule.groups.includes(article.groupSlug)) {
    score += GROUP_WEIGHT;
  }
  re.lastIndex = 0;
  const bodyHits = article.content.match(re)?.length ?? 0;
  score += Math.min(bodyHits, WEAK_CAP) * WEAK_WEIGHT;
  return score;
}

/** Every printable that has a relevance rule, ranked highest score first. */
export function rankPrintables(
  article: RelevanceInput,
  printableSlugs: string[],
  rules: Record<string, PrintableRelevanceRule>,
): Array<{ slug: string; score: number }> {
  return printableSlugs
    .filter((slug) => rules[slug])
    .map((slug) => ({ slug, score: scoreMatch(article, rules[slug]) }))
    .sort((a, b) => b.score - a.score);
}

/**
 * The printable to surface on one guide page, or null when nothing clears
 * the threshold. An explicit override wins outright and NEVER falls through
 * to the scorer — an override for a slug the catalog no longer has returns
 * null, not the scorer's pick, so a stale/typo'd override reads as "no
 * match" rather than masquerading as one. Absent an override, the highest
 * ranked printable wins if — and only if — its score clears the bar.
 */
export function relevantPrintable(
  article: RelevanceInput & { slug: string },
  printables: Printable[],
  rules: Record<string, PrintableRelevanceRule>,
  overrides: Record<string, string>,
  threshold: number = DEFAULT_THRESHOLD,
): Printable | null {
  const forcedSlug = overrides[article.slug];
  if (forcedSlug) {
    // An override bypasses scoring ENTIRELY — including the fallback to the
    // scorer's own pick. Falling through here on an unknown slug (a typo, or
    // a printable since removed from the catalog) would silently mask that
    // mistake as a real scorer result instead of surfacing it. See
    // scripts/check-printable-relevance.mjs, which also warns on this case.
    const forced = printables.find((p) => p.slug === forcedSlug);
    return forced ?? null;
  }
  const ranked = rankPrintables(article, printables.map((p) => p.slug), rules);
  if (!ranked.length || ranked[0].score < threshold) return null;
  return printables.find((p) => p.slug === ranked[0].slug) ?? null;
}
