/**
 * Remediating a dead affiliate product in published articles (ADR-0001).
 *
 * WHY THIS EXISTS. refresh-asins has gated publishing on cached DEAD verdicts
 * since 507e57e, which is right as a detector and wrong as a gate: one
 * discontinued product (B07F2VP353, Fire-Maple Fixed Star 1, DEAD 2026-09-19)
 * stopped ALL new publishing until a human hand-edited three guides. Sean's
 * policy is auto-swap gated by review, and when that cannot be done safely,
 * unlink the product, keep the text, and tell him. New articles keep
 * publishing either way.
 *
 * Every function here is pure over strings, the ledger, and injected
 * dependencies (search, link check, writer, reviewer). The CLI in
 * scripts/remediate-dead-asins.mjs owns the file system, the build, and
 * restore-on-failure. That split is what lets the tests drive the whole state
 * machine — including the positive controls — without spending a Canopy
 * request or a MiniMax call.
 *
 * The state machine is bounded by construction. Each run ends a dead ASIN in
 * exactly one of: swapped, unlinked, mixed, or pending-with-a-deadline. Nothing
 * here can return "blocked", because the 72h deadline plus a deterministic,
 * model-free unlink means quota exhaustion, a MiniMax weekly cap or Amazon
 * throttling end, at worst, in an unlink three days later.
 */

import { productLabel } from "./product-label.mjs";

// ── Sean's decisions, 2026-09-22 (ADR-0001 "Open decisions") ────────────────
/* ±30% of the last known price. At ±50% the "budget" guides start drifting
 * into the Jetboil tier, which is a different article. Capped again by the
 * article's own "under $N" when it has one. */
export const PRICE_BAND = 0.3;
/* 72h covers a MiniMax daily blip, not the weekly-cap reset — a cap that lands
 * mid-remediation ends in an unlink, which is the intended trade. */
export const DEADLINE_HOURS = 72;
export const MIN_RATING = 4.2;
export const MAX_ATTEMPTS = 2;
/* A replacement that itself dies within this window is unlinked, not swapped
 * again. Without it a flaky category could churn a guide weekly. */
export const CHURN_DAYS = 30;
/* A Canopy search older than this is refetched (one request) before picking —
 * a week-old search can name a product that has since gone. */
export const SEARCH_MAX_AGE_DAYS = 7;
/* Per-segment length tolerance for a rewrite. Wider than this and the model is
 * adding or dropping content rather than swapping a product. */
export const LENGTH_TOLERANCE = 0.4;
/** The character range checkRewrite accepts for a rewritten paragraph. */
export const lengthRange = (text) => [Math.ceil(text.length * (1 - LENGTH_TOLERANCE)), Math.floor(text.length * (1 + LENGTH_TOLERANCE))];

export const TAG = "camprally-20";
export const amazonLink = (asin) => `https://www.amazon.com/dp/${asin}?tag=${TAG}`;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CENTS = /\$[\d,]+\.\d{2}/;
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── naming the dead product ────────────────────────────────────────────────

/* A model designator is anything with a digit ("1", "X1", "2-Burner") or in
 * all caps ("GCI", "HX"). Brands come first in Amazon titles, and the model
 * name sits between the brand and the first category word. */
const isModelToken = (t) => /\d/.test(t) || (/^[A-Z0-9-]{2,}$/.test(t) && /[A-Z]/.test(t));
const STOPWORDS = new Set(["and", "with", "for", "the", "a", "an", "of", "to", "in", "&", "by", "on"]);

/** Index just past the model name: brand at 0, model runs up to the last model token in the first six. */
function modelCut(tokens) {
  let cut = 1;
  for (let i = 1; i < Math.min(tokens.length, 6); i++) if (isModelToken(tokens[i])) cut = i + 1;
  return cut;
}

/**
 * The Canopy search term, built deterministically from the dead product's title.
 *
 * NO MODEL, on purpose: the `cheap` role leads with MiniMax, which is metered
 * and shares a weekly cap with the revenue rails. Drop the colour/size text
 * after the first comma, the brand, the model name, then stopwords.
 *
 *   "Fire-Maple Fixed Star 1 Backpacking and Camping Stove System, Black 18oz"
 *     -> "backpacking camping stove system"
 */
export function searchTerm(title) {
  const tokens = String(title).split(",")[0].split(/\s+/).filter(Boolean);
  return tokens
    .slice(modelCut(tokens))
    .filter((t) => !isModelToken(t))
    .map((t) => t.toLowerCase().replace(/[^a-z-]/g, ""))
    .filter((t) => t && !STOPWORDS.has(t))
    .join(" ");
}

/* Tails that name a bundle rather than a thing. When the term ends in one, the
 * thing is the word before it and the tail becomes a required qualifier, with
 * its synonyms — an integrated stove system is sold as a "system", a "pot" set
 * or an "integrated" stove, and a bare stove is a different product. */
const BUNDLE_TAILS = {
  system: ["system", "pot", "integrated"],
  set: ["set", "kit"],
  kit: ["kit", "set"],
};

/**
 * What kind of product the replacement must be. A candidate that reads fluently
 * but is the wrong type is exactly what review would miss — a lantern in the
 * price band would get a perfectly grammatical stove paragraph.
 */
export function productType(term, deadTitle = "") {
  const t = term.split(/\s+/).filter(Boolean);
  const last = t.at(-1);
  const form = formFactor(deadTitle);
  if (BUNDLE_TAILS[last] && t.length >= 2) return { head: t.at(-2), qualifiers: BUNDLE_TAILS[last], form };
  return { head: last ?? "", qualifiers: null, form };
}

/* Form factors the head noun alone does not pin down. The dead title decides
 * whether one applies; when it does, a candidate must carry one of its signals
 * AND none of the signals of the look-alike it is most often confused with.
 *
 * Integrated cook system: burner and heat-exchanger pot that lock together as
 * one unit (Jetboil-class). The look-alike is a pot set sold with a separate
 * stove — "Pot & … Stove Cooking Set", "Pots with Heat Exchanger … Cooking Set
 * with Portable Camping Stove … Mess Kit", "Cookware … Set with Stove, All in
 * One". Those carry integrated-sounding words, which is why the look-alike
 * signals veto rather than merely fail to qualify. Found by the 2026-09-22 dry
 * run, where "pot" satisfied the system qualifier and two review seats caught
 * a pot set with a separate burner standing in for the Fixed Star 1. */
const FORM_FACTORS = [
  {
    id: "integrated cook system",
    signals: [/\b(?:stove|cook(?:ing)?) systems?\b/i, /\bintegrated\b/i, /\bheat[- ]?exchangers?\b/i, /\ball[- ]in[- ]one\b/i],
    lookalike: [
      /\bcook(?:ing|ware)? (?:set|kit)s?\b/i,
      /\bcookware\b/i,
      /\bmess kits?\b/i,
      /\bpots? (?:and|&) pans?\b/i,
      /\b\d+\s*(?:pcs?|pieces?)\b/i,
      /\bpots?\s*(?:&|\+|and)\s.*\bstoves?\b/i,
      /\b(?:set|kit|pots?)\b.*\bwith\b.*\bstoves?\b/i,
    ],
  },
];

/** The dead product's form factor, from its own title, or null when none applies. */
export function formFactor(deadTitle) {
  const t = String(deadTitle ?? "");
  for (const f of FORM_FACTORS) {
    if (f.signals.some((r) => r.test(t)) && !f.lookalike.some((r) => r.test(t))) return { id: f.id, signals: f.signals, lookalike: f.lookalike };
  }
  return null;
}

/** Why a title fails the form factor, or null when it holds. */
export function formMismatch(title, form) {
  if (!form) return null;
  const veto = form.lookalike.find((r) => r.test(title));
  if (veto) return `not an ${form.id}: "${title.match(veto)[0]}"`;
  if (!form.signals.some((r) => r.test(title))) return `not an ${form.id}: no system/integrated/heat-exchanger signal`;
  return null;
}

export function typeMatches(title, { head, qualifiers, form = null }) {
  if (!head || !new RegExp(`\\b${reEsc(head)}(e?s)?\\b`, "i").test(title)) return false;
  if (formMismatch(title, form)) return false;
  if (!qualifiers) return true;
  return qualifiers.some((q) => new RegExp(`\\b${reEsc(q)}(e?s)?\\b`, "i").test(title));
}

/**
 * Every name the prose might use for the product, longest first.
 *
 * Full grid label, then brand+model, then model alone. Spec labels are NOT a
 * source: the dispersed-camping spec stores "Fire-Maple Fixed Star 1
 * Backpackin", a character slice that matches nothing an article says.
 *
 *   "Fire-Maple Fixed Star 1 Backpacking and Camping Stove System"
 *     -> [that, "Fire-Maple Fixed Star 1", "Fixed Star 1"]
 */
export function aliasesFor(label) {
  const tokens = String(label).split(/\s+/).filter(Boolean);
  const out = [tokens.join(" ")];
  const cut = modelCut(tokens);
  // cut === 1 means no model token was found, and a brand alone ("Coleman")
  // names half the catalogue, so it is never an alias.
  if (cut > 1) {
    out.push(tokens.slice(0, cut).join(" "));
    if (cut > 2) out.push(tokens.slice(1, cut).join(" "));
  }
  return [...new Set(out)].sort((a, b) => b.length - a.length);
}

const aliasRe = (aliases) => new RegExp(aliases.map((a) => `\\b${reEsc(a)}\\b`).join("|"), "i");

// ── candidate selection ────────────────────────────────────────────────────

/**
 * The price band. Rounded to whole dollars, which is what the ADR quotes
 * ($35-$65 for a $49.95 anchor) and what Amazon's refinement works in anyway.
 * Capped by the LOWEST "under $N" among the affected guides, because one
 * replacement serves all of them and must honour every promise.
 */
export function priceBand(anchor, ceilings = []) {
  let min = Math.round(anchor * (1 - PRICE_BAND));
  let max = Math.round(anchor * (1 + PRICE_BAND));
  const caps = ceilings.filter((c) => typeof c === "number");
  if (caps.length) max = Math.min(max, ...caps);
  return { min, max };
}

/**
 * The best Canopy result that survives every filter, or null.
 *
 * discover() already enforces the band and drops < 50 ratings, and sorts
 * best-rated first; this adds the type check, the rating floor, and the
 * exclusions. Each rejection is recorded so the dry run can say WHY a
 * higher-ranked result lost, which is the evidence the search-term logic needs
 * if the unlink-to-swap ratio ever passes 50%.
 */
export function pickCandidate(results, { type, band, exclude = new Set(), deadInCache = () => false }) {
  const rejected = [];
  for (const p of results ?? []) {
    const why =
      exclude.has(p.asin) ? "already tried or already linked from an affected guide" :
      deadInCache(p.asin) ? "DEAD in the ASIN cache" :
      (band && (p.priceValue < band.min || p.priceValue > band.max)) ? `price ${p.priceValue} outside $${band.min}-$${band.max}` :
      formMismatch(p.title, type.form) ? `form check (${formMismatch(p.title, type.form)})` :
      !typeMatches(p.title, type) ? `type check (needs "${type.head}"${type.qualifiers ? ` + one of ${type.qualifiers.join("/")}` : ""})` :
      (p.rating ?? 0) < MIN_RATING ? `rating ${p.rating} < ${MIN_RATING}` :
      null;
    if (why) { rejected.push({ asin: p.asin, title: p.title.slice(0, 70), why }); continue; }
    return { candidate: p, rejected };
  }
  return { candidate: null, rejected };
}

// ── reading the sources ────────────────────────────────────────────────────
/* sources = { articles, sections, heroAlt, specs: { slug: jsonText } } — the
 * raw text of every hand-authored file a product can live in. Generated files
 * (catalog.json, product-images.json, search-index.json) are rebuilt by the
 * CLI, never edited here. */

const unq = (raw) => JSON.parse(`"${raw}"`);
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** One article's entry in articles.ts, with offsets for splicing. */
export function readArticle(src, slug) {
  const at = src.indexOf(`slug: "${slug}"`);
  if (at < 0) return null;
  const start = src.lastIndexOf("{", at);
  const c0 = src.indexOf("content: `", at) + "content: `".length;
  const c1 = src.indexOf("`", c0);
  const head = src.slice(start, c0);
  const field = (name) => head.match(new RegExp(`\\n\\s*${name}: "((?:[^"\\\\]|\\\\.)*)"`));
  return {
    slug, start, c0, c1, head,
    title: field("title") ? unq(field("title")[1]) : "",
    excerpt: field("excerpt") ? unq(field("excerpt")[1]) : "",
    content: src.slice(c0, c1),
  };
}

export const publishedSlugs = (src) => [...src.matchAll(/^\s*slug: "([^"]+)"/gm)].map((m) => m[1]);

/** The [start, end) span of one slug's block in article-sections.ts. */
function sectionsSpan(src, slug) {
  const start = src.indexOf(`\n  "${slug}": [`);
  if (start < 0) return null;
  const end = src.indexOf("\n  ],", start);
  return { start, end: end < 0 ? src.length : end };
}

/** The label the grid shows for an ASIN — the fullest name the site uses. */
export function gridLabel(sources, asin) {
  const m = sources.sections.match(new RegExp(`label: "((?:[^"\\\\]|\\\\.)*)"[^\\n]*asin: "${asin}"`));
  return m ? unq(m[1]) : null;
}

/**
 * Every place the dead product appears, per article, BEFORE anything is
 * rewritten. This is the ADR's seven-point list:
 *
 *   1. inline /dp/ links           → the paragraph holding the link
 *   2. the product's ### section   → heading, every paragraph, the CTA
 *   3. any other sentence naming an alias (comparison, verdict)
 *   4. title / excerpt / hero alt  → when they name it
 *   5. the product-grid entry      → deterministic, not a segment
 *   6. specs/<slug>.json           → products[] and body, when a spec exists
 *   7. other guides naming it      → the alias scan runs over EVERY article
 *
 * Content is split on blank lines. Joining the pieces back with "\n\n" is
 * lossless whatever the content holds, which is what lets the splice prove
 * that text outside the segments is byte-for-byte unchanged.
 */
export function locate(sources, asin, aliases) {
  const re = aliasRe(aliases);
  const link = new RegExp(`/dp/${asin}\\b`);
  const heroAlt = JSON.parse(sources.heroAlt || "{}");
  const published = publishedSlugs(sources.articles);
  const found = [];

  for (const slug of published) {
    const a = readArticle(sources.articles, slug);
    const blocks = a.content.split("\n\n");
    const hits = new Set();
    for (let i = 0; i < blocks.length; i++) {
      if (link.test(blocks[i]) || re.test(blocks[i])) hits.add(i);
      // The product's own section: its paragraphs describe the product without
      // naming it ("The heat exchanger fins on the pot…"), so the whole section
      // goes, heading to the next heading.
      if (/^#{2,6} /.test(blocks[i].trimStart()) && re.test(blocks[i])) {
        for (let j = i + 1; j < blocks.length && !/^#/.test(blocks[j].trimStart()); j++) hits.add(j);
      }
    }
    const span = sectionsSpan(sources.sections, slug);
    const inGrid = !!span && sources.sections.slice(span.start, span.end).includes(`asin: "${asin}"`);
    const specText = sources.specs[slug];
    const inSpec = !!specText && (specText.includes(asin) || re.test(specText));
    const fields = [];
    if (re.test(a.title)) fields.push("title");
    if (re.test(a.excerpt)) fields.push("excerpt");
    if (heroAlt[slug] && re.test(heroAlt[slug])) fields.push("heroAlt");
    if (!hits.size && !inGrid && !inSpec && !fields.length) continue;

    const idx = [...hits].sort((x, y) => x - y);
    // Blocks inside the product's own ### section: every sentence there is
    // about the product, named or not — the grounding check reads all of them.
    const own = new Set();
    for (let i = 0; i < blocks.length; i++) {
      if (/^#{2,6} /.test(blocks[i].trimStart()) && re.test(blocks[i])) {
        own.add(i);
        for (let j = i + 1; j < blocks.length && !/^#/.test(blocks[j].trimStart()); j++) own.add(j);
      }
    }
    const segments = [
      ...fields.map((f) => ({ id: f, kind: f, text: f === "heroAlt" ? heroAlt[slug] : a[f], before: "", after: "" })),
      ...idx.map((i) => ({
        id: `content#${i}`,
        kind: /^#{2,6} /.test(blocks[i].trimStart()) ? "heading" : /^\*\*\[Check /.test(blocks[i].trim()) ? "cta" : "paragraph",
        index: i,
        own: own.has(i),
        text: blocks[i],
        // Neighbours that are themselves being rewritten are not context.
        before: i > 0 && !hits.has(i - 1) ? blocks[i - 1].slice(-600) : "",
        after: i + 1 < blocks.length && !hits.has(i + 1) ? blocks[i + 1].slice(0, 600) : "",
      })),
    ];
    found.push({ slug, title: a.title, published: true, blocks, segments, inGrid, inSpec, linksDead: link.test(a.content) });
  }

  // Specs for articles that are NOT published. Their product list is dropped,
  // not swapped; that spec's own publish review covers its text.
  for (const [slug, text] of Object.entries(sources.specs)) {
    if (published.includes(slug) || !text.includes(asin)) continue;
    found.push({ slug, title: JSON.parse(text).title ?? slug, published: false, blocks: [], segments: [], inGrid: false, inSpec: true, linksDead: false });
  }
  return found;
}

// ── grounding: what the replacement's own listing supports ────────────────

/**
 * The replacement's listing as one lowercased evidence string: the Canopy
 * title and bullets, the title Amazon's page served at verification (it can
 * differ — dry run 4's page title said "Anodized Aluminum", Canopy's did not),
 * brand and item weight.
 */
export function factsText(candidate) {
  const f = candidate?.facts ?? {};
  return [candidate?.title, f.title, f.pageTitle, f.brand, ...(f.bullets ?? []), f.itemWeight ? `weight ${f.itemWeight}` : ""]
    .filter(Boolean).join("\n").toLowerCase();
}

/* Product-specific claim classes and the listing evidence each one needs.
 * High precision on purpose: a term here that the facts do not support fails
 * the rewrite mechanically, which unlinks that guide. Only words that assert a
 * concrete material, part, ignition, packing, use limit or compatibility of
 * THIS product are listed; generic words ("stove", "pot", "boil") are not.
 * Found by dry run 4: "hard-anodized pot, lid", "piezo igniter", "nests
 * together" and "cannot use over a campfire" were carried over from the
 * Fire-Maple onto an Odoland whose listing says none of them — and all nine
 * seats passed, because no seat had seen the listing. */
const CLAIMS = [
  { id: "hard-anodized", claim: /\bhard[- ]anodi[sz]ed\b/i, needs: /hard[- ]anodi[sz]ed/ },
  { id: "anodized", claim: /\b(?<!hard[- ])anodi[sz]ed\b/i, needs: /anodi[sz]ed/ },
  { id: "titanium", claim: /\btitanium\b/i, needs: /titanium/ },
  { id: "stainless steel", claim: /\bstainless\b/i, needs: /stainless/ },
  { id: "aluminum", claim: /\balumin(?:i)?um\b/i, needs: /alumin/ },
  { id: "non-stick", claim: /\bnon[- ]?stick\b/i, needs: /non[- ]?stick/ },
  { id: "piezo", claim: /\bpiezo\b/i, needs: /piezo/ },
  { id: "igniter", claim: /\bigniters?\b|\bpush[- ]button (?:start|ignit)|\bauto(?:matic)?[- ]ignit/i, needs: /igniter|piezo|push[- ]button|auto(?:matic)?[- ]ignit|electronic ignit/ },
  { id: "lid", claim: /\blids?\b/i, needs: /\blids?\b/ },
  { id: "nests", claim: /\bnest(?:s|ed|ing)?\b|\b(?:packs?|stores?|fits) (?:\w+ )?inside\b/i, needs: /\bnest|(?:fits|stores?|packs?) (?:\w+ )?inside/ },
  { id: "campfire", claim: /\bcampfires?\b|\bopen (?:fire|flame)s?\b/i, needs: /campfire|open (?:fire|flame)/ },
  { id: "windscreen", claim: /\bwind ?(?:screen|shield|guard)s?\b|\bwind[- ](?:resistant|proof)\b/i, needs: /wind/ },
  { id: "regulator", claim: /\bregulat(?:or|ed)\b/i, needs: /regulat/ },
  { id: "fuel type", claim: /\b(?:iso-?butane|propane|white gas|multi-?fuel|liquid fuel)\b/i, needs: null },
  { id: "compatibility", claim: /\bcompatib(?:le|ility)\b/i, needs: /compatib|en ?417|thread/ },
  /* Fit claims (dry run 7). A BREADTH claim — fits/works with most, all, any,
   * standard or universal fuel — needs the listing to say something that broad;
   * "fits 230g gas canister" names one size, not "standard backpacking fuel
   * options". A specific fit ("fits a 230g canister") needs the listing to
   * state a fit to a canister at all. Only fit VERBS trigger these, so a
   * category sentence ("canister systems bundle a burner, pot, and heat
   * exchanger") is untouched. */
  { id: "fits most/standard fuel", claim: /\b(?:fits?|works? with|accepts?|takes|runs? on|compatible with)\s+(?:[\w-]+\s+){0,3}?(?:most|all|any|every|standard|universal|common)\b/i, needs: /\b(?:most|all|any|every|standard|universal|common)\b[^\n]{0,30}(?:canisters?|cartridges?|fuels?|gas)\b|en ?417|lindal/ },
  { id: "canister fit", claim: /\b(?:fits?|works? with|accepts?|takes|runs? on)\s+(?:an?\s+|the\s+)?(?:[\w-]+\s+){0,3}?(?:canisters?|cartridges?|fuel|gas|bottles?|tanks?)\b/i, needs: /\b(?:fits?|compatib\w*)\b[^\n]{0,30}(?:canister|cartridge)|en ?417|thread/ },
  { id: "folding handle", claim: /\bhandles? (?:\w+ )?fold|\bfold(?:ing|-out|s)? (?:\w+ )?handles?\b/i, needs: /fold/ },
];
const UNIT = String.raw`(\d+(?:\.\d+)?)\s*-?\s*(oz|ounces?|lbs?|pounds?|g|grams?|kg|l|liters?|litres?|ml|qt|quarts?|cups?|btu|w|watts?|s|sec(?:ond)?s?|min(?:ute)?s?)\b`;

/**
 * Sentences a grounding check must read in one segment's new text.
 *
 * EVERY sentence of the edited span, wherever it sits relative to the product
 * name — except the ones that belong to ANOTHER product. Dry run 7: the
 * dispersed guide shipped "Compatible with most fuel canisters, it fits
 * standard backpacking fuel options." one sentence after the one naming the
 * Odoland, with a sentence between them that neither named it nor opened with
 * a pronoun; the old adjacency filter (named sentence + pronoun continuations)
 * never read it, and only one seat of three caught it. Attribution now runs
 * the other way: a sentence is exempt only when it is positively about some
 * other product — it links or names one (a brand taken from the other links in
 * this segment and its context), or it opens with a pronoun right after such a
 * sentence. An unattributed sentence ("Compatible with most canisters…") is
 * read. Text outside the segments is never read: pre-existing prose is not
 * under review.
 */
function claimSentences(segment, text, names) {
  const sentences = String(text).split(/(?<=[.!?])\s+|\n+/).filter((x) => x.trim());
  if (segment.own || segment.kind === "heading" || segment.kind === "cta" || segment.index == null) return sentences;
  const mine = new RegExp(names.filter(Boolean).map(reEsc).join("|"), "i");
  const others = new Set();
  for (const src of [segment.text, segment.before, segment.after]) {
    for (const [, lbl] of String(src ?? "").matchAll(/\[([^\]]+)\]\(/g)) {
      if (mine.test(lbl)) continue;
      const brand = lbl.trim().split(/\s+/)[0].replace(/[^\p{L}\p{N}-]/gu, "");
      if (brand.length >= 3 && !/^(?:the|a|an|check|this|our|best|how)$/i.test(brand)) others.add(brand);
    }
  }
  const other = others.size ? new RegExp(`\\b(?:${[...others].map(reEsc).join("|")})\\b`) : null;
  const pronoun = /^(?:it|its|it's|they|their|this|that|these)\b/i;
  let owner = null;
  return sentences.filter((x) => {
    const t = x.trim();
    if (mine.test(t)) owner = "new";
    else if (/\[/.test(t) || (other && other.test(t))) owner = "other";
    else if (!(owner === "other" && pronoun.test(t))) owner = null;
    return owner !== "other";
  });
}

/**
 * Product-specific claims about the replacement that its listing facts do
 * not support. Pure and model-free: [{segment, claim, sentence}].
 *
 * A number with a unit (weight, capacity, boil time, BTU) must appear with
 * the same number in the facts. A fuel type must be named in the facts
 * (each fuel on its own). Everything else is the CLAIMS table.
 */
export function ungroundedClaims(segments, replacements, candidate) {
  const facts = factsText(candidate);
  const label = productLabel(candidate.title);
  const brand = candidate.facts?.brand ?? label.split(/\s+/)[0];
  const out = [];
  for (const s of segments) {
    const t = replacements?.[s.id];
    if (typeof t !== "string") continue;
    const plain = t.replace(/\]\([^)]*\)/g, "]");
    for (const sentence of claimSentences(s, plain, [label, brand])) {
      for (const c of CLAIMS) {
        const m = sentence.match(c.claim);
        if (!m) continue;
        // A fuel type needs that same fuel named ("isobutane" is not "propane").
        const supported = c.needs
          ? c.needs.test(facts)
          : facts.replace(/[- ]/g, "").includes(m[0].toLowerCase().replace(/[- ]/g, ""));
        if (!supported) out.push({ segment: s.id, claim: c.id === "fuel type" ? m[0].toLowerCase() : c.id, sentence: sentence.trim().slice(0, 200) });
      }
      for (const m of sentence.matchAll(new RegExp(UNIT, "gi"))) {
        // "1L" in the product's own name is supported by the title, which is in the facts.
        if (!new RegExp(`(?<![\\d.])${reEsc(m[1])}\\s*-?\\s*[a-z]`, "i").test(facts)) out.push({ segment: s.id, claim: `figure "${m[0]}"`, sentence: sentence.trim().slice(0, 200) });
      }
    }
  }
  return out;
}

/** The facts as the writer and the reviewers see them. No price, ever. */
export const listingFacts = (candidate) => ({
  title: candidate.facts?.title ?? candidate.title,
  ...(candidate.facts?.pageTitle && candidate.facts.pageTitle !== candidate.facts?.title ? { amazonPageTitle: candidate.facts.pageTitle } : {}),
  brand: candidate.facts?.brand ?? null,
  featureBullets: candidate.facts?.bullets ?? [],
  itemWeight: candidate.facts?.itemWeight ?? null,
});

// ── rewriting ──────────────────────────────────────────────────────────────

export function rewritePrompt({ articleTitle, deadLabel, candidate, segments }) {
  const label = productLabel(candidate.title);
  const link = amazonLink(candidate.asin);
  return {
    system: [
      "You are editing a published camping buying guide because a product it recommends was discontinued.",
      `Replace every mention of the OLD product with the NEW one, in each segment you are given.`,
      "",
      "Rules:",
      "- Sentences about other products stay exactly as they are, word for word.",
      "- Keep the markdown shape. A heading stays a heading at the same level, naming the new product.",
      `- A call to action keeps its form: **[Check the ${label} on Amazon](${link})**`,
      `- Wherever the old product was linked, link the new one with exactly ${link}`,
      "- `newProduct.listing` is the NEW product's own Amazon listing: title, feature bullets, item weight. It is the ONLY evidence about the new product.",
      "- Every product-specific claim about the new product — materials, finishes, included parts (lid, pot, stand), ignition, how it packs or nests, capacity, weight, boil time, fuel, compatibility, and what it must NOT be used for — must be stated in `newProduct.listing`. If the listing does not say it, do not say it.",
      "- The segments describe the OLD product. Its specifics do NOT transfer: remove each one, or generalise it to what the listing supports. Example: the old text says \"hard-anodized pot, lid\" and the listing says only \"pot\" — write \"pot\".",
      "- Prefer the listing's own facts over the old text's. No boil times, weights or figures the listing does not state.",
      "- No prices and no dollar figures. No backticks.",
      "- Never name the old product, by any of its names.",
      "",
      "Structure — checked mechanically; a draft that breaks any of these is refused:",
      "- Each segment comes back as the same number of paragraphs it was sent as: one block, no blank lines inside it, no leading or trailing newline.",
      `- Each paragraph's length must fall inside its \`allowedChars\` range (${Math.round((1 - LENGTH_TOLERANCE) * 100)}-${Math.round((1 + LENGTH_TOLERANCE) * 100)}% of the original). Aim for about the original length.`,
      "- Never add a call to action or a \"Check … on Amazon\" line to a segment that did not already have one. The pipeline places calls to action.",
      "- Only claims `newProduct.listing` supports. When unsure, leave the claim out.",
      "",
      'Return {"segments":{"<id>":"<rewritten text>", …}} with every id you were given and no others.',
      'If the new product would NOT do the same job in this article, return {"notSameKind":true,"reason":"one sentence"} instead.',
    ].join("\n"),
    user: JSON.stringify({
      article: articleTitle,
      oldProduct: deadLabel,
      // No price on purpose: a price in the prompt is a price in the prose, and
      // prose prices freeze while the product's real one moves.
      newProduct: { title: candidate.title, label, rating: candidate.rating, reviews: candidate.ratingsTotal, link, listing: listingFacts(candidate) },
      segments: segments.map(({ id, kind, text, before, after }) => ({
        id, kind, text,
        ...(/^#{1,6} /.test(String(text).trimStart()) ? {} : { allowedChars: lengthRange(String(text)) }),
        contextBefore: before, contextAfter: after,
      })),
    }, null, 1),
  };
}

/* Rule reminders keyed on the refusal text, so the retry names the rule that
 * was broken next to the quote that broke it. */
const RETRY_HINTS = [
  [/paragraph break|spilled into paragraph/, "Each segment is exactly ONE block of text. Never put a blank line inside a segment, and never start or end one with a newline."],
  [/not in the listing/, "A claim marked \"not in the listing\" must be deleted, or replaced by what `newProduct.listing` actually states. Do not reword it into a synonym of the same unsupported claim."],
  [/length \d+%/, "Keep each paragraph inside its `allowedChars` range. Cut or add words; do not add or split paragraphs to get there."],
  [/added a call to action/, "Remove the call to action you added. The pipeline places calls to action; a segment that had none must have none."],
  [/still names the dead product/, "Never name the old product, by any of its names."],
  [/exact price|backtick/, "No prices, no dollar figures, no backticks."],
  [/bold|call to action/, "The call to action keeps its exact form, both ** markers included."],
  [/heading/, "A heading stays one line at the same level and names the new product."],
  [/links |lacks tag|dropped the product link/, "Link only the new product, with exactly the link you were given."],
  [/^review:/, "A reviewer quoted a sentence and said why it is wrong. Rewrite that sentence so the problem is gone; if the listing cannot support it, remove the claim."],
];

/**
 * The ONE retry a refused draft gets (ADR-0001, 2026-09-22): the first
 * prompt, plus the refused draft and the exact reasons it was refused. The
 * listing facts are already in the base prompt's `newProduct.listing`.
 * reasons are strings; review findings arrive prefixed "review: ".
 */
export function retryPrompt(base, { draft, reasons }) {
  const hints = RETRY_HINTS.filter(([re]) => reasons.some((r) => re.test(r))).map(([, h]) => `- ${h}`);
  return {
    system: [
      base.system,
      "",
      "SECOND AND LAST ATTEMPT. Your previous draft (`previousDraft`) was refused. `refusedBecause` lists every reason, quoting the offending text.",
      "Fix exactly those problems. Keep the rest of your previous draft unless a rule above forbids it.",
      "`newProduct.listing` is still the only evidence about the new product.",
      ...(hints.length ? ["", "The rules that were broken:", ...hints] : []),
      "",
      "Return the same JSON shape: every segment id, rewritten.",
    ].join("\n"),
    user: JSON.stringify({ ...JSON.parse(base.user), previousDraft: draft, refusedBecause: reasons }, null, 1),
  };
}

/**
 * Strip insignificant whitespace from the ends of every drafted segment.
 *
 * Dry run 9: both dispersed drafts ended content#21 with a trailing "\n". A
 * segment is joined to its neighbour with "\n\n", so that one newline became
 * "\n\n\n" and the NEXT paragraph came back as "\n<text>" — the count held,
 * the byte-for-byte check fired on paragraph 22, and the guide was unlinked for
 * whitespace the writer could not see it had sent.
 *
 * Only the ENDS are touched. A blank line INSIDE a segment is a real added
 * paragraph and still reaches spliceBlocks untouched, so this cannot mask one.
 * Idempotent, and non-strings pass through so "missing" is still reported.
 */
export function normalizeDraft(replacements) {
  if (!replacements || typeof replacements !== "object") return replacements;
  return Object.fromEntries(Object.entries(replacements).map(([id, t]) => [id, typeof t === "string" ? t.trim() : t]));
}

/**
 * The mechanical half of the gate. Free, deterministic, and it runs before any
 * reviewer is asked — a rewrite that fails here never costs three panel calls.
 */
export function checkRewrite(segments, replacements, { aliases, dead, replacement, label, blocks = null, candidate = null }) {
  /* ALL failures, in one pass (dry run 8). This used to stop at the first
   * class of failure: the dispersed guide's draft was refused for its length,
   * the retry fixed that and broke the paragraph count, and the grounding
   * refusal ("Compatible with standard backpacking fuel canisters…") never
   * reached the retry at all — the one retry was spent on half the problems.
   * Every reason quotes the text it objects to, because the retry prompt
   * hands these strings straight back to the writer. */
  replacements = normalizeDraft(replacements);
  const problems = [];
  const q = (t, n = 160) => { const x = String(t).replace(/\s+/g, " ").trim(); return `"${x.length > n ? `${x.slice(0, n)}…` : x}"`; };
  const sent = new Set(segments.map((s) => s.id));
  const got = Object.keys(replacements ?? {});
  for (const id of got) if (!sent.has(id)) problems.push(`${id}: returned but never sent`);
  const re = aliasRe(aliases);
  const ctaRe = /\*{0,2}\[Check [^\]]*on Amazon\]\([^)]*\)\*{0,2}/i;
  for (const s of segments) {
    const t = replacements?.[s.id];
    if (typeof t !== "string" || !t.trim()) { problems.push(`${s.id}: missing`); continue; }
    const named = t.match(re)?.[0] ?? (t.includes(dead) ? dead : null);
    if (named) problems.push(`${s.id}: still names the dead product — ${q(named)}`);
    if (CENTS.test(t)) problems.push(`${s.id}: exact price ${t.match(CENTS)[0]}`);
    if (t.includes("`")) problems.push(`${s.id}: backtick — ${q(t.slice(Math.max(0, t.indexOf("`") - 40), t.indexOf("`") + 40))}`);
    /* Headings are exempt from the ratio and held to a different bound: a
     * heading IS the product name, so "### Fixed Star 1 System" legitimately
     * grows by the length of the new name. Found by the first real dry run,
     * which unlinked a correct swap for exactly that. A heading must still be
     * one line and no longer than the new name plus a few words. */
    if (/^#{1,6} /.test(s.text.trimStart())) {
      if (t.trim().includes("\n")) problems.push(`${s.id}: heading became several lines — ${q(t)}`);
      if (t.trim().length > Math.max(s.text.trim().length * (1 + LENGTH_TOLERANCE), (label ?? "").length + 30)) problems.push(`${s.id}: heading ${t.trim().length} chars — ${q(t)}`);
    } else {
      const ratio = t.length / Math.max(1, s.text.length);
      if (ratio < 1 - LENGTH_TOLERANCE || ratio > 1 + LENGTH_TOLERANCE) {
        const [lo, hi] = lengthRange(s.text);
        problems.push(`${s.id}: length ${Math.round(ratio * 100)}% of original (${t.length} chars; allowed ${lo}-${hi}) — ${q(t, 240)}`);
      }
    }
    for (const [, asin, rest] of t.matchAll(/amazon\.com\/dp\/([A-Z0-9]{10})([^)\s]*)/g)) {
      if (asin !== replacement && !s.text.includes(`/dp/${asin}`)) problems.push(`${s.id}: links ${asin}, which it did not link before`);
      if (!rest.includes(`tag=${TAG}`)) problems.push(`${s.id}: link to ${asin} lacks tag=${TAG}`);
    }
    if (s.text.includes(`/dp/${dead}`) && !t.includes(`/dp/${replacement}`)) problems.push(`${s.id}: dropped the product link`);
    /* Dry run 5: the cookware CTA came back as "**[Check the … on Amazon](…)"
     * with its closing ** gone — unbalanced bold that would render literally
     * on a live page. A call to action must keep both markers. */
    if (((t.match(/\*\*/g) ?? []).length) % 2) problems.push(`${s.id}: unbalanced ** bold markers`);
    if (/\*\*\[Check /.test(s.text) && !t.includes(`](${amazonLink(replacement)})**`)) problems.push(`${s.id}: call to action lost its **[…](link)** form`);
    /* Dry run 8: both dispersed drafts appended a "**[Check the Odoland … on
     * Amazon](…)**" paragraph to a segment that never had one. The pipeline
     * owns CTAs; a writer adding one is refused by name, not only by the
     * paragraph count it usually also breaks. */
    if (!ctaRe.test(s.text) && ctaRe.test(t)) problems.push(`${s.id}: added a call to action the original did not have — ${q(t.match(ctaRe)[0])}`);
    const h0 = s.text.trimStart().match(/^#{1,6} /)?.[0];
    if (h0 && !t.trimStart().startsWith(h0)) problems.push(`${s.id}: heading level changed`);
    if (!h0 && /^#{1,6} /.test(t.trimStart())) problems.push(`${s.id}: paragraph became a heading — ${q(t)}`);
  }
  /* The splice and grounding checks need every segment back as a string —
   * NOT a clean pass on everything above, which is what hid dry run 8's
   * grounding refusal behind a length refusal. */
  const complete = segments.every((s) => typeof replacements?.[s.id] === "string" && replacements[s.id].trim());
  /* The splice check applySwap makes, run here so a rewrite that would be
   * refused after review is refused before it (2026-09-22 dry run: all three
   * panel calls spent on the dispersed guide, then unlinked for this). */
  if (blocks && complete) problems.push(...spliceBlocks(blocks, segments, replacements).problems);
  /* Grounding (dry run 4). Only with listing facts — remediate() never
   * reaches here without them. */
  if (candidate?.facts && complete) {
    for (const u of ungroundedClaims(segments, replacements, candidate)) problems.push(`${u.segment}: "${u.claim}" not in the listing — "${u.sentence}"`);
  }
  return { ok: !problems.length, problems };
}

// ── reviewing the edit ─────────────────────────────────────────────────────

/* Loose text identity for locating a reviewer's quote: markdown links collapse
 * to their words, edit markers vanish, case and punctuation are ignored. */
const norm = (t) => String(t ?? "")
  .replace(/\[\[\/?EDIT \d+\]\]/g, " ")
  .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/[*_#>]/g, " ")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const FIELD_LABEL = { title: "Title", excerpt: "Excerpt", heroAlt: "Hero image alt text" };

/**
 * The whole post-edit article, with each rewritten span marked.
 *
 * WHY THE WHOLE ARTICLE. The first two dry runs sent only the edited
 * paragraphs plus a neighbour each way and called that "the article". The
 * reviewers then judged the fragment AS the article: "The article does not
 * compare six stoves", "Stanley is never described", "everything you need
 * omits water and first aid" — all HIGH, all about text outside the edit, and
 * all false of the real guide. Whether a correct swap shipped depended on which
 * seats happened to answer. Sending the full guide removes the false premise;
 * the markers and the before/after list tell the reviewer what is under review.
 *
 * Size: the three B07F2VP353 guides are 6.5k-9.5k chars — about 3-4k input
 * tokens per seat with the edits list. The smallest seat window is Muse
 * Glimmer's 131k tokens, so nothing is truncated — a truncated review would
 * reintroduce the very defect being fixed.
 */
export function markedArticle(hit, replacements) {
  const edits = [];
  const mark = (s) => { edits.push({ edit: edits.length + 1, id: s.id, where: s.kind, before: s.text, after: replacements[s.id] }); return edits.length; };
  const lines = [];
  const fieldSegs = hit.segments.filter((s) => s.index == null);
  const byField = Object.fromEntries(fieldSegs.map((s) => [s.id, s]));
  for (const f of ["title", "excerpt", "heroAlt"]) {
    if (!byField[f]) { if (f === "title") lines.push(`# ${hit.title}`); continue; }
    const n = mark(byField[f]);
    lines.push(`${FIELD_LABEL[f]}: [[EDIT ${n}]]${replacements[f]}[[/EDIT ${n}]]`);
  }
  const bySeg = new Map(hit.segments.filter((s) => s.index != null).map((s) => [s.index, s]));
  const blocks = hit.blocks.map((b, i) => {
    const s = bySeg.get(i);
    if (!s) return b;
    const n = mark(s);
    return `[[EDIT ${n}]]\n${replacements[s.id]}\n[[/EDIT ${n}]]`;
  });
  return { text: [...lines, "", ...blocks].join("\n\n"), edits };
}

export function editReviewPrompt({ articleTitle, hit, replacements, candidate }) {
  const { text, edits } = markedArticle(hit, replacements);
  return {
    // The edits list roughly doubles the output a careful reviewer writes.
    // reviewContent raises this to REVIEW_MAX_TOKENS (16000) — 12000 still let
    // DeepSeek reason itself out of an answer in dry runs 5, 8 and 10.
    maxTokens: 12000,
    system: [
      "You are checking an EDIT to a camping buying guide that is already published.",
      "A product the guide recommended was discontinued and has been replaced by a different product.",
      "You are given the COMPLETE article after the edit. Text between [[EDIT n]] and [[/EDIT n]] was just rewritten;",
      "`edits` lists each one with its text before and after. Everything outside the markers was published earlier and is NOT under review.",
      "",
      "Report only OUTRIGHT ERRORS that the edit is responsible for:",
      "  (a) an error inside an edited span that the edit introduced — e.g. a claim about the NEW product that its listing does not support,",
      "      or a sentence carried over unchanged that described the OLD product and is now false of the NEW one;",
      "  (b) text OUTSIDE the edited spans that the edit makes false or contradictory — true before the edit, not true after.",
      'For every issue whose quote is text the edit did not change, set "edit" to the number of the edit that makes it wrong.',
      "",
      "GROUNDING. `newProduct.listing` is the new product's own Amazon listing (title, feature bullets, item weight) — the only evidence about it.",
      "Check EVERY product-specific claim about the new product inside an edited span: materials and finishes (e.g. hard-anodized vs anodized),",
      "included parts (lid, pot, stand), ignition (piezo / igniter), how it packs or nests, capacity, weight, boil time, fuel, compatibility,",
      "and use restrictions (e.g. \"cannot be used over a campfire\"). Any such claim the listing does not state is an issue with severity \"high\" —",
      "it is a false or unsupported statement about a product we link. Quote the ONE full sentence that contains it, exactly as written.",
      "A claim the listing does support is not an issue.",
      "",
      "Do NOT report anything that was equally true or equally wrong before the edit: counts, omissions, gear lists, other",
      "products, structure, or claims the edit did not change. The rest of the article is the context for judging the edit, not a subject of review.",
      "",
      'Return {"issues":[{"quote":"the exact text","problem":"one sentence","severity":"high"|"low","edit":<number>}]}.',
      "Return an empty array if the edit is sound. That is a normal, common answer.",
      "",
      "high = would mislead a camper into a dangerous or expensive mistake, or is plainly false.",
      "       Carbon monoxide, hypothermia, water-borne illness and wildlife advice are the ones that matter.",
      "low  = minor inaccuracy, redundancy, or a claim that contradicts another claim in the article.",
      "",
      "Do NOT report: wording you would phrase differently, advice you would have added,",
      "obvious statements, or anything about formatting, length, SEO or tone. Those are not errors.",
    ].join("\n"),
    user: JSON.stringify({
      title: articleTitle,
      // No price, for the same reason the writer gets none.
      newProduct: { title: candidate.title, label: productLabel(candidate.title), rating: candidate.rating, reviews: candidate.ratingsTotal, listing: listingFacts(candidate) },
      edits: edits.map(({ edit, where, before, after }) => ({ edit, where, before, after })),
      article: text,
    }, null, 1),
    edits,
  };
}

/**
 * Which findings may vote. A quote located in text the edit did NOT change —
 * a block outside every span, or a sentence carried verbatim through a span —
 * counts only when the reviewer names the edit that makes it wrong. Anything
 * inside new text counts. A quote that cannot be located (paraphrased, or
 * straddling a span boundary) COUNTS: failing closed is the rule for swaps.
 */
export function editScope(hit, replacements, editCount) {
  const edited = new Set(hit.segments.map((s) => s.index).filter((i) => i != null));
  const fieldIds = new Set(hit.segments.filter((s) => s.index == null).map((s) => s.id));
  const unchanged = [
    ...hit.blocks.filter((_, i) => !edited.has(i)),
    ...(fieldIds.has("title") ? [] : [hit.title]),
  ].map(norm).join(" | ");
  const segs = hit.segments.map((s) => ({ before: norm(s.text), after: norm(replacements[s.id]) }));
  const validEdit = (e) => Number.isInteger(Number(e)) && Number(e) >= 1 && Number(e) <= editCount;
  return (issue) => {
    const q = norm(issue.quote);
    if (!q) return true;
    const inNew = segs.some((s) => s.after.includes(q) && !s.before.includes(q));
    if (inNew) return true;
    const carried = segs.some((s) => s.after.includes(q) && s.before.includes(q));
    if (carried || unchanged.includes(q)) return validEdit(issue.edit);
    return true;
  };
}

/* Per-seat record for the report, the ledger and the Telegram note. */
const seatSummary = (seats) => (seats ?? []).map((s) => ({
  seat: s.seat, verdict: s.verdict, severity: s.severity,
  findings: s.findings.slice(0, 2),
  ...(s.outOfScope ? { outOfScope: s.outOfScope } : {}),
  ...(s.error ? { error: s.error } : {}),
}));

/**
 * The review half. Fails CLOSED for swaps: hazards block, blocking findings
 * block, and a null review (fewer than two panel passes answered) DEFERS —
 * the opposite of the new-article policy, and deliberately so. Here the
 * fallback is a safe unlink, so nothing pushes us to wave an unreviewed
 * product claim onto an article that is already indexed.
 *
 * The mechanical hazard check still reads the edited segments with their
 * neighbours, exactly as before; only what the MODELS see changed.
 */
/** The hazard rules over the edited segments with their neighbours. */
export function hazardSpec({ articleTitle, segments, replacements, candidate }) {
  const body = segments
    .map((s) => [s.before, replacements?.[s.id], s.after].filter((x) => typeof x === "string" && x).join("\n\n"))
    .join("\n\n");
  return { title: articleTitle, body, products: [{ label: productLabel(candidate.title) }] };
}

export async function gateSwap({ articleTitle, segments, replacements, candidate, hit }, { hazardFlags, reviewContent }) {
  const spec = hazardSpec({ articleTitle, segments, replacements, candidate });
  const hazards = hazardFlags(spec);
  if (hazards.length) return { verdict: "reject", why: "hazard", findings: hazards.map((h) => `${h.id}: ${h.text}`), seats: [] };
  const h = hit ?? { title: articleTitle, blocks: [], segments };
  const prompt = editReviewPrompt({ articleTitle, hit: h, replacements, candidate });
  let seats = [];
  const review = await reviewContent(spec, {
    prompt: { system: prompt.system, user: prompt.user, maxTokens: prompt.maxTokens },
    inScope: editScope(h, replacements, prompt.edits.length),
    onSeats: (s) => { seats = s; },
  });
  seats = seatSummary(review?.seats ?? seats);
  if (!review) return { verdict: "defer", why: "review-null", findings: [], seats };
  if (review.blocking.length) return { verdict: "reject", why: "review", findings: review.blocking.map((i) => `${i.quote}: ${i.problem}`), blocking: review.blocking, seats };
  return { verdict: "pass", why: null, findings: [], reviewers: review.reviewers, independent: review.independent, seats };
}

// ── applying ───────────────────────────────────────────────────────────────

export function spliceArticle(src, slug, { content, title, excerpt, updated }) {
  const a = readArticle(src, slug);
  let head = a.head;
  if (title != null) head = head.replace(/(\n\s*title: ")(?:[^"\\]|\\.)*(")/, (_, p, q) => `${p}${esc(title)}${q}`);
  if (excerpt != null) head = head.replace(/(\n\s*excerpt: ")(?:[^"\\]|\\.)*(")/, (_, p, q) => `${p}${esc(excerpt)}${q}`);
  if (updated) {
    // `updated` marks an editorial rewrite. A swap is one; an unlink is not
    // (Sean, 2026-09-22), which matches the rule on the field in articles.ts.
    head = /\n\s*updated: "/.test(head)
      ? head.replace(/(\n\s*updated: ")[^"]*(")/, `$1${updated}$2`)
      // The comma after `date:` is optional in the match; the separator is
      // always written, and the original trailing comma (if any) moves to
      // the new line so the literal keeps its shape.
      : head.replace(/(\n(\s*)date: "[^"]*")(,?)/, (_, d, ind, comma) => `${d},\n${ind}updated: "${updated}"${comma}`);
  }
  return src.slice(0, a.start) + head + (content ?? a.content) + src.slice(a.c1);
}

function editGridLine(sections, slug, dead, fn) {
  const span = sectionsSpan(sections, slug);
  if (!span) return sections;
  const block = sections.slice(span.start, span.end);
  const next = block
    .split("\n")
    .flatMap((line) => (line.includes(`asin: "${dead}"`) ? fn(line) : [line]))
    .join("\n");
  return sections.slice(0, span.start) + next + sections.slice(span.end);
}

/**
 * Remove the dead product's links and keep its words.
 *
 * The "Check the X on Amazon" call to action is deleted outright — a CTA with
 * no link is an instruction the reader cannot follow — and every other link
 * collapses to its anchor text. The ### section stays (Sean, 2026-09-22):
 * deleting it reads cleaner but removes content he may want to keep, and an
 * Exception Handler proposal can offer that later.
 */
export function unlinkText(text, dead) {
  const url = `https?://www\\.amazon\\.com/dp/${dead}[^)\\s]*`;
  return text
    .replace(new RegExp(`[ \\t]*\\*\\*\\[Check (?:the )?[^\\]]*\\]\\(${url}\\)\\*\\*`, "g"), "")
    .replace(new RegExp(`\\[([^\\]]*)\\]\\(${url}\\)`, "g"), "$1");
}

/** Unlink inside article content, dropping only blocks the unlink emptied. */
function unlinkContent(content, dead) {
  return content
    .split("\n\n")
    .map((b) => { const n = unlinkText(b, dead); return n === b ? b : (n.trim() ? n : null); })
    .filter((b) => b !== null)
    .join("\n\n");
}

function unlinkSpec(text, dead) {
  const spec = JSON.parse(text);
  spec.products = (spec.products ?? []).filter((p) => p.asin !== dead);
  if (typeof spec.body === "string") spec.body = unlinkContent(spec.body, dead);
  return JSON.stringify(spec, null, 2) + "\n";
}

export function applyUnlink(sources, hit, dead) {
  const next = { ...sources, specs: { ...sources.specs } };
  if (hit.published) {
    const a = readArticle(next.articles, hit.slug);
    next.articles = spliceArticle(next.articles, hit.slug, { content: unlinkContent(a.content, dead) });
    next.sections = editGridLine(next.sections, hit.slug, dead, () => []);
  }
  if (next.specs[hit.slug]) next.specs[hit.slug] = unlinkSpec(next.specs[hit.slug], dead);
  return next;
}

/**
 * Splice rewritten segments back into the article's blocks and prove the
 * byte-for-byte guarantee rather than assume it: the paragraph count must not
 * move, and every block that was not sent must come back identical.
 */
export function spliceBlocks(original, segments, replacements) {
  replacements = normalizeDraft(replacements);
  const blocks = [...original];
  for (const s of segments) if (s.index != null) blocks[s.index] = replacements?.[s.id];
  const content = blocks.join("\n\n");
  const problems = [];
  const after = content.split("\n\n");
  if (after.length !== original.length) {
    /* Name the culprit: the retry prompt quotes this reason back to the
     * writer, and "a paragraph break" with no segment is not actionable. */
    const culprits = segments
      .filter((s) => s.index != null && typeof replacements?.[s.id] === "string" && /\n\s*\n|^\n|\n$/.test(replacements[s.id]))
      .map((s) => {
        const extra = replacements[s.id].trim().split(/\n\s*\n/).slice(1).join(" / ").replace(/\s+/g, " ");
        return `${s.id} contains a blank line or a leading/trailing newline${extra ? `; extra paragraph "${extra.length > 160 ? `${extra.slice(0, 160)}…` : extra}"` : ""}`;
      });
    problems.push(`a rewrite added or removed a paragraph break${culprits.length ? ` (${culprits.join("; ")})` : ""}`);
  }
  else {
    /* A shift that kept the count: some segment's splice spilled into the
     * blocks after it. Report the FIRST changed block once, blamed on the
     * nearest segment before it and quoting what it became — "paragraph 22
     * changed" named nothing the retry could act on (dry run 9). */
    const changed = [];
    for (let i = 0; i < after.length; i++) if (!segments.some((s) => s.index === i) && after[i] !== original[i]) changed.push(i);
    if (changed.length) {
      const i = changed[0];
      const culprit = segments.filter((s) => s.index != null && s.index < i).sort((a, b) => b.index - a.index)[0];
      const q = (t) => { const x = JSON.stringify(String(t)); return x.length > 162 ? `${x.slice(0, 160)}…"` : x; };
      problems.push(`${culprit ? `${culprit.id}: its rewrite spilled into` : "a rewrite changed"} paragraph ${i}, outside the segments — it became ${q(after[i])} (was ${q(original[i])})${culprit ? `; ${culprit.id} ended ${q(String(replacements?.[culprit.id] ?? "").slice(-60))}` : ""}${changed.length > 1 ? `; ${changed.length - 1} more paragraph(s) after it also changed` : ""}`);
    }
  }
  return { content, problems };
}

/**
 * Apply one article's accepted rewrite. Returns { sources, problems } — any
 * residual mention of the dead product after the splice is a problem, and the
 * caller unlinks instead of shipping a half-swapped guide.
 */
export function applySwap(sources, hit, replacements, { dead, candidate, aliases, today }) {
  const next = { ...sources, specs: { ...sources.specs } };
  const label = productLabel(candidate.title);
  const newLink = amazonLink(candidate.asin);
  const problems = [];

  const { content, problems: spliceProblems } = spliceBlocks(hit.blocks, hit.segments, replacements);
  // Also checked in checkRewrite before review; kept here as the last word
  // before anything is written.
  problems.push(...spliceProblems);

  next.articles = spliceArticle(next.articles, hit.slug, {
    content,
    title: replacements.title,
    excerpt: replacements.excerpt,
    updated: today,
  });
  if (replacements.heroAlt) {
    const alt = JSON.parse(next.heroAlt);
    alt[hit.slug] = replacements.heroAlt;
    next.heroAlt = JSON.stringify(alt, null, 2) + "\n";
  }
  next.sections = editGridLine(next.sections, hit.slug, dead, (line) => [
    line
      .replace(/label: "(?:[^"\\]|\\.)*"/, `label: "${esc(label)}"`)
      .replace(`asin: "${dead}"`, `asin: "${candidate.asin}"`)
      .replace(new RegExp(`https://www\\.amazon\\.com/dp/${dead}\\?tag=${TAG}`), newLink),
  ]);

  if (next.specs[hit.slug]) {
    // Without this a spec re-render would bring the dead product straight back.
    const spec = JSON.parse(next.specs[hit.slug]);
    spec.products = (spec.products ?? []).map((p) => (p.asin === dead ? { ...p, asin: candidate.asin, label } : p));
    if (typeof spec.body === "string") {
      for (const s of hit.segments) if (s.index != null) spec.body = spec.body.split(s.text).join(replacements[s.id]);
      // A spec body that drifted from the published copy (a paragraph edited in
      // one and not the other) will not match verbatim. The link must still go.
      spec.body = spec.body.replace(new RegExp(`https://www\\.amazon\\.com/dp/${dead}\\?tag=${TAG}`, "g"), newLink);
      if (aliasRe(aliases).test(spec.body)) problems.push(`specs/${hit.slug}.json body still names the dead product (drifted from articles.ts)`);
    }
    next.specs[hit.slug] = JSON.stringify(spec, null, 2) + "\n";
  }

  const a = readArticle(next.articles, hit.slug);
  if (a.content.includes(dead) || aliasRe(aliases).test(a.content)) problems.push("article still names or links the dead product");
  return { sources: next, problems };
}

// ── the ledger ─────────────────────────────────────────────────────────────

export function newEntry({ now, anchor, aliases, label }) {
  return {
    detectedAt: now.toISOString(),
    label,
    anchorPrice: anchor?.price ?? null,
    anchorSource: anchor?.source ?? null,
    aliases,
    attempts: 0,
    triedCandidates: [],
    candidate: null,
    perArticle: {},
    status: "pending",
    deadline: new Date(now.getTime() + DEADLINE_HOURS * HOUR).toISOString(),
  };
}

const DONE = new Set(["swapped", "unlinked", "dropped-from-spec"]);

export function statusOf(entry) {
  const outs = Object.values(entry.perArticle).map((p) => p.outcome);
  if (!outs.length || outs.some((o) => !DONE.has(o))) return "pending";
  const swapped = outs.includes("swapped");
  const unlinked = outs.includes("unlinked");
  return swapped && unlinked ? "mixed" : swapped ? "swapped" : "unlinked";
}

/** Was this ASIN put INTO a guide by this pipeline within CHURN_DAYS? */
export function isRecentReplacement(ledger, asin, now) {
  for (const e of Object.values(ledger)) {
    for (const p of Object.values(e.perArticle ?? {})) {
      if (p.outcome === "swapped" && p.replacement === asin && p.at && now - Date.parse(p.at) < CHURN_DAYS * DAY) return true;
    }
  }
  return false;
}

/** The oldest unresolved dead ASIN: ledger detection time first, then cache check time. */
export function oldestDead(deadAsins, ledger, cache) {
  const when = (a) => Date.parse(ledger[a]?.detectedAt ?? cache.entries?.[a]?.checkedAt ?? 0) || 0;
  return [...deadAsins].sort((x, y) => when(x) - when(y))[0] ?? null;
}

// ── the state machine ──────────────────────────────────────────────────────

/**
 * Advance one dead ASIN by one cycle.
 *
 * deps: {
 *   anchorPrice(asin) -> {price, source} | null
 *   discover(term, {min, max, force, nowIso}) -> results   (may throw code:"QUOTA")
 *   searchAgeDays(term, min, max) -> number (Infinity when never searched)
 *   verifyAsin(asin) -> {verdict, title?}
 *   listingFacts(asin, {nowIso}) -> {title, brand, bullets[], itemWeight} | null   (may throw code:"QUOTA")
 *   write({system, user}) -> {value} | null                (callRole("writer"))
 *   hazardFlags(spec), reviewContent(spec)
 *   deadInCache(asin) -> bool
 * }
 *
 * Returns { sources, entry, cacheRecords, report }. Never throws for an
 * expected failure; every one of them ends in pending, swapped or unlinked.
 */
export async function remediate({ asin, sources, ledger, now, deps, forceUnlink = null }) {
  const report = { asin, locations: [], candidate: null, rejected: [], articles: {}, events: [], calls: { search: 0, listing: 0, writer: 0, review: 0, retry: 0 } };
  const cacheRecords = [];
  const label = gridLabel(sources, asin) ?? ledger[asin]?.label ?? productLabel(deps.cachedTitle?.(asin) ?? asin);
  const aliases = ledger[asin]?.aliases ?? aliasesFor(label);
  const entry = ledger[asin]
    ? structuredClone(ledger[asin])
    : newEntry({ asin, now, anchor: deps.anchorPrice(asin), aliases, label });

  const hits = locate(sources, asin, aliases);
  report.locations = hits.map((h) => ({
    slug: h.slug, published: h.published,
    segments: h.segments.map((s) => `${s.id} (${s.kind})`),
    grid: h.inGrid, spec: h.inSpec,
  }));
  let next = sources;

  const unlink = (hit, why) => {
    next = applyUnlink(next, hit, asin);
    entry.perArticle[hit.slug] = { outcome: hit.published ? "unlinked" : "dropped-from-spec", why, at: now.toISOString() };
    report.articles[hit.slug] = { outcome: entry.perArticle[hit.slug].outcome, why };
  };
  const finish = () => {
    entry.status = statusOf(entry);
    return { sources: next, entry, cacheRecords, report };
  };

  // Unpublished specs are dropped, not swapped.
  for (const h of hits.filter((x) => !x.published)) unlink(h, "unpublished spec — its own publish review covers the text");

  // Articles that were already resolved but reference the ASIN again (a
  // re-render, a hand edit) re-enter the queue rather than being skipped.
  const open = hits.filter((h) => h.published);
  for (const h of open) if (DONE.has(entry.perArticle[h.slug]?.outcome)) delete entry.perArticle[h.slug];
  if (!open.length) return finish();

  // ── model-free exits ──
  const unlinkAll = (why) => { for (const h of open) unlink(h, why); report.events.push({ type: "unlinked", why }); return finish(); };
  if (forceUnlink) return unlinkAll(forceUnlink);
  if (now.getTime() > Date.parse(entry.deadline)) return unlinkAll(`${DEADLINE_HOURS}h deadline passed with the swap still pending`);
  if (isRecentReplacement(ledger, asin, now)) return unlinkAll(`it was itself swapped in within ${CHURN_DAYS} days — not swapping again`);
  if (entry.attempts >= MAX_ATTEMPTS) return unlinkAll(`${MAX_ATTEMPTS} candidates tried and rejected`);

  // ── candidate ──
  let candidate = entry.candidate;
  if (!candidate) {
    if (entry.anchorPrice == null) return unlinkAll("no known price to search around");
    const term = searchTerm(deps.cachedTitle?.(asin) || label);
    // The form factor comes from the FULL dead title: the search term has
    // already dropped words like "integrated" that name it.
    const type = productType(term, deps.cachedTitle?.(asin) || label);
    const band = priceBand(entry.anchorPrice, open.map((h) => deps.priceCeiling(h.title)));
    let results;
    try {
      // Infinity (never searched) is also > the limit, so this one flag covers
      // both "missing" and "stale"; either way it is exactly one request.
      const force = deps.searchAgeDays(term, band.min, band.max) > SEARCH_MAX_AGE_DAYS;
      if (force) report.calls.search++;
      results = await deps.discover(term, { ...band, force, nowIso: now.toISOString() });
    } catch (err) {
      if (err?.code !== "QUOTA") throw err;
      for (const h of open) entry.perArticle[h.slug] = { outcome: "pending", why: "Canopy quota exhausted" };
      report.events.push({ type: "deferred", why: "Canopy quota exhausted" });
      return finish();
    }
    // Never swap in something already linked from a guide being fixed.
    const linked = new Set(open.flatMap((h) => [...readArticle(next.articles, h.slug).content.matchAll(/\/dp\/([A-Z0-9]{10})/g)].map((m) => m[1])));
    const { candidate: pick, rejected } = pickCandidate(results, {
      type, band,
      exclude: new Set([...entry.triedCandidates, ...linked]),
      deadInCache: deps.deadInCache,
    });
    report.search = { term, type: { head: type.head, qualifiers: type.qualifiers, form: type.form?.id ?? null }, band, results: results?.length ?? 0 };
    report.rejected = rejected;
    if (!pick) return unlinkAll(`no replacement passed the filters (term "${term}", $${band.min}-$${band.max})`);

    // Fail closed on the link BEFORE any rewrite: publish-article refuses
    // anything not cached LIVE, so an unverified swap would wedge the next build.
    const v = await deps.verifyAsin(pick.asin);
    if (v.verdict === "UNKNOWN") {
      for (const h of open) entry.perArticle[h.slug] = { outcome: "pending", why: `Amazon throttled the check on ${pick.asin}` };
      report.events.push({ type: "deferred", why: "link check throttled" });
      return finish();
    }
    cacheRecords.push({ asin: pick.asin, result: v });
    if (v.verdict !== "LIVE") {
      entry.triedCandidates.push(pick.asin);
      entry.attempts++;
      for (const h of open) entry.perArticle[h.slug] = { outcome: "pending", why: `candidate ${pick.asin} is not LIVE` };
      report.events.push({ type: "candidate-rejected", why: `${pick.asin} not LIVE` });
      return finish();
    }
    candidate = { asin: pick.asin, title: v.title || pick.title, rating: pick.rating, ratingsTotal: pick.ratingsTotal, priceValue: pick.priceValue };
    entry.candidate = candidate;
  }

  /* ── listing facts: never swap blind ──
   * The rewrite and the review are both judged against what the candidate's
   * own listing says. No facts, no swap: a failed lookup DEFERS (the 72h
   * deadline still ends it in an unlink), and a listing with no feature
   * bullets rejects the candidate — there is nothing to ground a claim on.
   * Persisted on the candidate so a deferred run does not pay again. */
  if (!candidate.facts) {
    let facts;
    report.calls.listing++;
    try {
      facts = await deps.listingFacts(candidate.asin, { nowIso: now.toISOString() });
    } catch (err) {
      if (err?.code !== "QUOTA") throw err;
      facts = undefined;
    }
    if (!facts) {
      const why = facts === undefined ? "Canopy quota exhausted (listing facts)" : `listing facts for ${candidate.asin} unavailable`;
      for (const h of open) entry.perArticle[h.slug] = { outcome: "pending", why };
      report.candidate = candidate;
      report.events.push({ type: "deferred", why });
      return finish();
    }
    if (!facts.bullets?.length) {
      entry.triedCandidates.push(candidate.asin);
      entry.attempts++;
      entry.candidate = null;
      for (const h of open) entry.perArticle[h.slug] = { outcome: "pending", why: `candidate ${candidate.asin} has no listing bullets to ground a rewrite on` };
      report.events.push({ type: "candidate-rejected", why: `${candidate.asin} listing has no feature bullets` });
      return finish();
    }
    // The page title verifyAsin read can name things Canopy's title omits.
    candidate = { ...candidate, facts: { ...facts, pageTitle: candidate.title !== facts.title ? candidate.title : undefined } };
    entry.candidate = candidate;
  }
  report.candidate = candidate;

  // ── rewrite every open article first; a "not the same kind" from any of
  // them rejects the candidate before a single file changes ──
  const drafts = [];
  for (const h of open) {
    const segs = h.segments;
    if (!segs.length) { drafts.push({ h, replacements: {} }); continue; }
    report.calls.writer++;
    const r = await deps.write(rewritePrompt({ articleTitle: h.title, deadLabel: label, candidate, segments: segs }));
    if (!r?.value) { drafts.push({ h, deferred: "writer unreachable" }); continue; }
    if (r.value.notSameKind) {
      entry.triedCandidates.push(candidate.asin);
      entry.attempts++;
      entry.candidate = null;
      for (const x of open) entry.perArticle[x.slug] = { outcome: "pending", why: `writer: not the same kind — ${String(r.value.reason ?? "").slice(0, 120)}` };
      report.events.push({ type: "candidate-rejected", why: `writer said ${candidate.asin} is not the same kind of product` });
      return finish();
    }
    drafts.push({ h, replacements: normalizeDraft(r.value.segments ?? r.value) });
  }

  // ── gate and apply, per article ──
  /* One verdict on one draft: the free mechanical check first, the panel only
   * if that passes. `retryable` marks the refusals a second draft can fix —
   * a mechanical problem, or blocking panel findings that each quote the text
   * they object to (editScope has already dropped the out-of-edit ones). A
   * hazard is NOT retryable: a writer that introduced dangerous advice does
   * not get a second go at the same guide. */
  const judge = async (h, replacements) => {
    const mech = checkRewrite(h.segments, replacements, { aliases, dead: asin, replacement: candidate.asin, label: productLabel(candidate.title), blocks: h.blocks, candidate });
    if (!mech.ok) {
      /* A mechanically refused draft is still read for hazards: dangerous
       * advice is never retryable, even when it arrives alongside a fixable
       * formatting problem. */
      const hz = deps.hazardFlags(hazardSpec({ articleTitle: h.title, segments: h.segments, replacements, candidate }));
      if (hz.length) return { stage: "hazard", gate: { verdict: "reject", why: "hazard", findings: hz.map((x) => `${x.id}: ${x.text}`), seats: [] }, reasons: hz.map((x) => `${x.id}: ${x.text}`), retryable: false };
      return { stage: "mechanical", reasons: mech.problems, retryable: true };
    }
    if (!h.segments.length) return { stage: "pass", gate: { verdict: "pass" }, reasons: [] };
    report.calls.review += 3;
    const gate = await gateSwap({ articleTitle: h.title, segments: h.segments, replacements, candidate, hit: h }, deps);
    if (gate.verdict === "reject" && gate.why === "review") {
      const quoted = (gate.blocking ?? []).length > 0 && gate.blocking.every((i) => String(i.quote ?? "").trim());
      return { stage: "review", gate, retryable: quoted, reasons: (gate.blocking ?? []).map((i) => `review: "${String(i.quote).slice(0, 240)}" — ${i.problem}`) };
    }
    if (gate.verdict === "reject") return { stage: gate.why, gate, reasons: gate.findings, retryable: false };
    return { stage: gate.verdict, gate, reasons: [] };
  };

  for (const d of drafts) {
    const { h } = d;
    if (d.deferred) {
      entry.perArticle[h.slug] = { outcome: "pending", why: d.deferred };
      report.articles[h.slug] = { outcome: "pending", why: d.deferred };
      continue;
    }
    let replacements = d.replacements;
    // Kept for the dry run: the reason a rewrite was refused is only
    // checkable against what the model actually returned.
    report.drafts = { ...(report.drafts ?? {}), [h.slug]: replacements };
    let v = await judge(h, replacements);

    /* ── the ONE retry (Sean, 2026-09-22: "Add retry, then ship") ──
     * Structurally at most one: this block runs once per guide per cycle and
     * its own verdict is never re-examined for retryability. Its writer and
     * panel calls are in report.calls like any other. */
    let tries = null;
    if (v.retryable) {
      tries = [{ attempt: 1, stage: v.stage, reasons: v.reasons.slice(0, 8) }];
      report.calls.writer++;
      report.calls.retry++;
      const base = rewritePrompt({ articleTitle: h.title, deadLabel: label, candidate, segments: h.segments });
      const r2 = await deps.write(retryPrompt(base, { draft: replacements, reasons: v.reasons }));
      if (!r2?.value || r2.value.notSameKind) {
        const why = !r2?.value ? "retry writer unreachable" : `retry answered not-the-same-kind — ${String(r2.value.reason ?? "").slice(0, 120)}`;
        v = { ...v, reasons: [why, ...v.reasons] };
      } else {
        replacements = normalizeDraft(r2.value.segments ?? r2.value);
        report.retryDrafts = { ...(report.retryDrafts ?? {}), [h.slug]: replacements };
        v = await judge(h, replacements);
      }
      tries.push({ attempt: 2, stage: v.stage, reasons: v.reasons.slice(0, 8) });
    }
    const firstWas = tries ? ` [after one writer retry; first draft refused (${tries[0].stage}): ${tries[0].reasons.join("; ").slice(0, 300)}]` : "";

    /* Every outcome past this point carries the panel, seat by seat — who
     * passed it, who flagged what, who never answered — so a swap or unlink
     * can be audited from the ledger and the receipt after the fact. It also
     * carries both attempts when there was a retry. */
    const review = v.gate?.seats ? { candidate: candidate.asin, seats: v.gate.seats } : null;
    const record = (slug) => {
      if (review) { entry.perArticle[slug].review = review; report.articles[slug].review = review; }
      if (tries) { entry.perArticle[slug].retry = tries; report.articles[slug].retry = tries; }
    };
    if (v.stage === "mechanical") { unlink(h, `rewrite failed the mechanical check: ${v.reasons.join("; ")}${firstWas}`); record(h.slug); continue; }
    if (v.stage === "defer") {
      // Deferrals cost no attempt, but they do run down the 72h clock.
      entry.perArticle[h.slug] = { outcome: "pending", why: "review returned fewer than 2 passes" };
      report.articles[h.slug] = { outcome: "pending", why: "review deferred" };
      record(h.slug);
      continue;
    }
    if (v.stage !== "pass") { unlink(h, `review rejected the swap (${v.gate?.why ?? v.stage}): ${(v.gate?.findings ?? v.reasons).join(" | ").slice(0, 400)}${firstWas}`); record(h.slug); continue; }

    const applied = applySwap(next, h, replacements, { dead: asin, candidate, aliases, today: deps.today(now) });
    if (applied.problems.length) { unlink(h, `swap left residue: ${applied.problems.join("; ")}${firstWas}`); record(h.slug); continue; }
    next = applied.sources;
    entry.perArticle[h.slug] = { outcome: "swapped", replacement: candidate.asin, at: now.toISOString(), reviewers: v.gate.reviewers ?? null };
    report.articles[h.slug] = { outcome: "swapped", replacement: candidate.asin, reviewers: v.gate.reviewers ?? null, independent: v.gate.independent ?? null };
    record(h.slug);
  }
  const swapped = Object.values(report.articles).filter((a) => a.outcome === "swapped").length;
  const unlinked = Object.values(report.articles).filter((a) => a.outcome === "unlinked").length;
  if (swapped) report.events.push({ type: "swapped", replacement: candidate.asin });
  if (unlinked) report.events.push({ type: "unlinked", why: "per-article gate" });
  return finish();
}
