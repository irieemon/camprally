/**
 * "Keep reading" internal-link allocation.
 *
 * Search Console showed ~25 of 58 guides had never appeared in a Google
 * result, and a corpus scan found 13 receiving zero inbound links from other
 * guides' bodies. The old sidebar computation —
 * `articles.filter(sameRawCategory).slice(0, 3)` — was a per-page greedy
 * pick in array order: empty on the many one/two-article raw categories,
 * and on bigger ones the same first three guides absorbed every link while
 * later ones got none. This module replaces it with a single GLOBAL
 * allocation computed once over the whole corpus, so inbound links spread
 * evenly instead of concentrating on whichever guide happens to sort first.
 *
 * Deliberately import-free (only `import type`, erased at compile time) —
 * same convention as src/lib/printable-relevance.ts. That keeps this a pure
 * function of its inputs, which is what lets
 * scripts/check-internal-link-coverage.mjs exercise the exact algorithm the site
 * runs, over the real corpus, via `node --experimental-strip-types` without
 * going through Next.
 */

export interface LinkableArticle {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  /** Category-group slug the article's raw category resolves to, if any. */
  groupSlug?: string;
  date: string;
  /** Zero-padded, strictly increasing publish order (art-001, art-002, …). */
  id: string;
  /** Markdown body. Optional — only needed to count pre-existing prose links. */
  content?: string;
}

export interface KeepReadingTarget {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
}

/**
 * A same-group pool needs at least this many members (including the source
 * guide itself) to hand out 3 candidates once the source excludes itself.
 * Below it, the pool falls back to the whole corpus.
 */
const MIN_GROUP_SIZE = 4;
const TARGETS_PER_PAGE = 3;

/** In-body markdown links to another guide: `](/blog/<slug>)`. */
const PROSE_LINK_RE = /\]\(\/blog\/([a-z0-9-]+)\)/g;

function toTarget(a: LinkableArticle): KeepReadingTarget {
  return { slug: a.slug, title: a.title, excerpt: a.excerpt, category: a.category };
}

/** Newest first, publish-order tiebreak — same rule as `byNewest` in articles.ts. */
function newestFirst(a: LinkableArticle, b: LinkableArticle): number {
  return b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
}

/**
 * Every guide's 3 "keep reading" targets, computed as one global allocation
 * rather than page-by-page.
 *
 * Rule: candidates are other guides in the same category group, falling back
 * to the whole corpus when that group has fewer than MIN_GROUP_SIZE members
 * (too small to yield 3 distinct candidates once the source excludes
 * itself). Guides are processed in a stable order (ascending `id`, i.e.
 * publish order) and each one's 3 targets are the candidates with the fewest
 * inbound links assigned SO FAR — ties broken newest-first — so links spread
 * evenly across the run instead of piling onto whichever guide sorts first.
 *
 * Pre-existing in-body prose links (`](/blog/<slug>)`) seed the inbound
 * counters before allocation starts, so a guide already well-linked in prose
 * is de-prioritised as a target for new block links.
 */
export function computeKeepReading(
  articles: LinkableArticle[],
): Map<string, KeepReadingTarget[]> {
  const inbound = new Map<string, number>();
  for (const a of articles) inbound.set(a.slug, 0);

  const slugSet = new Set(articles.map((a) => a.slug));
  for (const a of articles) {
    if (!a.content) continue;
    PROSE_LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PROSE_LINK_RE.exec(a.content))) {
      const target = m[1];
      if (target !== a.slug && slugSet.has(target)) {
        inbound.set(target, (inbound.get(target) ?? 0) + 1);
      }
    }
  }

  const groupCounts = new Map<string, number>();
  for (const a of articles) {
    if (!a.groupSlug) continue;
    groupCounts.set(a.groupSlug, (groupCounts.get(a.groupSlug) ?? 0) + 1);
  }

  const stableOrder = [...articles].sort((a, b) => a.id.localeCompare(b.id));

  const result = new Map<string, KeepReadingTarget[]>();

  for (const source of stableOrder) {
    const useGroup =
      !!source.groupSlug && (groupCounts.get(source.groupSlug) ?? 0) >= MIN_GROUP_SIZE;
    const pool = useGroup
      ? articles.filter((a) => a.slug !== source.slug && a.groupSlug === source.groupSlug)
      : articles.filter((a) => a.slug !== source.slug);

    // Ranked once against the state as of THIS source's turn — "fewest
    // inbound links assigned so far" — not re-sorted mid-pick.
    const ranked = [...pool].sort((a, b) => {
      const diff = (inbound.get(a.slug) ?? 0) - (inbound.get(b.slug) ?? 0);
      return diff !== 0 ? diff : newestFirst(a, b);
    });

    const chosen = ranked.slice(0, TARGETS_PER_PAGE);
    for (const c of chosen) inbound.set(c.slug, (inbound.get(c.slug) ?? 0) + 1);
    result.set(source.slug, chosen.map(toTarget));
  }

  return result;
}

/**
 * Per-guide inbound count from the "keep reading" block alone (no prose) —
 * a tally of how many times each slug appears as someone else's target.
 * Exported so scripts/check-internal-link-coverage.mjs can assert the floor without
 * re-implementing the allocation.
 */
export function inboundCountsFromKeepReading(
  keepReading: Map<string, KeepReadingTarget[]>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const targets of keepReading.values()) {
    for (const t of targets) counts.set(t.slug, (counts.get(t.slug) ?? 0) + 1);
  }
  return counts;
}
