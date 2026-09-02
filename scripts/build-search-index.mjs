#!/usr/bin/env node
/**
 * Generate public/search-index.json — the static, client-fetched search index
 * that powers the header search control, the /search results page, and
 * BlogGrid's in-page filter.
 *
 *   node scripts/build-search-index.mjs
 *
 * WHY A BUILD SCRIPT AND NOT A ROUTE HANDLER. Either would regenerate on every
 * Vercel rebuild with no manual step — a statically-generated route handler
 * reading `@/data/articles` would work too. A plain script was chosen because
 * every other consumer of articles.ts in this repo (sweep-published,
 * check-internal-links, backfill-excerpts, …) already reads the file as TEXT
 * rather than importing it — articles.ts is TypeScript and these scripts run
 * under plain Node, so importing it isn't an option outside Next's own build.
 * A route handler would be the first thing in the codebase to import
 * articles.ts from anywhere other than a page component, and would need its
 * own care to stay out of any client bundle. Reusing the established
 * text-parsing convention (same regex shape as sweep-published.mjs) keeps this
 * generator consistent with the rest of the pipeline and easy to review next
 * to the scripts it sits beside.
 *
 * Wired into `prebuild` in package.json, so `next build` (what Vercel runs)
 * always regenerates this before compiling — a newly published guide is
 * searchable after the next rebuild with no separate step. The output is
 * gitignored (see .gitignore): it is derived data, identical in kind to
 * `.next/`, not a source file.
 *
 * WHY NOT SHIP FULL ARTICLE BODIES. articles.ts carries ~520 KB of markdown
 * across 58 guides — full plain-text bodies would blow the ~150 KB gzipped
 * budget on their own before title/excerpt/heading overhead. Instead each
 * article contributes a deduplicated, stopword-filtered BAG OF WORDS from its
 * body (`b`), used only to decide whether a body-only query term matches —
 * never rendered. The result snippet shown to a searcher is always the
 * article's own excerpt (already shipped, already short), with the matched
 * term highlighted inside it if it happens to appear there. See src/lib/search.ts.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = `${ROOT}src/data/articles.ts`;
const OUT = `${ROOT}public/search-index.json`;

const src = readFileSync(SRC, "utf8");

/* Same split-on-slug-key shape as scripts/backfill-excerpts.mjs: articles.ts
 * bodies are template literals full of backticks and markdown, and one regex
 * that tries to span the whole array is the kind that works on the corpus it
 * was tested against and silently mismatches the next one. */
const marks = [...src.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => ({ slug: m[1], at: m.index }));
if (!marks.length) {
  console.error("build-search-index: found no articles in src/data/articles.ts — refusing to write an empty index.");
  process.exit(1);
}

/* `id` is declared BEFORE `slug` in each object literal (see the Article
 * shape in articles.ts), so a forward slice from the `slug:` mark would miss
 * it. Re-slice from the object's opening brace instead. */
function fieldsFor(mark, index) {
  const objStart = src.lastIndexOf("{", mark.at);
  const objEnd = index + 1 < marks.length ? marks[index + 1].at : src.length;
  const chunk = src.slice(objStart, objEnd);
  const id = chunk.match(/id:\s*"([^"]*)"/)?.[1] ?? mark.slug;
  const title = chunk.match(/title:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? mark.slug;
  const excerpt = chunk.match(/excerpt:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? "";
  const category = chunk.match(/category:\s*"([^"]*)"/)?.[1] ?? "";
  const date = chunk.match(/\bdate:\s*"([^"]*)"/)?.[1] ?? "";
  const updated = chunk.match(/\bupdated:\s*"([^"]*)"/)?.[1] ?? null;
  /* Content closes with a BARE BACKTICK on its own line, not "`," — see the
   * identical note in sweep-published.mjs. Assuming the latter parses 0 of 58
   * bodies and this would silently ship an index with empty body terms. */
  const content = chunk.match(/content:\s*`([\s\S]*?)`\s*,?\s*\n\s*\}/)?.[1] ?? "";
  return { id, slug: mark.slug, title, excerpt, category, date, updated, content };
}

const articles = marks.map((m, i) => fieldsFor(m, i));

const parsedRatio = articles.filter((a) => a.content.trim().length > 200).length / articles.length;
if (parsedRatio < 0.8) {
  console.error(
    `build-search-index: only ${Math.round(parsedRatio * 100)}% of articles yielded a body. ` +
    `articles.ts has probably changed shape — refusing to write a broken index.`,
  );
  process.exit(2);
}

// ─────────────────────────────────────────
// Markdown → plain text
// ─────────────────────────────────────────

/** Unescape the small set of characters string-literal fields can carry. */
const unescapeLiteral = (s) => s.replace(/\\"/g, '"').replace(/\\n/g, " ").replace(/\\\\/g, "\\");

/**
 * Amazon buy-link cleanup, mirrored from the heading passes in
 * src/app/blog/[slug]/page.tsx (search that file for "amzcta" and the
 * "Check the X on Amazon" comment). Only the markdown-link shape is handled
 * here — the "bare URL trailing the heading" shape is handled separately
 * below, matching the second pass in that file.
 *
 * Currently 0 of the corpus's h2 headings hit this (verified against the live
 * articles.ts), so it changes nothing measurable today; it exists so a future
 * "### [Check the X on Amazon](https://...)" heading still gets a clean id
 * instead of one built from raw link markdown.
 */
function stripAmazonLinkLabel(text) {
  const m = text.match(/^([\s\S]*?)\[([^\]]*)\]\(https:\/\/www\.amazon\.com\/[^)]*?tag=camprally-20[^)]*?\)([\s\S]*)$/);
  if (!m) return text;
  const [, before, label, after] = m;
  const name = label
    .replace(/^check\s+(?:the|out)?\s*/i, "")
    .replace(/[\s,.]*on amazon[\s.]*$/i, "")
    .trim();
  return `${before}${name}${after}`.trim();
}

/** The bare-URL-in-heading shape: text ending in a raw affiliate link. */
function stripTrailingAmazonUrl(text) {
  const m = text.match(/^([\s\S]*?)[\s—–-]*(https:\/\/www\.amazon\.com\/\S*?tag=camprally-20\S*)\s*$/);
  if (!m) return text;
  return m[1].trim() || text;
}

/** Markdown inline syntax → plain text. Links keep their label, nothing else survives. */
function inlineToPlainText(md) {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // images and links → label
    .replace(/`([^`]*)`/g, "$1") // inline code
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/\*([^*]+)\*/g, "$1") // italic
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .trim();
}

/** Full body → a plain-text blob, for term extraction only (never shipped verbatim). */
function bodyToPlainText(md) {
  return md
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "") // heading marker
        .replace(/^\s{0,3}>\s?/, "") // blockquote
        .replace(/^\s{0,3}[-*+]\s+/, "") // bullet
        .replace(/^\s{0,3}\d+[.)]\s+/, "") // ordered list
        .replace(/^\s{0,3}-{3,}\s*$/, "") // hr
        .replace(/\|/g, " "), // table pipes
    )
    .join("\n")
    .split("\n")
    .map(inlineToPlainText)
    .join(" ")
    .replace(/https?:\/\/\S+/g, " ") // any surviving raw URL
    .replace(/&[a-z]+;/gi, " "); // stray HTML entities
}

/* "amazon" is not an English stopword, but it is boilerplate here: it
 * appears in the "Buy X on Amazon" CTA text of 45 of 58 articles (measured
 * against the live corpus), so it carries zero discriminative signal while
 * being exactly the kind of word a searcher might actually type — which
 * would surface nearly the whole site as "matches". Excluded for that
 * reason, not because it isn't a real word. */
const STOPWORDS = new Set(
  (
    "amazon " +
    "a about above after again against all am an and any are aren't as at be because been " +
    "before being below between both but by can't cannot could couldn't did didn't do does " +
    "doesn't doing don't down during each few for from further had hadn't has hasn't have " +
    "haven't having he he'd he'll he's her here here's hers herself him himself his how how's " +
    "i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my " +
    "myself no nor not of off on once only or other ought our ours ourselves out over own same " +
    "shan't she she'd she'll she's should shouldn't so some such than that that's the their " +
    "theirs them themselves then there there's these they they'd they'll they're they've this " +
    "those through to too under until up very was wasn't we we'd we'll we're we've were weren't " +
    "what what's when when's where where's which while who who's whom why why's with won't " +
    "would wouldn't you you'd you'll you're you've your yours yourself yourselves " +
    "yet also into onto get gets got getting one two three four five six seven eight nine ten"
  ).split(/\s+/),
);

/** Lowercase word tokens (letters, digits, internal apostrophes collapsed), length ≥ 3, no pure stopwords/numbers. */
function tokenize(text) {
  const words = text.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? [];
  const out = new Set();
  for (const w of words) {
    const clean = w.replace(/'.*$/, "");
    if (clean.length < 3) continue;
    if (STOPWORDS.has(clean)) continue;
    if (/^\d+$/.test(clean) && clean.length < 4) continue; // bare small numbers ("50", "20") are noise
    out.add(clean);
  }
  return out;
}

// ─────────────────────────────────────────
// Headings — id generation mirrors src/app/blog/[slug]/page.tsx exactly
// (see "Anchor every h2" there) so a search result can deep-link to the same
// #id the rendered page actually carries. Only h2 gets a real anchor on the
// live page; h3 text is still indexed for heading-weight scoring, just
// without a section link.
// ─────────────────────────────────────────
function slugifyHeading(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
}

function extractHeadings(md) {
  const h2 = [];
  const h3texts = [];
  const seen = new Map();
  for (const m of md.matchAll(/^(#{2,3})\s+(.+)$/gm)) {
    const level = m[1].length;
    let text = m[2].trim();
    text = stripAmazonLinkLabel(text);
    text = stripTrailingAmazonUrl(text);
    text = inlineToPlainText(text);
    if (!text) continue;
    if (level === 2) {
      const base = slugifyHeading(text);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      const id = n ? `${base}-${n + 1}` : base;
      h2.push({ i: id, t: text });
    } else {
      h3texts.push(text);
    }
  }
  return { h2, h3texts };
}

// ─────────────────────────────────────────
// Build one compact record per article
// ─────────────────────────────────────────
const out = articles.map((a) => {
  const title = unescapeLiteral(a.title);
  const excerpt = unescapeLiteral(a.excerpt);
  const { h2, h3texts } = extractHeadings(a.content);

  const titleWords = tokenize(title);
  const excerptWords = tokenize(excerpt);
  const headingWords = new Set();
  for (const h of h2) for (const w of tokenize(h.t)) headingWords.add(w);
  for (const t of h3texts) for (const w of tokenize(t)) headingWords.add(w);

  const bodyPlain = bodyToPlainText(a.content);
  const bodyWords = tokenize(bodyPlain);
  // Don't re-ship a term already covered by a higher tier — it scores there.
  for (const w of titleWords) bodyWords.delete(w);
  for (const w of headingWords) bodyWords.delete(w);
  for (const w of excerptWords) bodyWords.delete(w);

  return {
    s: a.slug,
    i: a.id,
    t: title,
    c: a.category,
    e: excerpt,
    d: a.updated || a.date,
    h: h2,
    g: h3texts,
    b: [...bodyWords].sort(),
  };
});

mkdirSync(`${ROOT}public`, { recursive: true });
const payload = JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), articles: out });
writeFileSync(OUT, payload);

const rawBytes = Buffer.byteLength(payload, "utf8");
const gzipBytes = gzipSync(payload, { level: 9 }).length;
const fmt = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`build-search-index: wrote ${out.length} articles to public/search-index.json`);
console.log(`  raw:   ${fmt(rawBytes)} (${rawBytes} bytes)`);
console.log(`  gzip:  ${fmt(gzipBytes)} (${gzipBytes} bytes)${gzipBytes > 150 * 1024 ? "  ⚠ over the ~150 KB budget" : ""}`);
