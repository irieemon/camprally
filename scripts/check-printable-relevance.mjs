#!/usr/bin/env node
/**
 * Print which printable (if any) src/lib/printable-relevance.ts picks for
 * every published article, so src/data/printable-relevance.ts can be tuned
 * against the real corpus instead of guessed at.
 *
 *   node --experimental-strip-types scripts/check-printable-relevance.mjs
 *
 * Reads src/lib/printable-relevance.ts and src/data/printable-relevance.ts
 * DIRECTLY — both are deliberately import-free (or type-only-import-free; see
 * the header comment in the lib file), so plain Node can load them via a
 * relative path with an explicit extension, and this script exercises the
 * exact scoring formula the site runs rather than a re-implementation of it.
 *
 * articles.ts and categories.ts cannot be imported the same way — both carry
 * real runtime `@/` imports (or, for articles.ts, JSX-free but still not
 * meant to run outside Next) — so they are read as TEXT, the established
 * convention in this repo for consuming them from a plain script (see
 * scripts/build-search-index.mjs and scripts/lib/taxonomy.mjs, which this
 * mirrors).
 */
import { readFileSync } from "node:fs";
import { rankPrintables, DEFAULT_THRESHOLD } from "../src/lib/printable-relevance.ts";
import { printableRelevance, printableOverrides } from "../src/data/printable-relevance.ts";

const ROOT = new URL("..", import.meta.url).pathname;

// ── articles.ts, parsed the same way build-search-index.mjs does ──────────
const articlesSrc = readFileSync(`${ROOT}src/data/articles.ts`, "utf8");
const marks = [...articlesSrc.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => ({ slug: m[1], at: m.index }));
if (!marks.length) {
  console.error("check-printable-relevance: found no articles in src/data/articles.ts");
  process.exit(1);
}
function fieldsFor(mark, index) {
  const objStart = articlesSrc.lastIndexOf("{", mark.at);
  const objEnd = index + 1 < marks.length ? marks[index + 1].at : articlesSrc.length;
  const chunk = articlesSrc.slice(objStart, objEnd);
  const title = chunk.match(/title:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? mark.slug;
  const excerpt = chunk.match(/excerpt:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? "";
  const category = chunk.match(/category:\s*"([^"]*)"/)?.[1] ?? "";
  const content = chunk.match(/content:\s*`([\s\S]*?)`\s*,?\s*\n\s*\}/)?.[1] ?? "";
  return { slug: mark.slug, title, excerpt, category, content };
}
const articles = marks.map((m, i) => fieldsFor(m, i));
const parsedRatio = articles.filter((a) => a.content.trim().length > 200).length / articles.length;
if (parsedRatio < 0.8) {
  console.error(`check-printable-relevance: only ${Math.round(parsedRatio * 100)}% of articles yielded a body — articles.ts has probably changed shape.`);
  process.exit(2);
}

// ── categories.ts categoryGroups (slug + members), parsed like taxonomy.mjs ─
const categoriesSrc = readFileSync(`${ROOT}src/data/categories.ts`, "utf8");
const groupBlock = categoriesSrc.match(/categoryGroups\s*:\s*CategoryGroup\[\]\s*=\s*\[([\s\S]*?)\n\];/)?.[1];
if (!groupBlock) {
  console.error("check-printable-relevance: could not find categoryGroups in src/data/categories.ts");
  process.exit(1);
}
// Each group object: capture its slug and its members array independently,
// then pair them up in source order — same shape categories.ts declares them in.
const groupSlugs = [...groupBlock.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
const memberArrays = [...groupBlock.matchAll(/members\s*:\s*\[([^\]]*)\]/g)].map(
  ([, inner]) => [...inner.matchAll(/"([^"]*)"/g)].map((m) => m[1]),
);
if (groupSlugs.length !== memberArrays.length) {
  console.error("check-printable-relevance: mismatched slug/members count while parsing categoryGroups");
  process.exit(1);
}
const categoryToGroupSlug = new Map();
groupSlugs.forEach((slug, i) => {
  for (const member of memberArrays[i]) categoryToGroupSlug.set(member, slug);
});

// ── printables.json, for the slug list rankPrintables scores against ──────
const printableSlugs = JSON.parse(readFileSync(`${ROOT}src/data/printables.json`, "utf8")).products.map((p) => p.slug);
const printableSlugSet = new Set(printableSlugs);
const articleSlugSet = new Set(articles.map((a) => a.slug));

// ── Validate printableOverrides UP FRONT, loudly ───────────────────────────
// relevantPrintable() in src/lib/printable-relevance.ts treats an override
// for an unknown printable slug as "no match" (null), never a silent
// fall-through to the scorer — see the fix there and its comment. Mirror
// that here as a warning rather than a silent skip, so a typo'd or
// since-removed printable slug in printableOverrides is impossible to miss
// when this table is run, not just correctly-but-quietly handled at runtime.
for (const [articleSlug, printableSlug] of Object.entries(printableOverrides)) {
  if (!printableSlugSet.has(printableSlug)) {
    console.warn(`⚠️  UNKNOWN OVERRIDE: printableOverrides["${articleSlug}"] = "${printableSlug}" — no printable with that slug in src/data/printables.json. relevantPrintable() will return null for this article, not this printable.`);
  }
  if (!articleSlugSet.has(articleSlug)) {
    console.warn(`⚠️  UNKNOWN OVERRIDE KEY: printableOverrides has an entry for article slug "${articleSlug}", which does not exist in src/data/articles.ts.`);
  }
}

// ── Score every article ────────────────────────────────────────────────────
let matched = 0;
const rows = articles.map((a) => {
  const forcedSlug = printableOverrides[a.slug];
  if (forcedSlug) {
    // Same rule as relevantPrintable(): an override bypasses scoring
    // entirely, including the fallback to the scorer's own pick. An unknown
    // slug is "— none —", not a masked scorer result.
    const pick = printableSlugSet.has(forcedSlug) ? forcedSlug : "— none —";
    if (pick !== "— none —") matched += 1;
    return { slug: a.slug, category: a.category, pick, score: pick !== "— none —" ? "override" : "invalid override" };
  }
  const groupSlug = categoryToGroupSlug.get(a.category);
  const ranked = rankPrintables({ ...a, groupSlug }, printableSlugs, printableRelevance);
  const top = ranked[0];
  const pick = top && top.score >= DEFAULT_THRESHOLD ? top.slug : null;
  if (pick) matched += 1;
  return { slug: a.slug, category: a.category, pick: pick ?? "— none —", score: top ? top.score : 0 };
});

const slugWidth = Math.max(...rows.map((r) => r.slug.length));
const pickWidth = Math.max(...rows.map((r) => String(r.pick).length));
for (const r of rows) {
  console.log(`${r.slug.padEnd(slugWidth)}  ${String(r.pick).padEnd(pickWidth)}  score=${r.score}  (${r.category})`);
}
console.log(`\n${matched}/${rows.length} articles matched a printable (threshold=${DEFAULT_THRESHOLD}).`);

// Per-printable coverage, so a rule that never wins anything is visible too.
const wins = new Map();
for (const r of rows) if (r.pick !== "— none —") wins.set(r.pick, (wins.get(r.pick) ?? 0) + 1);
console.log("\nPer-printable coverage:");
for (const slug of printableSlugs) {
  console.log(`  ${slug.padEnd(45)} ${wins.get(slug) ?? 0}`);
}
