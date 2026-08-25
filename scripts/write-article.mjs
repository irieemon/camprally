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
import { EXIT } from "./lib/amazon.mjs";
import { loadCache, saveCache, classify, get } from "./lib/asin-cache.mjs";
import { discover, priceCeiling } from "./lib/discover.mjs";
import { generateImage, heroPrompt } from "./lib/minimax-image.mjs";
import { callRole, lastError, lastErrorTransient, minimaxKey, roleCandidates } from "./lib/llm.mjs";
import { canonicalCategory, knownCategories } from "./lib/taxonomy.mjs";
import { excerptIsDegenerate, MIN_EXCERPT_CHARS } from "./lib/meta.mjs";
import { productLabel } from "./lib/product-label.mjs";

const ROOT = new URL("..", import.meta.url).pathname;

/* Fail before generating rather than after, and name the whole role: with
 * several providers configured, "no MiniMax key" is no longer the same thing as
 * "nothing can write this article". */
if (!roleCandidates("writer").length) {
  console.error(
    "No writer model is configured. Set MINIMAX_API_KEY or GEMINI_API_KEY, or ensure\n" +
    "~/.openclaw/agents/main/agent/auth-profiles.json has profiles['minimax:global'].key",
  );
  process.exit(EXIT.FAIL);
}


/* Every published slug with its title, for the related-guides trailer.
 *
 * The prompt used to say "link to related guides using relative paths like
 * /blog/some-slug" and left the writer to supply the slug. It invented them,
 * plausibly and every single time: 21 of 21 trailers across the site pointed at
 * articles that were never written (/blog/cold-weather-camping-checklist,
 * /blog/how-to-pick-a-sleeping-bag, and one set on example.com). Nothing caught
 * it — the dead-link gate only resolves affiliate ASINs, so an internal 404 is
 * invisible to the pipeline and to the reader until they click.
 *
 * Handing the model a closed menu is the fix: it can only choose wrong, not
 * hallucinate. check-internal-links.mjs is the backstop for when it does. */
function publishedGuides(excludeSlug) {
  const src = readFileSync(`${ROOT}src/data/articles.ts`, "utf8");
  return [...src.matchAll(/slug: "([^"]+)"[\s\S]{0,400}?title: "([^"]+)"/g)]
    .map((m) => ({ slug: m[1], title: m[2] }))
    .filter((a) => a.slug !== excludeSlug);
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
  // rounds: 1 because the caller already treats null as "no term" and carries
  // on; spending 25s of backoff on a hint is not worth the wall clock.
  const r = await callRole("cheap", {
    system: "Reply with ONLY an Amazon product search phrase of 2-4 words. No punctuation, no explanation.",
    user: `An article titled "${title}" recommends camping gear. ` +
      `What product category should I search for on Amazon to find things it would recommend?`,
    maxTokens: 8000,
    parse: "text",
    rounds: 1,
  });
  if (!r) return null;
  // Guard against the model returning a sentence instead of a search phrase.
  const words = r.value.replace(/["'.]/g, "").split(/\s+/).filter(Boolean);
  return words.length && words.length <= 6 ? words.join(" ").toLowerCase() : null;
}

/**
 * Write the meta description.
 *
 * This is the &lt;meta name="description"&gt; and the og:description for the article,
 * so it is the sentence a searcher reads before deciding whether to click. It
 * used to be `${brief.title}.` — the title, with a period — because that was
 * the fallback here and NO brief has ever carried an `excerpt` field. It is not
 * in the brief schema at all. So the fallback was not a fallback, it was the
 * behaviour: 27 of the 30 articles this pipeline has written have a description
 * that restates their own title, wasting the snippet on every one of them.
 *
 * Never blocking on its own failure — a missing description is recoverable and
 * a blocked queue is not. The caller gates on the RESULT instead, which is the
 * check that actually holds: an excerpt that comes back degenerate is refused
 * whether the model failed, refused, or simply parroted the title.
 */
async function deriveExcerpt(title, keywords, body) {
  const r = await callRole("cheap", {
    system:
      "You write meta descriptions for search results. Reply with ONE sentence " +
      "of 140-160 characters. No quotes, no markdown, no label. It must NOT " +
      "restate the article's title — it must tell the reader what they will " +
      "learn or be able to decide after reading.",
    user: [
      `Article title: "${title}"`,
      keywords?.length ? `Target search terms: ${keywords.join(", ")}` : "",
      "",
      "Opening of the article:",
      body.slice(0, 1200),
    ].filter(Boolean).join("\n"),
    maxTokens: 8000,
    parse: "text",
    rounds: 2,
  });
  if (!r) return null;
  const line = r.value.trim().replace(/^["'\s]+|["'\s]+$/g, "").split(/\n/)[0].trim();
  return line || null;
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
  const r = await callRole("cheap", {
    system:
      "You select products for a camping-gear buying guide. Reply with ONLY " +
      "comma-separated ASINs chosen from the provided inventory, best fits first. " +
      "If fewer than 4 products genuinely fit the article topic, reply NONE. " +
      "No other text.",
    user: `Article: "${title}"\n\nInventory (ASIN, price, product):\n${inventory}\n\n` +
      `Pick up to ${count} products a reader of this article would actually want to buy.`,
    // Reasoning happens inside the same token budget on this endpoint. At 2000
    // the model spent the whole allowance thinking about 69 products and hit
    // max_tokens with zero text emitted — so the fallback looked like "nothing
    // relevant" when it was actually "never answered".
    maxTokens: 8000,
    parse: "text",
    rounds: 1,
  });
  if (!r) return [];
  // Validated against the candidate list, so a model that invents an ASIN — or
  // a fallback model less familiar with the format — cannot smuggle one in.
  const valid = new Set(candidates.map((c) => c.asin));
  const picked = [...new Set(r.value.match(/B[0-9A-Z]{9}/g) ?? [])].filter((a) => valid.has(a));
  return picked.slice(0, count);
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

/* Fail loudly on a category no browse group claims — and fail HERE, before the
 * writer call and the hero image, because both cost money and neither is
 * recoverable once spent.
 *
 * An unmapped category errors nowhere downstream. It renders fine; the article
 * simply appears under no filter and on no category hub, reachable only from
 * the flat index. Eight of the first fifty went out that way, all of them
 * near-synonyms of a real member (Cooking/Cookware, Shelter/Tents,
 * Apparel/Clothing), because this script took `brief.category` exactly as typed
 * and defaulted to "Gear" when it was missing. Caught here the fix is one word
 * in article-queue.json; caught later it is a published URL with no home. */
const category = canonicalCategory(brief.category ?? "Gear");
if (!category) {
  console.error(
    `brief category ${JSON.stringify(brief.category ?? null)} is not a member of ` +
    `any browse group in src/data/categories.ts.\n` +
    `  known: ${[...knownCategories()].sort().join(", ")}\n` +
    `  fix the brief in article-queue.json, or add the category to a group's ` +
    `members if it is genuinely new.`,
  );
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
      console.log("deferring: product-data-quota");
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

/* Deliberately NOT "<name>  — token AMZ_n". That was the old shape, and the
 * writer mirrored the line back as its heading — "### <name> — AMZ_5" — putting
 * the bare token where a link should be. The instruction format is the strongest
 * example in the prompt; make it look nothing like a heading. */
const productLines = products
  .map((p, i) => `  ${i + 1}. ${p.title}\n     token: AMZ_${i + 1}`)
  .join("\n");

const user = [
  `Title: ${brief.title}`,
  `Category: ${brief.category ?? "Gear"}`,
  `Target keywords: ${(brief.keywords ?? []).join(", ")}`,
  brief.notes ? `Editorial notes: ${brief.notes}` : "",
  "",
  "Products to feature, in this order. Link each exactly once using its token,",
  "in Markdown form: **[Check the <name> on Amazon](AMZ_n)**",
  "A token is ONLY ever valid inside the parentheses of a Markdown link. Never",
  "write a bare token in a heading or in prose — a heading is the product name",
  "and nothing else.",
  productLines,
  "",
  "",
  "End with a short italic line of 2-3 related guides, in Markdown form:",
  "*Related guides: [Title](/blog/slug) · [Title](/blog/slug)*",
  "Choose ONLY from the list below and copy the slug EXACTLY as written. Never",
  "invent a slug, never guess one from a title, and never link anything not on",
  "this list — every other path is a 404. Pick the ones closest in topic:",
  publishedGuides(brief.slug)
    .map((a) => `  /blog/${a.slug} — ${a.title}`)
    .join("\n"),
].filter(Boolean).join("\n");

// ── call ──────────────────────────────────────────────────────────────────
/*
 * max_tokens has to cover reasoning AND prose. MiniMax M2.7 emits a `thinking`
 * block before its answer, and at 8000 it spent the entire budget reasoning and
 * returned no text at all — a silent-looking failure that produced a valid API
 * response containing nothing usable. The ceiling is generous because unused
 * tokens are not billed, and running out is far more expensive than over-asking.
 */
/* Generation goes through the `writer` role rather than a private fetch here.
 *
 * The retry, the backoff and the transient-status list all moved into
 * lib/llm.mjs, unchanged in behaviour but now applied across providers: when
 * MiniMax returns 529 the next attempt goes to a DIFFERENT model immediately
 * instead of re-asking the overloaded one after a sleep. The 09:00 deferral on
 * 2026-08-06 would simply have been an article written by the second candidate.
 *
 * max_tokens has to cover reasoning AND prose. At 8000 the model spent the
 * entire budget reasoning and returned no text at all — a valid API response
 * containing nothing usable. The ceiling is generous because unused tokens are
 * not billed and running out costs far more than over-asking. */
console.log(`generating "${brief.title}" via the writer role...`);
const gen = await callRole("writer", {
  system,
  user,
  maxTokens: 32000,
  parse: "text",
  onAttempt: (msg) => console.log(`  ${msg}`),
});

if (!gen) {
  const why = lastError();
  if (lastErrorTransient()) {
    // Printed to stdout, and in this exact shape, because run-cycle reads it to
    // name the deferral in the receipt.
    console.log(`deferring: model-overloaded`);
    console.error(`generation deferred — every writer candidate was busy: ${why}`);
    process.exit(EXIT.DEFER);
  }
  console.error(`generation failed: ${why}`);
  process.exit(EXIT.FAIL);
}

/* Which model wrote it, recorded rather than assumed. The writer role can fall
 * back, so "MiniMax wrote every article" stopped being true the moment a second
 * provider was configured, and quality drift is impossible to investigate
 * without knowing who was holding the pen. */
console.log(`  written by ${gen.provider}/${gen.model}`);
let body = gen.value;

// ── post-process and validate the model's output ──────────────────────────
body = body.replace(/^```[a-z]*\n?/gm, "").replace(/```$/gm, "").trim();
body = body.replace(/`/g, "'"); // template-literal safety

/* The writer is asked for `**[Check the <name> on Amazon](AMZ_n)**` and does not
 * always comply. On memorial-day-camping-checklist-2026 it dropped the BARE
 * token into each pick's heading — "### Zonon RV Checklist Board — AMZ_5" — and
 * substitution turned that into a naked affiliate URL sitting in an h3, ninety
 * characters of query-string where a product name should end. Nothing caught
 * it: the leftover check below only looks for tokens that SURVIVED
 * substitution, and this one did not survive, it was consumed into a URL.
 *
 * A heading is repaired rather than regenerated — the product name in front of
 * the token is already right, and the section's closing paragraph carries the
 * properly-linked CTA — so the token is simply dropped. A bare token anywhere
 * else fails the run: guessing where a link belongs mid-prose is not repair. */
/* [ \t] and not \s on both sides. \s matches a newline, and under /m the `$`
 * happily sits at the end of the FOLLOWING blank line, so a greedy trailing
 * \s* swallows the blank line that separates the heading from its paragraph. */
body = body.replace(/^(#{1,6} .+?)[ \t]*[—–-]?[ \t]*AMZ_\d+[ \t]*$/gm, "$1");

const unlinked = body.match(/(?<!\]\()AMZ_\d+/g);
if (unlinked) {
  console.error(
    `model used token(s) outside markdown link syntax: ${[...new Set(unlinked)].join(", ")}`,
  );
  process.exit(EXIT.FAIL);
}

/* Bounded on both sides. A plain replaceAll("AMZ_1", …) also rewrites the
 * "AMZ_1" inside "AMZ_10", leaving the first product's URL followed by a
 * stray "0" — which lands in the query string as tag=camprally-200 and quietly
 * unattributes the click. Only bites at ten or more products, which the longer
 * roundup briefs do reach. */
products.forEach((p, i) => {
  body = body.replace(
    new RegExp(`\\bAMZ_${i + 1}\\b`, "g"),
    `https://www.amazon.com/dp/${p.asin}?tag=camprally-20`,
  );
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

// ── hero image (best-effort) ──────────────────────────────────────────────
// image-01 shares the coding-plan quota with text, so this is effectively
// free — but never publish-blocking: on any failure the page keeps using
// HERO_IMAGES.default exactly as it did before.
const heroOut = `${ROOT}public/images/heroes/${slug}.jpg`;
const heroPath = await generateImage({
  prompt: heroPrompt(brief.title, brief.category ?? "camping gear"),
  outPath: heroOut,
  // image-01 is MiniMax-native and has no Gemini equivalent wired up, so this
  // one still asks for the MiniMax key by name rather than going through a role.
  apiKey: minimaxKey(),
});
console.log(heroPath
  ? `hero image → public/images/heroes/${slug}.jpg`
  : "no hero image — page will use the site default");

// ── meta description ──────────────────────────────────────────────────────
let excerpt = brief.excerpt?.trim() || null;
if (!excerpt) {
  excerpt = await deriveExcerpt(brief.title, brief.keywords, body);
  console.log(excerpt ? `meta description → "${excerpt}"` : "meta description: model gave nothing");
}
/* The gate that makes the title-as-description regression unrepeatable. It is
 * deliberately on the VALUE, not on whether the model answered: a parroted
 * title and a failed call are the same defect from the reader's side, and only
 * checking the value catches both. */
if (excerptIsDegenerate(excerpt, brief.title)) {
  console.error(
    `meta description is the title restated (${JSON.stringify(excerpt)}) — ` +
    `this wastes the search snippet.\n` +
    `  add an "excerpt" to this brief in article-queue.json, or re-run to let ` +
    `the model try again.`,
  );
  process.exit(EXIT.FAIL);
}
if (excerpt.length < MIN_EXCERPT_CHARS) {
  console.error(
    `meta description is only ${excerpt.length} chars (${JSON.stringify(excerpt)}) — ` +
    `Google renders roughly 155, so this leaves most of the snippet unused.`,
  );
  process.exit(EXIT.FAIL);
}

// ── emit spec ─────────────────────────────────────────────────────────────
const spec = {
  // Next sequential art-NNN, so ids stay stable and sortable rather than
  // becoming art-<slug>. Regeneration reuses the existing id.
  id: process.env.ARTICLE_ID ?? nextArticleId(slug),
  slug,
  title: brief.title,
  excerpt,
  category,
  date: (process.env.RUN_DATE ?? new Date().toISOString()).slice(0, 10),
  readTime: `${Math.max(4, Math.round(words / 200))} min read`,
  gridTitle: `${brief.title} — Quick Comparison`,
  ...(heroPath ? { hero: `/images/heroes/${slug}.jpg` } : {}),
  products: products.map((p) => ({
    asin: p.asin,
    label: productLabel(p.title),
    detail: "", note: "", category: "", icon: "🏕️",
  })),
  body,
};

mkdirSync(`${ROOT}specs`, { recursive: true });
writeFileSync(OUT, JSON.stringify(spec, null, 2) + "\n");
console.log(`wrote ${OUT} — ${words} words, ${products.length} product link(s)`);
console.log(`next: node scripts/publish-article.mjs ${OUT}`);
