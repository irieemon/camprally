#!/usr/bin/env node
/**
 * Generate an article spec with MiniMax.
 *
 *   node scripts/write-article.mjs <slug>          # pick from article-queue.json
 *   node scripts/write-article.mjs <slug> --out specs/art-025.json
 *
 * The model's job is deliberately narrow: given a topic brief and a list of
 * products whose ASINs are ALREADY verified live, write prose. It does not
 * choose products, does not invent ASINs, does not touch the filesystem, and
 * does not run shell commands.
 *
 * That constraint is the point. In April this model was given broad filesystem
 * authority inside OpenClaw and wrote to /root/.openclaw/... and
 * /home/seanmcinerney/... on a Mac — it guesses at Linux paths under
 * uncertainty. Confined to prose it is strong and cheap, which is exactly what
 * bulk article generation needs. Everything structural is done by
 * publish-article.mjs, which cannot hallucinate.
 *
 * Output is a spec JSON for publish-article.mjs. Nothing ships until that
 * script's link gate passes.
 *
 * Exit codes: 0 wrote spec · 1 failed
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { EXIT } from "./lib/amazon.mjs";
import { loadCache, classify, get } from "./lib/asin-cache.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MODEL = "MiniMax-M2.7";
const BASE = "https://api.minimax.io/anthropic/v1/messages";

function apiKey() {
  if (process.env.MINIMAX_API_KEY) return process.env.MINIMAX_API_KEY;
  const p = `${homedir()}/.openclaw/agents/main/agent/auth-profiles.json`;
  try {
    const k = JSON.parse(readFileSync(p, "utf8"))?.profiles?.["minimax:global"]?.key;
    if (k) return k;
  } catch { /* fall through */ }
  console.error(
    "No MiniMax key. Set MINIMAX_API_KEY or ensure ~/.openclaw/.../auth-profiles.json has profiles['minimax:global'].key",
  );
  process.exit(EXIT.FAIL);
}

const slug = process.argv[2];
if (!slug) {
  console.error("usage: write-article.mjs <slug> [--out path] [--products A,B,C]");
  process.exit(EXIT.FAIL);
}
const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : `${ROOT}specs/${slug}.json`;

// ── the brief ─────────────────────────────────────────────────────────────
const queue = JSON.parse(readFileSync(`${ROOT}article-queue.json`, "utf8"));
const items = Array.isArray(queue) ? queue : queue.articles ?? queue.queue ?? queue.items ?? [];
const brief = items.find((i) => i.slug === slug);
if (!brief) {
  console.error(`slug "${slug}" not found in article-queue.json`);
  process.exit(EXIT.FAIL);
}

// ── products: caller supplies ASINs; all must already be cached LIVE ───────
const pIdx = process.argv.indexOf("--products");
const asins = pIdx > -1 ? process.argv[pIdx + 1].split(",").map((s) => s.trim()) : [];
if (!asins.length) {
  console.error(
    "no --products given. Verify candidate ASINs first:\n" +
    "  node scripts/refresh-asins.mjs --all --limit N\n" +
    "then pass them: --products B014LSDUA8,B0DHJL8CMJ",
  );
  process.exit(EXIT.FAIL);
}
const cache = loadCache();
const { dead, unseen } = classify(cache, asins);
if (dead.length || unseen.length) {
  console.error(`refusing to write against unverified products.`);
  if (dead.length) console.error(`  dead:   ${dead.join(", ")}`);
  if (unseen.length) console.error(`  unseen: ${unseen.join(", ")}`);
  process.exit(EXIT.FAIL);
}
const products = asins.map((a) => ({ asin: a, title: get(cache, a)?.title || a }));

// ── prompt ────────────────────────────────────────────────────────────────
const system = [
  "You write buying guides for CampRally, a budget camping gear affiliate site.",
  "Return ONLY the article body in Markdown. No preamble, no code fences, no frontmatter.",
  "",
  "Hard rules:",
  "- Never invent an Amazon ASIN, URL, or link. Use the exact placeholder tokens given.",
  "- Never state a specific dollar price or star rating. Prices change and stale numbers",
  "  lose trust. Describe capability instead ('rated to 300 lbs', 'mesh back').",
  "- Never claim you tested, owned, or measured anything.",
  "- No backtick characters anywhere in the output.",
  "- Open with an H1 that matches the title. Use H2 for sections.",
  "- 900-1400 words. Concrete and specific; no filler.",
  "- Include a short section on how to choose, then the picks, then a verdict.",
].join("\n");

const productLines = products
  .map((p, i) => `  ${i + 1}. ${p.title}  — link with the exact token AMZ_${i + 1}`)
  .join("\n");

const user = [
  `Title: ${brief.title}`,
  `Category: ${brief.category ?? "Gear"}`,
  `Target keywords: ${(brief.keywords ?? []).join(", ")}`,
  brief.notes ? `Editorial notes: ${brief.notes}` : "",
  "",
  "Products to feature, in this order. Link each exactly once using its token,",
  "in Markdown form: **[Check the <name> on Amazon](AMZ_n)**",
  productLines,
  "",
  "End with a short italic line linking to related guides using relative paths",
  "like /blog/some-slug.",
].filter(Boolean).join("\n");

// ── call ──────────────────────────────────────────────────────────────────
console.log(`generating "${brief.title}" with ${MODEL}...`);
const res = await fetch(BASE, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": apiKey(),
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 8000,
    system,
    messages: [{ role: "user", content: user }],
  }),
});

if (!res.ok) {
  console.error(`MiniMax API ${res.status}: ${(await res.text()).slice(0, 500)}`);
  process.exit(EXIT.FAIL);
}
const data = await res.json();
let body = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();

if (!body) {
  console.error(`empty response from model: ${JSON.stringify(data).slice(0, 400)}`);
  process.exit(EXIT.FAIL);
}

// ── post-process and validate the model's output ──────────────────────────
body = body.replace(/^```[a-z]*\n?/gm, "").replace(/```$/gm, "").trim();
body = body.replace(/`/g, "'"); // template-literal safety

products.forEach((p, i) => {
  body = body.replaceAll(`AMZ_${i + 1}`, `https://www.amazon.com/dp/${p.asin}?tag=camprally-20`);
});

const leftover = body.match(/AMZ_\d+/g);
if (leftover) {
  console.error(`model left unresolved tokens: ${[...new Set(leftover)].join(", ")}`);
  process.exit(EXIT.FAIL);
}
const invented = [...body.matchAll(/\/dp\/(B[0-9A-Z]{9})/g)].map((m) => m[1])
  .filter((a) => !asins.includes(a));
if (invented.length) {
  console.error(`model invented ASIN(s) not in the verified set: ${[...new Set(invented)].join(", ")}`);
  process.exit(EXIT.FAIL);
}
const words = body.split(/\s+/).length;
if (words < 500) {
  console.error(`output too short (${words} words) — likely a truncated or refused generation`);
  process.exit(EXIT.FAIL);
}

// ── emit spec ─────────────────────────────────────────────────────────────
const spec = {
  id: process.env.ARTICLE_ID ?? `art-${slug}`,
  slug,
  title: brief.title,
  excerpt: brief.excerpt ?? `${brief.title}.`,
  category: brief.category ?? "Gear",
  date: (process.env.RUN_DATE ?? new Date().toISOString()).slice(0, 10),
  readTime: `${Math.max(4, Math.round(words / 200))} min read`,
  gridTitle: `${brief.title} — Quick Comparison`,
  products: products.map((p) => ({
    asin: p.asin,
    label: p.title.split(",")[0].slice(0, 34),
    detail: "", note: "", category: "", icon: "🏕️",
  })),
  body,
};

mkdirSync(`${ROOT}specs`, { recursive: true });
writeFileSync(OUT, JSON.stringify(spec, null, 2) + "\n");
console.log(`wrote ${OUT} — ${words} words, ${products.length} product link(s)`);
console.log(`next: node scripts/publish-article.mjs ${OUT}`);
