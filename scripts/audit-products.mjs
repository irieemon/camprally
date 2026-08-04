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
import { homedir } from "node:os";

const ROOT = new URL("..", import.meta.url).pathname;
const JSON_OUT = process.argv.includes("--json");
const MODEL = "MiniMax-M2.7";
const BASE = "https://api.minimax.io/anthropic/v1/messages";

function apiKey() {
  if (process.env.MINIMAX_API_KEY) return process.env.MINIMAX_API_KEY;
  try {
    const k = JSON.parse(readFileSync(`${homedir()}/.openclaw/agents/main/agent/auth-profiles.json`, "utf8"))
      ?.profiles?.["minimax:global"]?.key;
    if (k) return k;
  } catch { /* fall through */ }
  throw new Error("No MiniMax key");
}

const catalog = JSON.parse(readFileSync(`${ROOT}src/data/catalog.json`, "utf8")).products ?? {};
const articlesSrc = readFileSync(`${ROOT}src/data/articles.ts`, "utf8");
const pageSrc = readFileSync(`${ROOT}src/app/blog/[slug]/page.tsx`, "utf8");

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
async function verdict({ articleTitle, productTitle }) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey(), "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system:
        "You check whether a product belongs in a camping-gear buying guide. " +
        "Reply with exactly one word: MATCH if a reader of that article would " +
        "reasonably expect to see this product recommended, or MISMATCH if it is " +
        "a different category of product entirely. Accessories and closely " +
        "related gear count as MATCH. No other text.",
      messages: [{ role: "user", content:
        `Article: "${articleTitle}"\nProduct: "${productTitle}"\n\nMATCH or MISMATCH?` }],
    }),
  });
  if (!res.ok) return "ERROR";
  const d = await res.json();
  const t = (d.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("").toUpperCase();
  return t.includes("MISMATCH") ? "MISMATCH" : t.includes("MATCH") ? "MATCH" : "UNCLEAR";
}

const problems = [];
for (const p of pairs) {
  if (!p.productTitle) {
    problems.push({ ...p, verdict: "NOT-IN-CATALOG" });
    continue;
  }
  const v = await verdict(p);
  if (v === "MISMATCH") problems.push({ ...p, verdict: v });
  if (!JSON_OUT) process.stdout.write(v === "MISMATCH" ? "X" : v === "MATCH" ? "." : "?");
}

if (JSON_OUT) {
  console.log(JSON.stringify(problems, null, 2));
} else {
  console.log(`\n\nchecked ${pairs.length} article/product pairs across ${byArticle.size} articles`);
  if (!problems.length) {
    console.log("no mismatches");
  } else {
    console.log(`\n${problems.length} problem(s):\n`);
    for (const p of problems) {
      console.log(`  ${p.slug}`);
      console.log(`    article : ${p.articleTitle}`);
      console.log(`    product : ${p.asin}  ${p.price ?? "unpriced"}  ${p.productTitle ?? "(not in catalog)"}`);
      console.log(`    verdict : ${p.verdict}\n`);
    }
  }
}
