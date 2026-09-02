/**
 * Pure matcher over the static search index built by
 * scripts/build-search-index.mjs into public/search-index.json.
 *
 * No dependencies, no DOM, no fetch — this file only turns
 * `(SearchIndex, query string)` into ranked results, so it can run the same
 * way in the header search control, the /search results page, and BlogGrid's
 * in-page filter without any of them agreeing on more than "pass me the
 * index and the query."
 *
 * Matching: case-insensitive, multi-term AND — every term in the query must
 * match SOMEWHERE in an article (title, a heading, the excerpt, or the body
 * bag-of-words) or that article is excluded entirely. Each term matches by
 * PREFIX: "tent" matches "tent", "tents", "tenting". Scoring is per-term: a
 * term is scored at the highest-weighted tier it matches in (title beats a
 * heading beats the excerpt beats the body), and an exact word match scores
 * a little higher than a prefix-only match. Ties break newest-first, using
 * the same (date, id) ordering as `byNewest` in src/data/articles.ts — id is
 * zero-padded and strictly increasing, so it is a safe secondary key for
 * same-day publishes here too.
 */

export interface SearchHeading {
  /** Anchor id, matching the `id="…"` the live page actually renders on its <h2>. */
  i: string;
  t: string;
}

export interface SearchArticleRecord {
  /** slug */
  s: string;
  /** article id (art-NNN), for stable newest-first tie-break */
  i: string;
  /** title */
  t: string;
  /** category */
  c: string;
  /** excerpt */
  e: string;
  /** date used for sorting — the article's `updated` date if it has one, else `date` */
  d: string;
  /** h2 headings, in document order — the only ones with a real page anchor */
  h: SearchHeading[];
  /** h3 heading text — scored, but not deep-linkable */
  g: string[];
  /** deduplicated, stopword-filtered body terms not already covered by title/heading/excerpt */
  b: string[];
}

export interface SearchIndex {
  version: number;
  generatedAt: string;
  articles: SearchArticleRecord[];
}

export interface SearchResult {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  date: string;
  score: number;
  /** /blog/<slug>, or /blog/<slug>#<id> when the best match is a specific h2 section. */
  href: string;
  matchedHeading?: SearchHeading;
}

const WEIGHT = { title: 100, heading: 40, excerpt: 15, body: 5 } as const;
const EXACT_BONUS = 4;

/** Lowercase alnum-run tokens (apostrophes collapsed), no filtering — used for live matching. */
function wordsOf(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? [];
  return words.map((w) => w.replace(/'.*$/, ""));
}

/** Split a query into lowercase, deduplicated terms. Empty/whitespace-only query → []. */
export function tokenizeQuery(query: string): string[] {
  const seen = new Set<string>();
  for (const w of wordsOf(query)) seen.add(w);
  return [...seen];
}

function tierMatch(words: string[], term: string): { hit: boolean; exact: boolean } {
  let exact = false;
  let hit = false;
  for (const w of words) {
    if (w === term) {
      exact = true;
      hit = true;
      break;
    }
    if (w.startsWith(term)) hit = true;
  }
  return { hit, exact };
}

/** First h2 whose text contains (by prefix) any of the given terms. */
function bestHeadingMatch(article: SearchArticleRecord, terms: string[]): SearchHeading | undefined {
  for (const heading of article.h) {
    const words = wordsOf(heading.t);
    if (terms.some((term) => words.some((w) => w.startsWith(term)))) return heading;
  }
  return undefined;
}

function compareNewest(a: SearchArticleRecord, b: SearchArticleRecord): number {
  return b.d.localeCompare(a.d) || b.i.localeCompare(a.i);
}

/**
 * Score one article against pre-tokenized query terms.
 * Returns null when at least one term matches nowhere in the article (AND semantics).
 */
function scoreArticle(
  article: SearchArticleRecord,
  terms: string[],
): { score: number; titleMatched: boolean } | null {
  const titleWords = wordsOf(article.t);
  const headingWords = [...article.h.flatMap((h) => wordsOf(h.t)), ...article.g.flatMap((t) => wordsOf(t))];
  const excerptWords = wordsOf(article.e);
  // Body terms are already lowercased, unique, stopword-filtered single words.
  const bodyWords = article.b;

  let score = 0;
  let titleMatched = false;

  for (const term of terms) {
    const title = tierMatch(titleWords, term);
    if (title.hit) {
      score += WEIGHT.title + (title.exact ? EXACT_BONUS : 0);
      titleMatched = true;
      continue;
    }
    const heading = tierMatch(headingWords, term);
    if (heading.hit) {
      score += WEIGHT.heading + (heading.exact ? EXACT_BONUS : 0);
      continue;
    }
    const excerpt = tierMatch(excerptWords, term);
    if (excerpt.hit) {
      score += WEIGHT.excerpt + (excerpt.exact ? EXACT_BONUS : 0);
      continue;
    }
    const body = tierMatch(bodyWords, term);
    if (body.hit) {
      score += WEIGHT.body + (body.exact ? EXACT_BONUS : 0);
      continue;
    }
    // This term matched nothing anywhere in the article — AND fails.
    return null;
  }

  return { score, titleMatched };
}

export interface SearchOptions {
  limit?: number;
  /** Restrict matching to these slugs (BlogGrid: only the articles it's already showing). */
  onlySlugs?: ReadonlySet<string>;
}

/** Rank every article in the index against a raw query string. Empty query → []. */
export function search(index: SearchIndex, query: string, options: SearchOptions = {}): SearchResult[] {
  const terms = tokenizeQuery(query);
  if (!terms.length) return [];

  const scored: Array<{ article: SearchArticleRecord; score: number; heading?: SearchHeading }> = [];

  for (const article of index.articles) {
    if (options.onlySlugs && !options.onlySlugs.has(article.s)) continue;
    const result = scoreArticle(article, terms);
    if (!result) continue;
    const heading = result.titleMatched ? undefined : bestHeadingMatch(article, terms);
    scored.push({ article, score: result.score, heading });
  }

  scored.sort((a, b) => b.score - a.score || compareNewest(a.article, b.article));

  const limited = options.limit ? scored.slice(0, options.limit) : scored;

  return limited.map(({ article, score, heading }) => ({
    slug: article.s,
    title: article.t,
    category: article.c,
    excerpt: article.e,
    date: article.d,
    score,
    href: heading ? `/blog/${article.s}#${heading.i}` : `/blog/${article.s}`,
    matchedHeading: heading,
  }));
}

export interface HighlightSegment {
  text: string;
  hit: boolean;
}

/**
 * Split `text` into segments for <mark>-style highlighting, matching the same
 * case-insensitive prefix rule the matcher uses. Pure — returns data, renders
 * nothing.
 */
export function highlightSegments(text: string, terms: string[]): HighlightSegment[] {
  if (!terms.length) return [{ text, hit: false }];
  const parts = text.split(/([A-Za-z0-9]+(?:'[A-Za-z]+)?)/);
  return parts
    .filter((part) => part.length > 0)
    .map((part) => {
      const lower = part.toLowerCase().replace(/'.*$/, "");
      const hit = /[a-z0-9]/i.test(part) && terms.some((term) => lower.startsWith(term));
      return { text: part, hit };
    });
}
