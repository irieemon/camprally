#!/usr/bin/env node
/**
 * Print inbound-link counts for every published guide, and FAIL if the
 * internal-linking allocation in src/lib/internal-links.ts leaves any guide
 * under-linked or produces a self-link / duplicate.
 *
 *   node --experimental-strip-types scripts/check-internal-link-coverage.mjs
 *
 * Not to be confused with scripts/check-internal-links.mjs, which is a
 * different, pre-existing gate (run by run-cycle.mjs) that checks internal
 * links resolve to real slugs at all. This script checks the opposite
 * failure mode: links that resolve fine but leave a guide with too few
 * inbound links to ever get crawled.
 *
 * Reads src/lib/internal-links.ts DIRECTLY — it is deliberately import-free
 * (only `import type`, erased at compile time), so plain Node can load it
 * via a relative path with an explicit extension and this script exercises
 * the exact allocation the site runs rather than a re-implementation of it.
 *
 * articles.ts and categories.ts cannot be imported the same way — both carry
 * real runtime `@/` imports — so they are read as TEXT, the established
 * convention in this repo (see scripts/check-printable-relevance.mjs, which
 * this mirrors, and scripts/build-search-index.mjs / scripts/lib/taxonomy.mjs).
 */
import { readFileSync } from "node:fs";
import { computeKeepReading, inboundCountsFromKeepReading } from "../src/lib/internal-links.ts";

const ROOT = new URL("..", import.meta.url).pathname;

// ── articles.ts, parsed the same way check-printable-relevance.mjs does ───
const articlesSrc = readFileSync(`${ROOT}src/data/articles.ts`, "utf8");
const marks = [...articlesSrc.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => ({ slug: m[1], at: m.index }));
if (!marks.length) {
  console.error("check-internal-link-coverage: found no articles in src/data/articles.ts");
  process.exit(1);
}
function fieldsFor(mark, index) {
  const objStart = articlesSrc.lastIndexOf("{", mark.at);
  const objEnd = index + 1 < marks.length ? marks[index + 1].at : articlesSrc.length;
  const chunk = articlesSrc.slice(objStart, objEnd);
  const title = chunk.match(/title:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? mark.slug;
  const excerpt = chunk.match(/excerpt:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? "";
  const category = chunk.match(/category:\s*"([^"]*)"/)?.[1] ?? "";
  const id = chunk.match(/id:\s*"([^"]*)"/)?.[1] ?? mark.slug;
  const date = chunk.match(/date:\s*"([^"]*)"/)?.[1] ?? "";
  const content = chunk.match(/content:\s*`([\s\S]*?)`\s*,?\s*\n\s*\}/)?.[1] ?? "";
  return { slug: mark.slug, title, excerpt, category, id, date, content };
}
const rawArticles = marks.map((m, i) => fieldsFor(m, i));
const parsedRatio = rawArticles.filter((a) => a.content.trim().length > 200).length / rawArticles.length;
if (parsedRatio < 0.8) {
  console.error(`check-internal-link-coverage: only ${Math.round(parsedRatio * 100)}% of articles yielded a body — articles.ts has probably changed shape.`);
  process.exit(2);
}

// ── categories.ts categoryGroups (slug + members), parsed like taxonomy.mjs ─
const categoriesSrc = readFileSync(`${ROOT}src/data/categories.ts`, "utf8");
const groupBlock = categoriesSrc.match(/categoryGroups\s*:\s*CategoryGroup\[\]\s*=\s*\[([\s\S]*?)\n\];/)?.[1];
if (!groupBlock) {
  console.error("check-internal-link-coverage: could not find categoryGroups in src/data/categories.ts");
  process.exit(1);
}
const groupSlugs = [...groupBlock.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
const memberArrays = [...groupBlock.matchAll(/members\s*:\s*\[([^\]]*)\]/g)].map(
  ([, inner]) => [...inner.matchAll(/"([^"]*)"/g)].map((m) => m[1]),
);
if (groupSlugs.length !== memberArrays.length) {
  console.error("check-internal-link-coverage: mismatched slug/members count while parsing categoryGroups");
  process.exit(1);
}
const categoryToGroupSlug = new Map();
groupSlugs.forEach((slug, i) => {
  for (const member of memberArrays[i]) categoryToGroupSlug.set(member, slug);
});

const articles = rawArticles.map((a) => ({
  ...a,
  groupSlug: categoryToGroupSlug.get(a.category),
}));
const slugSet = new Set(articles.map((a) => a.slug));

// ── Run the real allocation ────────────────────────────────────────────────
const keepReading = computeKeepReading(articles);
const blockInbound = inboundCountsFromKeepReading(keepReading);

// ── Prose inbound counts, parsed independently of internal-links.ts so this
// script's "total" is a genuine cross-check, not the same arithmetic twice. ─
const proseInbound = new Map(articles.map((a) => [a.slug, 0]));
const PROSE_LINK_RE = /\]\(\/blog\/([a-z0-9-]+)\)/g;
for (const a of articles) {
  PROSE_LINK_RE.lastIndex = 0;
  let m;
  while ((m = PROSE_LINK_RE.exec(a.content))) {
    if (m[1] !== a.slug && slugSet.has(m[1])) {
      proseInbound.set(m[1], (proseInbound.get(m[1]) ?? 0) + 1);
    }
  }
}

// ── Validate: no self-links, no duplicate targets on one page ─────────────
const failures = [];
for (const a of articles) {
  const targets = keepReading.get(a.slug) ?? [];
  const seen = new Set();
  for (const t of targets) {
    if (t.slug === a.slug) failures.push(`${a.slug}: links to itself`);
    if (seen.has(t.slug)) failures.push(`${a.slug}: duplicate target ${t.slug}`);
    seen.add(t.slug);
  }
}

// ── Report table ────────────────────────────────────────────────────────
const slugWidth = Math.max(...articles.map((a) => a.slug.length));
const rows = articles.map((a) => {
  const block = blockInbound.get(a.slug) ?? 0;
  const prose = proseInbound.get(a.slug) ?? 0;
  return { slug: a.slug, block, prose, total: block + prose };
});
rows.sort((a, b) => a.total - b.total || a.slug.localeCompare(b.slug));

console.log(`${"slug".padEnd(slugWidth)}  block  prose  total`);
for (const r of rows) {
  const flag = r.total < 3 ? "  <-- UNDER FLOOR" : "";
  console.log(`${r.slug.padEnd(slugWidth)}  ${String(r.block).padStart(5)}  ${String(r.prose).padStart(5)}  ${String(r.total).padStart(5)}${flag}`);
}

const totals = rows.map((r) => r.total);
const sorted = [...totals].sort((a, b) => a - b);
const min = sorted[0];
const max = sorted[sorted.length - 1];
const median = sorted[Math.floor(sorted.length / 2)];
console.log(`\n${rows.length} guides. total inbound — min=${min} median=${median} max=${max}`);

const underFloor = rows.filter((r) => r.total < 3);
if (underFloor.length) {
  failures.push(`${underFloor.length} guide(s) under the 3-inbound-link floor: ${underFloor.map((r) => r.slug).join(", ")}`);
}

if (failures.length) {
  console.error(`\nFAIL — ${failures.length} issue(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("\nOK — every guide has at least 3 inbound links, no self-links, no duplicates.");
