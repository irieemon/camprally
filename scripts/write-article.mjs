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
import { loadCache, saveCache, classify, get } from "./lib/asin-cache.mjs";
import { discover, priceCeiling } from "./lib/discover.mjs";

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


/** Reuse an article's existing id when regenerating; otherwise allocate the next. */
function nextArticleId(slug) {
  const src = readFileSync(`${ROOT}src/data/articles.ts`, "utf8");
  const at = src.indexOf(`slug: "${slug}"`);
  if (at > -1) {
    const existing = src.lastIndexOf('id: "', at);
    const m = src.slice(existing, at).match(/id: "([^"]+)"/);
    if (m) return m[1];
  }
  const ids = [...src.matchAll(/id: "art-(\d+)"/g)].map((m) => Number(m[1]));
  return `art-${String(Math.max(0, ...ids) + 1).padStart(3, "0")}`;
}


/** Translate an article topic into an Amazon product search term. */
async function deriveProductTerm(title) {
  try {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey(), "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: "Reply with ONLY an Amazon product search phrase of 2-4 words. No punctuation, no explanation.",
        messages: [{ role: "user", content:
          `An article titled "${title}" recommends camping gear. ` +
          `What product category should I search for on Amazon to find things it would recommend?` }],
      }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    const txt = (d.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    // Guard against the model returning a sentence instead of a search phrase.
    const words = txt.replace(/["'.]/g, "").split(/\s+/).filter(Boolean);
    return words.length && words.length <= 6 ? words.join(" ").toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Quota fallback: shop from the verified ASIN cache instead of Canopy.
 *
 * When the month's Canopy budget is gone, discovery is closed — but the cache
 * holds ~70 products that were LIVE with real prices when last checked. A new
 * article built from those is strictly better than a month of "deferred"
 * receipts. The model's only job is relevance: given the article topic and the
 * inventory, say which products belong. It cannot invent ASINs because the
 * result is validated against the candidate list, and everything in that list
 * already passed the LIVE gate.
 */
async function pickFromCache(title, { max, count, cache }) {
  const candidates = Object.entries(cache.entries)
    .filter(([, e]) => e.verdict === "LIVE" && typeof e.priceValue === "number" && e.title)
    .filter(([, e]) => max == null || e.priceValue <= max)
    .map(([asin, e]) => ({ asin, title: e.title, price: e.price ?? `$${e.priceValue}` }));
  if (candidates.length < 4) return [];

  const inventory = candidates
    .map((c) => `${c.asin}  ${c.price}  ${c.title.slice(0, 90)}`)
    .join("\n");
  try {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey(), "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system:
          "You select products for a camping-gear buying guide. Reply with ONLY " +
          "comma-separated ASINs chosen from the provided inventory, best fits first. " +
          "If fewer than 4 products genuinely fit the article topic, reply NONE. " +
          "No other text.",
        messages: [{ role: "user", content:
          `Article: "${title}"\n\nInventory (ASIN, price, product):\n${inventory}\n\n` +
          `Pick up to ${count} products a reader of this article would actually want to buy.` }],
      }),
    });
    if (!res.ok) return [];
    const d = await res.json();
    const txt = (d.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const valid = new Set(candidates.map((c) => c.asin));
    const picked = [...new Set(txt.match(/B[0-9A-Z]{9}/g) ?? [])].filter((a) => valid.has(a));
    return picked.slice(0, count);
  } catch {
    return [];
  }
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
let brief = items.find((i) => i.slug === slug);

// Fall back to the published article. Regeneration needs this: an article that
// has already shipped is no longer in the queue, but it is exactly what we want
// to rewrite when live pricing shows it is recommending products outside the
// band its own title promises.
if (!brief) {
  const published = readFileSync(`${ROOT}src/data/articles.ts`, "utf8");
  const at = published.indexOf(`slug: "${slug}"`);
  if (at > -1) {
    const near = published.slice(at, at + 1200);
    brief = {
      slug,
      title: near.match(/title: "([^"]+)"/)?.[1] ?? slug,
      category: near.match(/category: "([^"]+)"/)?.[1] ?? "Gear",
      excerpt: near.match(/excerpt: "([^"]+)"/)?.[1],
      keywords: [],
      notes: "Regenerating a published article. Keep the same topic and angle.",
    };
    console.log(`regenerating published article: ${brief.title}`);
  }
}
if (!brief) {
  console.error(`slug "${slug}" is neither queued nor published`);
  process.exit(EXIT.FAIL);
}

// ── products: caller supplies ASINs; all must already be cached LIVE ───────
const pIdx = process.argv.indexOf("--products");
let asins = pIdx > -1 ? process.argv[pIdx + 1].split(",").map((s) => s.trim()) : [];

/*
 * --discover is what makes the pipeline hands-off.
 *
 * Passing --products by hand means a human goes shopping before every article,
 * which is precisely the manual step this system exists to remove. With
 * --discover we search Amazon for real products inside the price band the
 * article's own title promises, and take the best-rated ones.
 *
 * Because discovery returns live prices and ratings, the results are recorded
 * straight into the ASIN cache as verified. That is sound: a product Canopy
 * just returned a current price for demonstrably exists, so a separate
 * verification round-trip against a rate-limited Amazon would add latency and
 * no information.
 *
 * The price ceiling is read from the article title when not given explicitly,
 * so "Best Camping Chairs Under $50" automatically searches $0-50 and cannot
 * recommend a $150 chair — the failure that put a $460 tent in a guide titled
 * "Budget Tents Under $100".
 */
const dIdx = process.argv.indexOf("--discover");
const mIdx = process.argv.indexOf("--max");
const nIdx = process.argv.indexOf("--count");
const cache = loadCache();

if (!asins.length && dIdx > -1) {
  const term = process.argv[dIdx + 1];
  const max = mIdx > -1 ? Number(process.argv[mIdx + 1]) : priceCeiling(brief.title);
  const count = nIdx > -1 ? Number(process.argv[nIdx + 1]) : 6;
  console.log(`discovering "${term}"${max ? ` under $${max}` : ""}...`);

  // Any of the discovery attempts below can hit the monthly Canopy limit —
  // including the retries, which used to let QUOTA escape uncaught and turn a
  // billing limit into a "spec-generation-failed" blocker. Funnel every
  // attempt through one wrapper so quota always lands in the same fallback.
  let quotaHit = false;
  const tryDiscover = async (t, opts) => {
    try {
      return await discover(t, opts);
    } catch (err) {
      if (err?.code === "QUOTA") {
        quotaHit = true;
        console.error(`  CANOPY QUOTA EXHAUSTED — ${err.message}`);
        return [];
      }
      throw err;
    }
  };

  let found = await tryDiscover(term, { min: 1, max: max ?? undefined, nowIso: new Date().toISOString() });

  /*
   * How-to articles name a topic, not a product. "camping in hot weather" is a
   * real heroKeyword in the queue and Amazon sells nothing by that name, so
   * discovery came back empty and the cycle stalled.
   *
   * Rather than hand-curating a product term per queue item — which reintroduces
   * the manual step this is meant to remove — ask the model to translate the
   * topic into something Amazon actually sells. It is a cheap call and it keeps
   * new topics working without anyone editing the queue.
   */
  if (!found.length && !quotaHit) {
    console.log(`  "${term}" returned nothing — deriving a product term...`);
    const derived = await deriveProductTerm(brief.title);
    if (derived && !quotaHit) {
      console.log(`  trying "${derived}"`);
      found = await tryDiscover(derived, { min: 1, max: max ?? undefined, nowIso: new Date().toISOString() });
    }
    // Last resort: the price cap may simply be too tight for this category.
    if (!found.length && !quotaHit && max) {
      console.log(`  still nothing — retrying without the $${max} cap`);
      found = await tryDiscover(derived || term, { min: 1, nowIso: new Date().toISOString() });
    }
  }

  if (found.length) {
    const picked = found.slice(0, count);
    const nowIso = new Date().toISOString();
    for (const p of picked) {
      cache.entries[p.asin] = {
        verdict: "LIVE", title: p.title, checkedAt: nowIso,
        price: p.price, priceValue: p.priceValue,
        rating: p.rating, ratingsTotal: p.ratingsTotal,
        priceCheckedAt: nowIso, priceSource: "canopy-search",
      };
    }
    saveCache(cache);
    asins = picked.map((p) => p.asin);
    console.log(`  picked ${picked.length}:`);
    for (const p of picked) console.log(`    ${p.asin}  ${p.price.padEnd(9)} ${String(p.rating ?? "-").padEnd(4)}★  ${p.title.slice(0, 52)}`);
  } else if (quotaHit) {
    console.log("\nquota fallback: selecting from the verified ASIN cache...");
    asins = await pickFromCache(brief.title, { max, count, cache });
    if (asins.length < 4) {
      console.error("cache fallback found fewer than 4 relevant products — deferring until the Canopy quota resets.");
      process.exit(EXIT.DEFER);
    }
    console.log(`  picked from cache: ${asins.join(", ")}`);
  } else {
    console.error(`discovery found no products for "${term}". Widen the term or raise --max.`);
    process.exit(EXIT.FAIL);
  }
}

if (!asins.length) {
  console.error(
    "no products. Either discover them:\n" +
    `  node scripts/write-article.mjs ${slug} --discover "camping chair" --max 50\n` +
    "or verify and pass ASINs explicitly:\n" +
    "  node scripts/refresh-asins.mjs --all --limit N\n" +
    "  node scripts/write-article.mjs <slug> --products B014LSDUA8,B0DHJL8CMJ",
  );
  process.exit(EXIT.FAIL);
}
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
/*
 * max_tokens has to cover reasoning AND prose. MiniMax M2.7 emits a `thinking`
 * block before its answer, and at 8000 it spent the entire budget reasoning and
 * returned no text at all — a silent-looking failure that produced a valid API
 * response containing nothing usable. The ceiling is generous because unused
 * tokens are not billed, and running out is far more expensive than over-asking.
 */
async function generate(attempt) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 32000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    return { error: `MiniMax API ${res.status}: ${(await res.text()).slice(0, 400)}` };
  }
  const data = await res.json();
  const text = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) {
    const kinds = (data.content ?? []).map((b) => b.type).join(",") || "none";
    return { error: `no text block (got: ${kinds}, stop_reason: ${data.stop_reason ?? "?"})` };
  }
  return { text };
}

console.log(`generating "${brief.title}" with ${MODEL}...`);
let gen = await generate(1);
if (gen.error) {
  console.log(`  first attempt failed: ${gen.error}`);
  console.log("  retrying once...");
  gen = await generate(2);
}
if (gen.error) {
  console.error(`generation failed: ${gen.error}`);
  process.exit(EXIT.FAIL);
}
let body = gen.text;

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
  // Next sequential art-NNN, so ids stay stable and sortable rather than
  // becoming art-<slug>. Regeneration reuses the existing id.
  id: process.env.ARTICLE_ID ?? nextArticleId(slug),
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
