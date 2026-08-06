#!/usr/bin/env node
/**
 * Audit every product an article recommends against what the article is about.
 *
 *   node scripts/audit-products.mjs            # report only
 *   node scripts/audit-products.mjs --json     # machine-readable
 *
 * Exists because "Best Budget Camping Knife" shipped with its only product link
 * pointing at a $53.99 sleeping bag. Nothing caught it: the link resolved, the
 * ASIN was live, the price was real — it was simply the wrong product, and no
 * amount of price-freshness checking notices that.
 *
 * A product belongs to an article if a reader searching for the article's topic
 * would expect to see it. That is a judgement, so it is made by the model, but
 * the model is given no latitude beyond a verdict: it sees the article title and
 * the catalog's own title for the product, and answers MATCH or MISMATCH.
 *
 * Reports; never edits. Fixing a mismatch means choosing a different product,
 * which is an editorial decision.
 */

import { readFileSync } from "node:fs";
import { panel } from "./lib/llm.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const JSON_OUT = process.argv.includes("--json");
/* Odd, so a majority always exists. Raise it and the audit gets more stable and
 * proportionally slower; the votes run in parallel so wall-clock barely moves,
 * but the token spend is linear. */
const VOTES = Number(process.env.AUDIT_VOTES ?? 3);

const catalog = JSON.parse(readFileSync(`${ROOT}src/data/catalog.json`, "utf8")).products ?? {};
const articlesSrc = readFileSync(`${ROOT}src/data/articles.ts`, "utf8");
// Extracted from the blog route into src/data/ so the card grids could read it.
const pageSrc = readFileSync(`${ROOT}src/data/article-sections.ts`, "utf8");

// ── every (article, product) pair the site actually renders ───────────────
const byArticle = new Map();
const add = (slug, title, asin) => {
  if (!byArticle.has(slug)) byArticle.set(slug, { slug, title, asins: new Set() });
  byArticle.get(slug).asins.add(asin);
};

for (const chunk of articlesSrc.split(/\n\s*\{\s*\n\s*id: "/).slice(1)) {
  const slug = chunk.match(/slug: "([^"]+)"/)?.[1];
  const title = chunk.match(/title: "([^"]+)"/)?.[1];
  if (!slug || !title) continue;
  for (const [, asin] of chunk.matchAll(/\/dp\/(B[0-9A-Z]{9})/g)) add(slug, title, asin);
}

// The template's per-article grids and spotlights are rendered above the body,
// so a mismatch there is just as visible as one in the prose.
// Article titles come from articles.ts above; an article whose products live
// only in the template has no body links, so look the title up there rather
// than falling back to the slug — the model judges far better with the real
// title than with "affordable-headlamps-camping".
const titleBySlug = new Map(
  [...articlesSrc.matchAll(/slug: "([^"]+)",\s*\n\s*title: "([^"]+)"/g)].map((m) => [m[1], m[2]]),
);
for (const block of pageSrc.split(/\n  "(?=[a-z0-9-]+": \[)/).slice(1)) {
  const slug = block.match(/^([a-z0-9-]+)": \[/)?.[1];
  if (!slug) continue;
  const title = byArticle.get(slug)?.title ?? titleBySlug.get(slug) ?? slug;
  for (const [, asin] of block.matchAll(/\/dp\/(B[0-9A-Z]{9})/g)) add(slug, title, asin);
  for (const [, asin] of block.matchAll(/asin: "(B[0-9A-Z]{9})"/g)) add(slug, title, asin);
}

const pairs = [];
for (const { slug, title, asins } of byArticle.values()) {
  for (const asin of asins) {
    const product = catalog[asin];
    pairs.push({ slug, articleTitle: title, asin, productTitle: product?.title ?? null, price: product?.price ?? null });
  }
}

// ── ask the model, one product at a time ──────────────────────────────────
const SYSTEM =
  "You check whether a product belongs in a camping-gear buying guide. " +
  "Reply with exactly one word: MATCH if a reader of that article would " +
  "reasonably expect to see this product recommended, or MISMATCH if it is " +
  "a different category of product entirely. Accessories and closely " +
  "related gear count as MATCH. No other text.";

const readVote = (text) => {
  const t = String(text).toUpperCase();
  return t.includes("MISMATCH") ? "MISMATCH" : t.includes("MATCH") ? "MATCH" : "UNCLEAR";
};

/**
 * One verdict per pair, by majority of an independent panel.
 *
 * WHY THIS IS NOT A SINGLE CALL ANY MORE. It was, and it under-reported.
 * Running the identical audit three times over the same 30 articles returned 5,
 * 3 and 3 flags — the set changed run to run, and a live defect (Rite in the
 * Rain PENS recommended in "How to Camp in Rain", a pure keyword collision)
 * surfaced in only one run of three. An audit whose answer depends on when you
 * ran it cannot be wired into the cycle, because a clean report means nothing.
 *
 * Same fix the content gate got: vote, and require corroboration. `panel`
 * spreads votes across DIFFERENT PROVIDERS — three samples of one model agree
 * with themselves for reasons unrelated to whether the product fits — and runs
 * them in parallel, so three votes cost about the wall-clock of one.
 *
 * On the `reviewer` role, not `cheap`, deliberately reversing an earlier move
 * in the other direction: `cheap`'s third candidate is llama3.2:3b, which this
 * machine measured answering "214" to "what is 2+2". A three-vote consensus
 * where one voter is a 3B model is not a consensus, and with voting the cost
 * that matters is a wrong verdict, not a fraction of a cent per call.
 */
async function verdict({ articleTitle, productTitle }) {
  const { results, independent } = await panel("reviewer", {
    system: SYSTEM,
    user: `Article: "${articleTitle}"\nProduct: "${productTitle}"\n\nMATCH or MISMATCH?`,
    maxTokens: 8000,
    parse: "text",
  }, { size: VOTES });

  const votes = results.map((r) => ({ vote: readVote(r.value), provider: r.provider, model: r.model }));
  if (!votes.length) return { verdict: "ERROR", votes, independent };

  const mismatches = votes.filter((v) => v.vote === "MISMATCH").length;
  /* Majority of the votes that ANSWERED, not of the votes requested: if two
   * providers are down, one surviving MISMATCH out of one is a majority and
   * should be reported as such rather than silently failing the threshold. */
  const flag = mismatches * 2 > votes.length;
  return { verdict: flag ? "MISMATCH" : "MATCH", votes, independent, mismatches, total: votes.length };
}

const problems = [];
let split = 0;          // pairs where the panel disagreed with itself
let singleVendor = 0;   // pairs decided without cross-provider corroboration
for (const p of pairs) {
  if (!p.productTitle) {
    problems.push({ ...p, verdict: "NOT-IN-CATALOG" });
    continue;
  }
  const v = await verdict(p);
  if (v.mismatches > 0 && v.mismatches < v.total) split += 1;
  if (v.votes.length && !v.independent) singleVendor += 1;
  if (v.verdict === "MISMATCH") {
    problems.push({ ...p, verdict: v.verdict, votes: `${v.mismatches}/${v.total}`, independent: v.independent, panel: v.votes });
  }
  if (!JSON_OUT) process.stdout.write(v.verdict === "MISMATCH" ? "X" : v.verdict === "MATCH" ? "." : "?");
}

if (JSON_OUT) {
  console.log(JSON.stringify(problems, null, 2));
} else {
  console.log(`\n\nchecked ${pairs.length} article/product pairs across ${byArticle.size} articles`);
  console.log(`panel: ${VOTES} votes per pair · ${split} pair(s) split the vote`);
  /* Surfaced rather than buried: if every pair was judged by one vendor the
   * result is the old single-vendor audit wearing a consensus label, and the
   * reader has to be told that instead of inferring it. */
  if (singleVendor) console.log(`WARNING: ${singleVendor} pair(s) judged WITHOUT cross-provider corroboration`);
  if (!problems.length) {
    console.log("no mismatches");
  } else {
    console.log(`\n${problems.length} problem(s):\n`);
    for (const p of problems) {
      console.log(`  ${p.slug}`);
      console.log(`    article : ${p.articleTitle}`);
      console.log(`    product : ${p.asin}  ${p.price ?? "unpriced"}  ${p.productTitle ?? "(not in catalog)"}`);
      console.log(`    verdict : ${p.verdict}${p.votes ? `  (${p.votes} votes${p.independent ? ", cross-provider" : ", SINGLE VENDOR"})` : ""}\n`);
    }
  }
}
