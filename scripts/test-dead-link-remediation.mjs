#!/usr/bin/env node
/**
 * Tests for dead-link remediation (ADR-0001).
 *
 *   node scripts/test-dead-link-remediation.mjs
 *
 * Zero network and zero model calls: search, link check, writer and reviewer
 * are all injected. The SOURCES are real — articles.ts, article-sections.ts,
 * hero-alt.json and the specs are read from git at a PINNED commit (never the
 * working tree, never written) — so the fan-out cases run against the actual
 * B07F2VP353 damage, including the spec-less cookware guide the original brief
 * missed. Pinned because the live cycle repairs that damage for real (6583112
 * swapped it to B0GQZ5D1HR); reading the checkout made this test depend on
 * mutable content. Override with DLR_FIXTURE_REF only to re-pin deliberately.
 *
 * The positive controls come first because they are the reason this file
 * exists: a gate that has never rejected anything is unverified. Two
 * sabotaged rewrites — a stove run inside the tent, an invented cent price —
 * must both be refused and must fall through to unlink.
 */

import { execFileSync } from "node:child_process";
import { hazardFlags, reviewContent, reviewReplyError, REVIEW_MAX_TOKENS } from "./lib/content-review.mjs";
import { panel } from "./lib/llm.mjs";
import {
  searchTerm, productType, typeMatches, formFactor, aliasesFor, priceBand, pickCandidate,
  locate, remediate, readArticle, newEntry, amazonLink, checkRewrite, spliceArticle, gateSwap,
  editReviewPrompt, rewritePrompt, ungroundedClaims, spliceBlocks, retryPrompt,
} from "./lib/dead-link-remediation.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const DEAD = "B07F2VP353";
const NEW = "B0TESTSTV1";
const NOW = new Date("2026-09-22T15:00:00Z");
const THREE = ["budget-camping-cookware-that-works", "budget-portable-camping-stoves-compared", "dispersed-camping-beginners-guide"];

/* Last commit before 6583112 repaired B07F2VP353 in the live content. */
const FIXTURE_REF = process.env.DLR_FIXTURE_REF ?? "855909eea5c72ece00e34ecc60ba33f4bc96c0ec";
const git = (...args) => execFileSync("git", ["-C", ROOT, ...args], { maxBuffer: 64 * 1024 * 1024 }).toString();
const atRef = (path) => git("show", `${FIXTURE_REF}:${path}`);
const specs = {};
let SOURCES;
try {
  for (const f of git("ls-tree", "--name-only", `${FIXTURE_REF}:specs`).split("\n")) {
    if (f.endsWith(".json")) specs[f.slice(0, -5)] = atRef(`specs/${f}`);
  }
  SOURCES = Object.freeze({
    articles: atRef("src/data/articles.ts"),
    sections: atRef("src/data/article-sections.ts"),
    heroAlt: atRef("src/data/hero-alt.json"),
    specs,
  });
} catch {
  console.error(`Cannot read fixtures at ${FIXTURE_REF} — a shallow clone will not have it. Fetch history or set DLR_FIXTURE_REF.`);
  process.exit(2);
}
if (!SOURCES.articles.includes(DEAD)) {
  console.error(`Fixture ref ${FIXTURE_REF} does not contain ${DEAD} — the fan-out cases would test nothing.`);
  process.exit(2);
}
const DEAD_TITLE = "Fire-Maple Fixed Star 1 Backpacking and Camping Stove System, Black 18oz Black X1-Black";

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") => { if (cond) pass++; else failures.push(`${name}${detail ? ` — ${detail}` : ""}`); };

// ── fixtures ────────────────────────────────────────────────────────────────
const STOVE = { asin: NEW, title: "Odoland Camping Stove Cooking System with Pot, Portable Backpacking Burner", price: "$44.99", priceValue: 44.99, rating: 4.6, ratingsTotal: 3100 };
/* A listing that DOES support the old section's specifics, so the mechanical
 * rename below stays a correct rewrite for the tests that need one. */
const STOVE_FACTS = {
  asin: NEW, title: STOVE.title, brand: "Odoland", itemWeight: "18 ounces",
  bullets: [
    "Hard-anodized aluminum 1L pot with lid and heat exchanger base",
    "Built-in piezo igniter, no lighter needed",
    "Burner and canister nest inside the pot; handles fold out for pouring",
    "Not for use over a campfire or open fire; compatible with standard threaded canisters",
  ],
};
/* What Canopy actually returned for B0GQZ5D1HR on 2026-09-22 (bullets verbatim,
 * trimmed to the claims that matter). It says "nests completely inside the
 * pot" and "1L"; it does NOT say hard-anodized, lid, piezo, igniter or campfire. */
const ODOLAND_FACTS = {
  asin: NEW, title: "Odoland 1L Heat Exchanger Backpacking and Camping Stove System 1.0L", brand: "Odoland", itemWeight: "680 g",
  bullets: [
    "Dual Pot & Pot Stand for Versatile Meals Outdoors: Dual pot with pot stand supports varied outdoor cooking. Small pot doubles as mini frying pan (for heating sauces, frying eggs) or serving bowl.",
    "All in One Storage & Silent Carry: Whole set (fits 230g gas canister) nests completely inside the pot. Elastic strap locks everything tightly, no rattling noise during hiking or camping.",
    "Upgraded Safety & Anti-Leak: No Melting, No Leaks Metal base. 220℃ heat resistant parts stop warping. Dual O ring valve seals gas perfectly. Silicone nozzle cap blocks debris for steady ignition, no failed sparks.",
    "All-Terrain Stability & Wobble-Free Cooking : Ergonomic C-grip handle for effortless pouring; gas canister stand stays firm on rocks, sand and uneven ground.",
    "Ultra Fast Boiling & Fuel Saving: Boils 1L water in 160s, uses 20% less fuel.",
  ],
};
const LANTERN = { asin: "B0TESTLAN1", title: "LED Camping Lantern Rechargeable, 1000LM", price: "$39.99", priceValue: 39.99, rating: 4.8, ratingsTotal: 9000 };

/**
 * A writer that produces a clean, honest rewrite of every segment — a
 * mechanical rename, which is what the checks need to see pass. `sabotage`
 * lets a test poison one segment.
 */
function honestWriter({ sabotage } = {}) {
  const calls = [];
  const fn = async ({ user }) => {
    const u = JSON.parse(user);
    calls.push(u.article);
    const out = {};
    for (const s of u.segments) {
      let t = s.text
        .replace(/Fire-Maple Fixed Star 1 Backpacking and Camping Stove System/g, "Odoland Camping Stove Cooking System")
        .replace(/Fire-Maple Fixed Star 1/g, "Odoland Cooking System")
        .replace(/Fixed Star 1/g, "Odoland System")
        .replace(new RegExp(`https://www\\.amazon\\.com/dp/${DEAD}\\?tag=camprally-20`, "g"), amazonLink(NEW));
      if (sabotage) t = sabotage(s, t);
      out[s.id] = t;
    }
    return { value: { segments: out } };
  };
  fn.calls = calls;
  return fn;
}

const cleanReview = async () => ({ passes: 3, reviewers: ["a/x", "b/y", "c/z"], independent: true, blocking: [], notes: [] });

function makeDeps(over = {}) {
  const counts = { discover: 0, verify: 0, listing: 0, review: 0 };
  const deps = {
    anchorPrice: () => ({ price: 49.95, source: "git 21eb5e8^" }),
    discover: async (term, band) => { counts.discover++; deps.lastSearch = { term, band }; return [STOVE]; },
    searchAgeDays: () => 1,
    verifyAsin: async () => { counts.verify++; return { verdict: "LIVE", title: STOVE.title }; },
    listingFacts: async () => { counts.listing++; return STOVE_FACTS; },
    write: honestWriter(),
    hazardFlags,
    reviewContent: async (spec) => { counts.review++; deps.reviewed.push(spec); return cleanReview(); },
    reviewed: [],
    deadInCache: () => false,
    cachedTitle: () => DEAD_TITLE,
    priceCeiling: (t) => (t.match(/under\s*\$?\s*(\d+)/i) ? Number(RegExp.$1) : null),
    today: () => "2026-09-22",
    counts,
    ...over,
  };
  return deps;
}

const run = (deps, { ledger = {}, sources = SOURCES, now = NOW } = {}) =>
  remediate({ asin: DEAD, sources, ledger, now, deps });

const mentions = (sources) => {
  const hits = [];
  if (sources.articles.includes(DEAD)) hits.push("articles.ts");
  if (sources.sections.includes(DEAD)) hits.push("article-sections.ts");
  for (const [s, t] of Object.entries(sources.specs)) if (t.includes(DEAD)) hits.push(`specs/${s}.json`);
  return hits;
};

// ── 1. POSITIVE CONTROLS: sabotaged rewrites must be rejected → unlink ──────
{
  // (a) A stove run inside the tent. Replaces the product section's first
  // paragraph in the stoves guide with the carbon-monoxide advice.
  const writer = honestWriter({
    sabotage: (s, t) => (s.kind === "paragraph" && /^An integrated canister system/.test(s.text)
      ? "An integrated canister system with its own pot. On a cold night you can run this stove inside the tent for warmth while you cook, which makes a backpacking kitchen feel complete."
      : t),
  });
  const deps = makeDeps({ write: writer });
  const r = await run(deps);
  const a = r.report.articles["budget-portable-camping-stoves-compared"];
  check("sabotage/stove-in-tent: rejected", a?.outcome === "unlinked", JSON.stringify(a));
  check("sabotage/stove-in-tent: named as a hazard", /hazard/.test(a?.why ?? ""), a?.why);
  const stoves = readArticle(r.sources.articles, "budget-portable-camping-stoves-compared").content;
  check("sabotage/stove-in-tent: the hazard text never lands", !/inside the tent for warmth/.test(stoves));
  check("sabotage/stove-in-tent: dead link gone from that guide", !stoves.includes(DEAD));
}
{
  // (b) An invented exact price.
  const writer = honestWriter({
    sabotage: (s, t) => (s.id === "content#11" || /heat exchanger is the key feature/.test(s.text)
      ? t.replace(/\.$/, "") + " — and at $42.99 it undercuts every rival."
      : t),
  });
  const deps = makeDeps({ write: writer });
  const r = await run(deps);
  const a = r.report.articles["budget-camping-cookware-that-works"];
  check("sabotage/invented-price: rejected", a?.outcome === "unlinked", JSON.stringify(a));
  check("sabotage/invented-price: named as a price", /exact price \$42\.99/.test(a?.why ?? ""), a?.why);
  check("sabotage/invented-price: no reviewer spent on it", !deps.reviewed.some((s) => /\$42\.99/.test(s.body)));
  check("sabotage/invented-price: price never lands", !r.sources.articles.includes("$42.99"));
}

// ── 1b. headings: may grow by the new name, may not swallow a paragraph ─────
{
  /* Found by the first real dry run (2026-09-22): "### Fixed Star 1 System"
   * became a longer, correct heading and the ±40% paragraph rule unlinked the
   * whole guide for it. */
  const seg = [{ id: "h", kind: "heading", text: "### Fixed Star 1 System" }];
  const opts = { aliases: ["Fixed Star 1"], dead: DEAD, replacement: NEW, label: "Fire-Maple Petrel G3 Pot & Greenpeak 1 Gas Stove Camping Cooking Set" };
  check("heading: longer product name accepted", checkRewrite(seg, { h: "### Fire-Maple Petrel G3 Pot & Greenpeak 1 Gas Stove Set" }, opts).ok);
  check("heading: swallowing a paragraph rejected", !checkRewrite(seg, { h: "### Petrel G3 Set\n\nA whole paragraph of new prose that belongs in the next segment instead." }, opts).ok);
  check("heading: level change rejected", !checkRewrite(seg, { h: "## Petrel G3 Set" }, opts).ok);
}

// ── 1b'. paragraph breaks are refused BEFORE the panel is asked ────────────
{
  const blocks = ["### Fixed Star 1 System", "The Fixed Star 1 is compact. It boils fast.", "Unrelated paragraph."];
  const seg = [{ id: "p", kind: "paragraph", index: 1, text: blocks[1] }];
  const opts = { aliases: ["Fixed Star 1"], dead: DEAD, replacement: NEW, label: "Odoland Cooking System", blocks };
  check("splice: clean rewrite accepted", checkRewrite(seg, { p: "The Odoland Cooking System is compact. It boils fast." }, opts).ok);
  const split = checkRewrite(seg, { p: "The Odoland Cooking System is compact.\n\nIt boils fast." }, opts);
  check("splice: added paragraph break refused by checkRewrite", !split.ok && /paragraph break/.test(split.problems.join()), JSON.stringify(split));

  // End to end: the dispersed guide's rewrite splits a paragraph. The panel
  // must never be asked about THAT guide; the other two still reach review.
  const deps = makeDeps({
    write: honestWriter({ sabotage: (s, t) => (/^A reliable stove is the heart/.test(s.text) ? t.replace(". ", ".\n\n") : t) }),
  });
  const r = await run(deps);
  const disp = r.report.articles["dispersed-camping-beginners-guide"];
  check("splice/order: dispersed unlinked for the paragraph break", disp?.outcome === "unlinked" && /mechanical check: .*paragraph break/.test(disp.why), JSON.stringify(disp));
  check("splice/order: no panel call for the refused guide", !deps.reviewed.some((s) => /Dispersed/i.test(s.title)), deps.reviewed.map((s) => s.title).join(" | "));
  check("splice/order: the other guides still reviewed", deps.counts.review === 2, String(deps.counts.review));
}

// ── 1b''. edge whitespace is not a paragraph; a real extra paragraph still is ─
{
  /* Dry run 9: both dispersed drafts ended a segment with "\n". Joined with
   * "\n\n" that shifted the next paragraph to "\n<text>" — count held, and the
   * guide was unlinked for "paragraph 22 changed outside the segments", a
   * reason that named no segment and quoted nothing. */
  const blocks = ["### Fixed Star 1 System", "The Fixed Star 1 is compact. It boils fast.", "Unrelated paragraph."];
  const seg = [{ id: "p", kind: "paragraph", index: 1, text: blocks[1] }];
  const opts = { aliases: ["Fixed Star 1"], dead: DEAD, replacement: NEW, label: "Odoland Cooking System", blocks };
  const clean = "The Odoland Cooking System is compact. It boils fast.";
  const trailing = checkRewrite(seg, { p: `${clean}\n` }, opts);
  check("edge ws: trailing newline passes the structural check", trailing.ok, JSON.stringify(trailing));
  check("edge ws: leading+trailing blank lines pass", checkRewrite(seg, { p: `\n\n  ${clean}  \n\n` }, opts).ok);
  check("edge ws: splice output is byte-identical to the clean draft's", spliceBlocks(blocks, seg, { p: `${clean}\n` }).content === spliceBlocks(blocks, seg, { p: clean }).content);
  const added = checkRewrite(seg, { p: `${clean}\n\nA brand new paragraph about fuel.\n` }, opts);
  const why = added.problems.join(" | ");
  check("edge ws: a genuinely added paragraph still fails", !added.ok && /paragraph break/.test(why), why);
  check("edge ws: that reason names the segment and quotes the text", /\bp contains/.test(why) && /"A brand new paragraph about fuel\."/.test(why), why);
  /* The count-preserving shift is now unreachable for string drafts; a String
   * object skips the trim and reaches it, which is how this pins its wording. */
  const shifted = spliceBlocks(blocks, seg, { p: new String(`${clean}\n`) }).problems.join(" | ");
  check("edge ws: a shift outside the segments names the segment and quotes both sides", /^p: its rewrite spilled into paragraph 2/.test(shifted) && /became "\\nUnrelated paragraph\."/.test(shifted) && /was "Unrelated paragraph\."/.test(shifted), shifted);
  check("edge ws: the shift reason gets the paragraph-break retry hint", retryPrompt({ system: "S", user: "{}" }, { draft: {}, reasons: [shifted] }).system.includes("never start or end one with a newline"));

  // End to end: the dispersed writer ends every segment with "\n" on BOTH drafts.
  const deps = makeDeps({ write: honestWriter({ sabotage: (s, t) => (/^A reliable stove is the heart/.test(s.text) ? `${t}\n` : t) }) });
  const r = await run(deps);
  const disp = r.report.articles["dispersed-camping-beginners-guide"];
  check("edge ws/e2e: dispersed swapped despite a trailing newline", disp?.outcome === "swapped", JSON.stringify(disp));
  check("edge ws/e2e: no retry spent on whitespace", !disp?.retry, JSON.stringify(disp?.retry));
}

// ── 1c. `updated` injection: tolerate a `date:` line with no trailing comma ──
{
  /* Blind-review nit (2026-09-22): the injection regex required `date: "…",`
   * and silently did nothing without the comma, so a swap could ship with no
   * `updated` stamp. Both forms must get one, and the result must stay a
   * well-formed object literal. */
  const art = (dateLine) => `export const articles = [\n  {\n    slug: "x",\n    title: "X",\n    excerpt: "E",\n    ${dateLine}\n    content: \`body\`,\n  },\n];\n`;
  const withComma = spliceArticle(art(`date: "2026-04-11",`), "x", { updated: "2026-09-22" });
  check("updated: injected after `date: …,`", /date: "2026-04-11",\n    updated: "2026-09-22",\n    content:/.test(withComma), withComma);
  const noComma = spliceArticle(art(`date: "2026-04-11"`), "x", { updated: "2026-09-22" });
  check("updated: injected after a comma-less `date:`", /updated: "2026-09-22"/.test(noComma), noComma);
  check("updated: comma-less date gets its separator", /date: "2026-04-11",\n    updated: "2026-09-22"\n    content:/.test(noComma), noComma);
  const existing = spliceArticle(art(`date: "2026-04-11",\n    updated: "2026-05-01",`), "x", { updated: "2026-09-22" });
  check("updated: existing stamp replaced, not duplicated", (existing.match(/updated:/g) || []).length === 1 && existing.includes(`updated: "2026-09-22"`), existing);
}

// ── 2. candidate filtering ──────────────────────────────────────────────────
{
  const term = searchTerm(DEAD_TITLE);
  check("term: brand, model and variant dropped", term === "backpacking camping stove system", term);
  const type = productType(term);
  check("type: stove + system qualifier", type.head === "stove" && type.qualifiers?.includes("pot"), JSON.stringify(type));
  check("type: lantern rejected", !typeMatches(LANTERN.title, type));
  check("type: bare stove without a pot/system rejected", !typeMatches("Ultralight Backpacking Stove with Piezo", type));
  check("type: stove system accepted", typeMatches(STOVE.title, type));

  const band = priceBand(49.95);
  check("band: ±30% of $49.95 is $35-$65", band.min === 35 && band.max === 65, JSON.stringify(band));
  const capped = priceBand(49.95, [null, 40]);
  check("band: capped by an article's own under $N", capped.max === 40 && capped.min === 35, JSON.stringify(capped));
  const jetboil = { asin: "B004UVPDUM", title: "Jetboil Zip Camping Stove Cooking System", priceValue: 109.99, rating: 4.7, ratingsTotal: 5000 };
  check("band: the $109.99 Jetboil is excluded", !pickCandidate([jetboil], { type, band }).candidate);

  const low = { ...STOVE, asin: "B0TESTLOW1", rating: 4.1 };
  check("rating: 4.1 rejected", !pickCandidate([low], { type, band }).candidate);
  check("tried: excluded", !pickCandidate([STOVE], { type, band, exclude: new Set([NEW]) }).candidate);
  check("cache DEAD: excluded", !pickCandidate([STOVE], { type, band, deadInCache: (a) => a === NEW }).candidate);
  const ranked = pickCandidate([LANTERN, low, STOVE], { type, band });
  check("ranking: first survivor wins, rejections recorded", ranked.candidate?.asin === NEW && ranked.rejected.length === 2);

  // Wrong-type in band, end to end: the only result is a lantern → unlink, no writer call.
  const deps = makeDeps({ discover: async () => [LANTERN] });
  const r = await run(deps);
  check("wrong-type: whole ASIN unlinked", r.entry.status === "unlinked", r.entry.status);
  check("wrong-type: no writer call", deps.write.calls.length === 0);

  /* Form factor (2026-09-22 dry run): "pot" satisfied the system qualifier and
   * a pot set with a SEPARATE burner was picked for the integrated Fixed Star
   * 1. Titles below are the real Canopy results cached for that search. */
  const PETREL = { asin: "B0DHL1PKVM", title: "Fire-Maple Petrel G3 Pot & Greenpeak 1 Gas Stove Camping Cooking Set", priceValue: 49.95, rating: 4.7, ratingsTotal: 69 };
  const ODO_POTS = { asin: "B0CR4W66C3", title: "Odoland Camping Pots with Heat Exchanger Camping Cooking Set with Portable Camping Stove Camping Mess Kit Incl", priceValue: 40.99, rating: 4.6, ratingsTotal: 258 };
  const SMOKEY = { asin: "B0DHLX31RD", title: "Smokey Camp Camping Cookware Mess Kit Set with Stove - Backpacking Camping Pots and Pans Set, All in One Non-S", priceValue: 54.99, rating: 4.4, ratingsTotal: 130 };
  const ODO_1L = { asin: "B0GQZ5D1HR", title: "Odoland 1L Heat Exchanger Backpacking and Camping Stove System", priceValue: 50.39, rating: 4.6, ratingsTotal: 172 };
  const POCKET = { asin: "B01N5O7551", title: "MSR PocketRocket 2 Ultralight Camping and Backpacking Stove", priceValue: 49.95, rating: 4.8, ratingsTotal: 4292 };
  const form = productType(term, DEAD_TITLE);
  check("form: integrated dead title detected", form.form?.id === "integrated cook system", JSON.stringify(form.form?.id));
  check("form: pot + separate stove set rejected", !typeMatches(PETREL.title, form));
  check("form: pots-with-heat-exchanger + stove mess kit rejected", !typeMatches(ODO_POTS.title, form));
  check("form: 'all in one' cookware mess kit rejected", !typeMatches(SMOKEY.title, form));
  check("form: true heat-exchanger stove system accepted", typeMatches(ODO_1L.title, form));
  check("form: cooking system with pot accepted", typeMatches(STOVE.title, form));
  check("form: Jetboil Zip cooking system accepted", typeMatches(jetboil.title, form));
  const real = pickCandidate([POCKET, PETREL, ODO_POTS, SMOKEY, ODO_1L], { type: form, band });
  check("form: real result order picks the integrated system", real.candidate?.asin === ODO_1L.asin, real.candidate?.asin);
  check("form: the pot set's rejection names the form", /form check \(not an integrated cook system: "Cooking Set"\)/.test(real.rejected.find((x) => x.asin === PETREL.asin)?.why ?? ""), JSON.stringify(real.rejected));
  const onlySets = makeDeps({ discover: async () => [PETREL, ODO_POTS, SMOKEY] });
  const rs = await run(onlySets);
  check("form: no integrated candidate → whole ASIN unlinked", rs.entry.status === "unlinked", rs.entry.status);
  check("form: no integrated candidate → no writer, no review", onlySets.write.calls.length === 0 && onlySets.counts.review === 0);
  // A non-integrated dead product is untouched by the rule.
  const bare = "MSR PocketRocket 2 Ultralight Camping and Backpacking Stove";
  const bareType = productType(searchTerm(bare), bare);
  check("form: bare stove dead title has no form factor", bareType.form === null && formFactor(bare) === null);
  check("form: bare stove dead product still accepts a stove set", typeMatches(PETREL.title, bareType));
  check("form: a cook set dead title has no form factor", formFactor("Stanley Adventure Base Camp Cook Set for 4") === null);

  // Not already linked from an affected guide: the Jetboil is linked from the
  // stoves guide, so even priced in band it must lose.
  const jetInBand = { ...jetboil, priceValue: 55 };
  const r2 = await run(makeDeps({ discover: async () => [jetInBand, STOVE] }));
  check("already-linked: skipped for the next result", r2.entry.candidate?.asin === NEW, r2.entry.candidate?.asin);

  // LIVE verify, fail-closed.
  const deadCand = makeDeps({ verifyAsin: async () => ({ verdict: "DEAD" }) });
  const r3 = await run(deadCand);
  check("verify DEAD: attempt spent, candidate tried, no rewrite", r3.entry.attempts === 1 && r3.entry.triedCandidates.includes(NEW) && deadCand.write.calls.length === 0);
  check("verify DEAD: still pending, nothing edited", r3.entry.status === "pending" && r3.sources === SOURCES);
  const throttled = makeDeps({ verifyAsin: async () => ({ verdict: "UNKNOWN" }) });
  const r4 = await run(throttled);
  check("verify UNKNOWN: deferral, no attempt", r4.entry.attempts === 0 && r4.entry.status === "pending");
  const r5 = await run(makeDeps());
  check("verify LIVE: recorded for the ASIN cache", r5.cacheRecords.some((c) => c.asin === NEW && c.result.verdict === "LIVE"));

  // Freshness: stale search is refetched with force.
  let forced = null;
  await run(makeDeps({ searchAgeDays: () => 9, discover: async (t, o) => { forced = o.force; return [STOVE]; } }));
  check("freshness: >7 day search refetched", forced === true);
}

// ── 3. fan-out completeness, against the real files ─────────────────────────
{
  const aliases = aliasesFor("Fire-Maple Fixed Star 1 Backpacking and Camping Stove System");
  check("aliases: label, brand+model, model", aliases.includes("Fire-Maple Fixed Star 1") && aliases.includes("Fixed Star 1"), JSON.stringify(aliases));
  const hits = locate(SOURCES, DEAD, aliases);
  const slugs = hits.map((h) => h.slug).sort();
  check("fan-out: exactly the three guides", JSON.stringify(slugs) === JSON.stringify([...THREE].sort()), slugs.join(", "));
  const cook = hits.find((h) => h.slug === "budget-camping-cookware-that-works");
  check("fan-out: cookware (no spec) found", !!cook && !cook.inSpec && cook.inGrid);
  const segText = (h) => h.segments.map((s) => s.text).join("\n");
  check("fan-out: cookware verdict (articles.ts:3107) included", /upgrades that to a single integrated system/.test(segText(cook)));
  const stoves = hits.find((h) => h.slug === "budget-portable-camping-stoves-compared");
  check("fan-out: stoves ### heading included", stoves.segments.some((s) => s.kind === "heading" && /Fixed Star 1 System/.test(s.text)));
  check("fan-out: stoves unnamed section paragraphs included", /heat exchanger fins on the pot/.test(segText(stoves)) && /works well for one to two people/.test(segText(stoves)));
  check("fan-out: stoves CTA included", stoves.segments.some((s) => s.kind === "cta"));
  check("fan-out: stoves verdict (articles.ts:3412) included", /better all-around cook and boil kit/.test(segText(stoves)));
  check("fan-out: stoves neighbouring products NOT sent", !/Stanley Adventure Cook Set\n/.test(segText(stoves)) && !stoves.segments.some((s) => /^### Stanley/.test(s.text)));
  check("fan-out: stoves spec + grid", stoves.inSpec && stoves.inGrid);
  const disp = hits.find((h) => h.slug === "dispersed-camping-beginners-guide");
  check("fan-out: dispersed cooking paragraph + verdict", disp.segments.length === 2, disp.segments.map((s) => s.id).join(","));
  check("fan-out: dispersed spec (truncated label) + grid", disp.inSpec && disp.inGrid);

  // A fourth guide that names the product in prose only — point 7.
  const planted = SOURCES.articles.replace(
    "The best cheap camping table for cooking is the one",
    "Pair it with the Fire-Maple Fixed Star 1 if you backpack. The best cheap camping table for cooking is the one",
  );
  const more = locate({ ...SOURCES, articles: planted }, DEAD, aliases).map((h) => h.slug);
  check("fan-out: another guide naming it in prose is found", more.includes("best-cheap-camping-tables"), more.join(", "));
}

// ── 4. a clean swap: every reference replaced, nothing else touched ─────────
{
  const deps = makeDeps();
  const r = await run(deps);
  check("swap: all three swapped", THREE.every((s) => r.report.articles[s]?.outcome === "swapped"), JSON.stringify(r.report.articles));
  check("swap: status swapped", r.entry.status === "swapped", r.entry.status);
  check("swap (spec re-render): no hand-authored file mentions the dead ASIN", mentions(r.sources).length === 0, mentions(r.sources).join(", "));
  check("swap: specs carry the replacement", ["budget-portable-camping-stoves-compared", "dispersed-camping-beginners-guide"].every((s) => JSON.parse(r.sources.specs[s]).products.some((p) => p.asin === NEW)));
  check("swap: all three grids carry the replacement", r.sources.sections.split(`asin: "${NEW}"`).length - 1 === 3);
  const cookHead = readArticle(r.sources.articles, "budget-camping-cookware-that-works").head;
  check("swap: updated set to today", /updated: "2026-09-22"/.test(cookHead));
  check("swap: date untouched", /date: "2026-04-03"/.test(cookHead));
  const outside = (src) => src.replace(/content: `[\s\S]*?`/g, "").replace(/updated: "[^"]*"/g, "");
  const otherSlug = "best-cheap-camping-tables";
  check("swap: an unaffected article is byte-identical", readArticle(r.sources.articles, otherSlug).content === readArticle(SOURCES.articles, otherSlug).content);
  check("swap: 3 writer calls, one per guide", deps.write.calls.length === 3, String(deps.write.calls.length));
  check("swap: review never saw a price", deps.reviewed.every((s) => !/\$\d/.test(s.products.map((p) => p.label).join())));
  void outside;
}

// ── 5. review returns null → defer, not pass ────────────────────────────────
{
  const deps = makeDeps({ reviewContent: async () => null });
  const r = await run(deps);
  check("review-null: nothing swapped", !Object.values(r.report.articles).some((a) => a.outcome === "swapped"));
  check("review-null: pending, no attempt spent", r.entry.status === "pending" && r.entry.attempts === 0, `${r.entry.status}/${r.entry.attempts}`);
  check("review-null: nothing edited", mentions(r.sources).length === mentions(SOURCES).length);
  check("review-null: candidate kept for the next cycle", r.entry.candidate?.asin === NEW);
}

// ── 6. writer: not the same kind → candidate rejected, next attempt ─────────
{
  const deps = makeDeps({ write: async () => ({ value: { notSameKind: true, reason: "a lantern is not a stove" } }) });
  const r = await run(deps);
  check("not-same-kind: attempt spent, candidate cleared", r.entry.attempts === 1 && !r.entry.candidate && r.entry.triedCandidates.includes(NEW));
  check("not-same-kind: nothing edited", r.sources === SOURCES);
}

// ── 7. unlink fallback, deadline, attempts, churn ───────────────────────────
{
  /* Counting mocks, not throwing ones: a sabotaged deadline must show up as a
   * FAILED assertion, and a throw reads as a harness crash instead. */
  const spend = { n: 0 };
  const zeroModel = () => {
    const d = makeDeps({ discover: async () => { spend.n++; return [STOVE]; } });
    d.write = Object.assign(async (p) => { spend.n++; return honestWriter()(p); }, { calls: [] });
    d.reviewContent = async () => { spend.n++; return cleanReview(); };
    return d;
  };
  const old = newEntry({ asin: DEAD, now: new Date(NOW.getTime() - 73 * 3_600_000), anchor: { price: 49.95 }, aliases: aliasesFor("Fire-Maple Fixed Star 1 Backpacking and Camping Stove System"), label: "Fire-Maple Fixed Star 1 Backpacking and Camping Stove System" });
  const r = await run(zeroModel(), { ledger: { [DEAD]: old } });
  check("deadline: 73h-old entry unlinked", r.entry.status === "unlinked", r.entry.status);
  check("deadline: zero search/model calls", spend.n === 0, `${spend.n} calls`);
  check("deadline: why names the deadline", Object.values(r.entry.perArticle).every((p) => /deadline/.test(p.why)));
  check("unlink: no hand-authored file mentions the dead ASIN", mentions(r.sources).length === 0, mentions(r.sources).join(", "));
  const stoves = readArticle(r.sources.articles, "budget-portable-camping-stoves-compared");
  check("unlink: CTA line removed", !/Check the Fire-Maple/.test(stoves.content));
  check("unlink: product section text kept", /### Fire-Maple Fixed Star 1 System/.test(stoves.content) && /heat exchanger fins on the pot/.test(stoves.content));
  const disp = readArticle(r.sources.articles, "dispersed-camping-beginners-guide").content;
  check("unlink: inline link keeps its words", /A reliable stove is the heart of your kitchen\. The Fire-Maple Fixed Star 1 Backpacking and Camping Stove System combines/.test(disp));
  const cook = readArticle(r.sources.articles, "budget-camping-cookware-that-works").content;
  check("unlink: inline CTA stripped from its paragraph", /designed for canister fuel\.\n\n### GCI/.test(cook));
  check("unlink: NOT marked updated", !/updated: "2026-09-22"/.test(r.sources.articles));
  check("unlink: grid entries removed", !r.sources.sections.includes(DEAD));
  const s = JSON.parse(r.sources.specs["dispersed-camping-beginners-guide"]);
  check("unlink: spec product dropped, body unlinked", !s.products.some((p) => p.asin === DEAD) && !s.body.includes(DEAD));

  const spent = { ...old, detectedAt: NOW.toISOString(), deadline: new Date(NOW.getTime() + 3_600_000).toISOString(), attempts: 2 };
  spend.n = 0;
  const r2 = await run(zeroModel(), { ledger: { [DEAD]: spent } });
  const r2calls = spend.n;
  check("attempts: 2 used → unlink", r2.entry.status === "unlinked");
  check("attempts: zero search/model calls", r2calls === 0);

  const churnLedger = { B0PRIORDED: { perArticle: { x: { outcome: "swapped", replacement: DEAD, at: new Date(NOW.getTime() - 10 * 86_400_000).toISOString() } } } };
  spend.n = 0;
  const r3 = await run(zeroModel(), { ledger: churnLedger });
  check("churn: zero search/model calls", spend.n === 0);
  check("churn: a replacement that dies within 30d is unlinked", r3.entry.status === "unlinked" && /swapped in within 30 days/.test(Object.values(r3.entry.perArticle)[0].why));

  let searched = 0;
  const r4 = await run(makeDeps({ anchorPrice: () => null, discover: async () => { searched++; return [STOVE]; } }));
  check("no anchor price: no search", searched === 0);
  check("no anchor price: unlink without searching", r4.entry.status === "unlinked");

  const r5 = await run(makeDeps({ discover: async () => { throw Object.assign(new Error("q"), { code: "QUOTA" }); } }));
  check("quota: deferral, no attempt, nothing edited", r5.entry.status === "pending" && r5.entry.attempts === 0 && r5.sources === SOURCES);
}

// ── 8. idempotency and per-ASIN bookkeeping ─────────────────────────────────
{
  const deps = makeDeps();
  const first = await run(deps);
  let againSearched = 0;
  const again = await run(makeDeps({ discover: async () => { againSearched++; return [STOVE]; } }), { ledger: { [DEAD]: first.entry }, sources: first.sources });
  check("idempotent: no search on a resolved ASIN", againSearched === 0);
  check("idempotent: second run changes nothing", again.sources === first.sources);
  check("idempotent: status stays swapped", again.entry.status === "swapped");

  // Mixed: one guide's review rejects, the other two swap; the next cycle has
  // nothing left to do for this ASIN.
  const mixedDeps = makeDeps({
    reviewContent: async (spec) => (/Dispersed/.test(spec.title)
      ? { passes: 3, reviewers: [], independent: true, blocking: [{ quote: "x", problem: "claims a feature the title does not support", severity: "high" }], notes: [] }
      : cleanReview()),
  });
  const mixed = await run(mixedDeps);
  check("mixed: two swapped, one unlinked", mixed.entry.status === "mixed", mixed.entry.status);
  check("mixed: no file mentions the dead ASIN", mentions(mixed.sources).length === 0, mentions(mixed.sources).join(", "));

  // One deferred guide: the others swap now, the deferred one reuses the SAME
  // candidate next cycle rather than picking afresh.
  let n = 0;
  const partial = await run(makeDeps({ reviewContent: async () => (++n === 2 ? null : cleanReview()) }));
  check("partial: one pending, others swapped", partial.entry.status === "pending" && Object.values(partial.entry.perArticle).filter((p) => p.outcome === "swapped").length === 2);
  let resumeSearched = 0;
  const resume = await run(makeDeps({ discover: async () => { resumeSearched++; return [STOVE]; } }), { ledger: { [DEAD]: partial.entry }, sources: partial.sources });
  check("partial: no new search on resume", resumeSearched === 0);
  check("partial: resumes with the same candidate, no new search", resume.entry.status === "swapped", resume.entry.status);
  check("partial: attempts untouched by deferrals", resume.entry.attempts === 0);
}

// ── 9. the swap review judges the EDIT, in the whole article ────────────────
/* Found by the B07F2VP353 dry runs (2026-09-22). Reviewers were sent the
 * edited paragraphs plus one neighbour each way, framed as "the article", and
 * raised HIGH findings about text outside the edit — "the article does not
 * compare six stoves", "everything you need omits water and first aid". A
 * correct swap passed or failed on which seats happened to answer.
 *
 * These run the REAL reviewContent tally (2 of 3, high blocks) over a scripted
 * panel, so the scope rule is exercised where it actually decides. */
{
  const SIX = "None of them are fancy, but all six deliver real meals at real camping prices, and that is the whole point.";
  const EVERYTHING = "Start with these three, add your shelter and sleeping bag, and you have everything you need to camp free on public land.";
  const REPLAY_SIX = "The article does not compare six stoves. Only the Fire-Maple Petrel G3 Pot & Greenpeak 1 Gas Stove Camping is described; the Stanley Adventure Cook Set is a utensil/cookset, not a stove that delivers meals on its own.";
  const REPLAY_EVERYTHING = "Presenting stove, lantern and a campground directory plus shelter and sleeping bag as a complete kit omits essential dispersed-camping safety items such as water treatment, first aid, navigation, and Leave No Trace compliance, which could mislead beginners.";
  check("fixture: the six-stoves sentence is real", SOURCES.articles.includes(SIX));
  check("fixture: the everything-you-need sentence is real", SOURCES.articles.includes(EVERYTHING));

  /* seatsFor(prompt) -> [issues|"malformed"|null, …] for the three seats. */
  const scripted = (seatsFor) => {
    const prompts = [];
    const fake = async (_role, prompt) => {
      prompts.push(prompt);
      const plan = seatsFor(JSON.parse(prompt.user), prompt);
      const names = [["minimax", "MiniMax-M3"], ["openrouter", "meta/muse-glimmer-30b"], ["openrouter", "deepseek/deepseek-v4-pro"]];
      const results = [], failures = [];
      plan.forEach((p, i) => {
        const [provider, model] = names[i];
        if (p === null) failures.push({ provider, model, error: "unparseable JSON", malformed: true, tries: 2 });
        else results.push({ value: { issues: p }, provider, model, tries: 1 });
      });
      return { results, failures, independent: true, members: [] };
    };
    fake.prompts = prompts;
    return fake;
  };
  const withPanel = (fake, over = {}) => makeDeps({
    reviewContent: (spec, opts) => reviewContent(spec, { ...opts, panelFn: fake }),
    ...over,
  });
  const hi = (quote, problem, edit) => ({ quote, problem, severity: "high", ...(edit != null ? { edit } : {}) });

  // (a) the prompt carries the whole guide with the edits marked
  {
    const fake = scripted(() => [[], [], []]);
    await run(withPanel(fake));
    const stoves = fake.prompts.map((p) => JSON.parse(p.user)).find((u) => /Stoves/i.test(u.title));
    check("edit-review: full article sent (text far from the edit)", !!stoves?.article?.includes(SIX) && /### Stanley/.test(stoves.article), String(stoves?.article?.length));
    check("edit-review: every changed span is marked", stoves?.edits?.length === 7 && (stoves.article.match(/\[\[EDIT \d+\]\]/g) ?? []).length === 7);
    check("edit-review: edits carry before and after", !!stoves?.edits?.every((e) => e.before && e.after) && stoves.edits.some((e) => e.before !== e.after));
    check("edit-review: no price in the prompt", fake.prompts.every((p) => !/\$\d/.test(p.user.replace(/"article":[\s\S]*$/, ""))));
    const sizes = fake.prompts.map((p) => p.system.length + p.user.length);
    check("edit-review: prompts stay small (< 40k chars each)", sizes.every((n) => n < 40_000), sizes.join(","));
    console.log(`  (edit-review prompt sizes, chars: ${sizes.join(", ")})`);
  }

  // (b) THE REPLAY: two seats raise the out-of-edit findings → the swap passes
  {
    const fake = scripted(({ title }) => (/Stoves/i.test(title)
      ? [[hi(SIX, REPLAY_SIX)], [hi(SIX, REPLAY_SIX)], []]
      : /Dispersed/i.test(title)
        ? [[hi(EVERYTHING, REPLAY_EVERYTHING)], [], [hi(EVERYTHING, REPLAY_EVERYTHING)]]
        : [[], [], []]));
    const r = await run(withPanel(fake));
    check("replay/six-stoves: correct swap is no longer failed", r.report.articles["budget-portable-camping-stoves-compared"]?.outcome === "swapped", JSON.stringify(r.report.articles["budget-portable-camping-stoves-compared"]).slice(0, 300));
    check("replay/everything-you-need (carried verbatim through the edit): swap passes", r.report.articles["dispersed-camping-beginners-guide"]?.outcome === "swapped", JSON.stringify(r.report.articles["dispersed-camping-beginners-guide"]).slice(0, 300));
    const seats = r.entry.perArticle["budget-portable-camping-stoves-compared"].review?.seats ?? [];
    check("replay: ledger records every seat", seats.length === 3 && seats.every((x) => x.verdict === "pass"), JSON.stringify(seats));
    check("replay: out-of-scope findings are counted, not hidden", seats.filter((x) => x.outOfScope === 1).length === 2);
  }

  // (c) POSITIVE CONTROL: an invented spec INSIDE the edit, flagged by two seats → rejected
  {
    // No figures: "45 seconds" would now be refused mechanically by the
    // grounding check (section 10) before any seat saw it. This control is
    // about the PANEL, so its lie must be one the table cannot see.
    const LIE = "It is dishwasher safe and weighs almost nothing.";
    const writer = honestWriter({ sabotage: (s, t) => (/^The heat exchanger fins/.test(s.text) ? t.replace(/\.$/, `. ${LIE}`) : t) });
    const fake = scripted(({ title }) => (/Stoves/i.test(title)
      ? [[hi(LIE, "invented boil time and weight not supported by the product title")], [], [hi(LIE, "fabricated specs")]]
      : [[], [], []]));
    const r = await run(withPanel(fake, { write: writer }));
    const a = r.report.articles["budget-portable-camping-stoves-compared"];
    check("control/in-edit claim: rejected", a?.outcome === "unlinked" && /review rejected/.test(a.why), JSON.stringify(a).slice(0, 300));
    check("control/in-edit claim: seats show who flagged it", a?.review?.seats.filter((x) => x.verdict === "flag-high").length === 2, JSON.stringify(a?.review));
    check("control/in-edit claim: never lands", !r.sources.articles.includes(LIE));
  }

  // (d) text OUTSIDE the edit that the edit makes false still blocks, when the seats say which edit
  {
    const fake = scripted(({ title }) => (/Stoves/i.test(title)
      ? [[hi(SIX, "edit 2 removed the sixth stove", 2)], [hi(SIX, "count no longer matches after edit 2", 2)], []]
      : [[], [], []]));
    const r = await run(withPanel(fake));
    check("scope (b): outside-edit claim tied to an edit blocks", r.report.articles["budget-portable-camping-stoves-compared"]?.outcome === "unlinked");
  }

  // (e) a seat that never answers is recorded as such, and 2 of 3 still decide
  {
    const fake = scripted(() => [[], null, []]);
    const r = await run(withPanel(fake));
    const seats = r.report.articles["budget-camping-cookware-that-works"]?.review?.seats ?? [];
    check("no-answer seat: recorded with its reason", seats.some((x) => x.verdict === "no-answer" && /malformed JSON after 2 tries/.test(x.error)), JSON.stringify(seats));
    check("no-answer seat: 2 answering seats still swap", r.report.articles["budget-camping-cookware-that-works"]?.outcome === "swapped");
    const two = scripted(() => [[], null, null]);
    const r2 = await run(withPanel(two));
    check("two no-answer seats: defer, seats still recorded", r2.entry.status === "pending" && r2.entry.perArticle["budget-camping-cookware-that-works"]?.review?.seats.length === 3);
  }

  // (f) the REAL panel(): malformed JSON is logged always, retried once, then counted as no answer
  {
    const env = { MINIMAX_API_KEY: process.env.MINIMAX_API_KEY, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, MINIMAX_DEBUG: process.env.MINIMAX_DEBUG };
    process.env.MINIMAX_API_KEY = "test"; process.env.OPENROUTER_API_KEY = "test"; delete process.env.MINIMAX_DEBUG;
    const realFetch = globalThis.fetch, realErr = console.error;
    const logged = [];
    const calls = {};
    const reply = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
    const install = (museReplies) => {
      for (const k of Object.keys(calls)) delete calls[k];
      logged.length = 0;
      globalThis.fetch = async (_url, init) => {
        const b = JSON.parse(init.body);
        calls[b.model] = (calls[b.model] ?? 0) + 1;
        if (b.model === "meta/muse-glimmer-30b") {
          const t = museReplies[Math.min(calls[b.model], museReplies.length) - 1];
          return reply({ choices: [{ message: { content: t } }] });
        }
        if (b.messages?.[0]?.role === "system") return reply({ choices: [{ message: { content: '{"issues":[]}' } }] });
        return reply({ content: [{ type: "text", text: '{"issues":[]}' }] });
      };
      console.error = (...a) => logged.push(a.join(" "));
    };
    try {
      const BROKEN = '{"issues":[{"quote":"The [Fire-Maple Petrel G3](https://x) combines" "problem":';
      install([BROKEN, BROKEN, BROKEN]);
      const p = await panel("reviewer", { system: "s", user: "u" }, { size: 3 });
      check("malformed: retried exactly once (2 calls, not 3)", calls["meta/muse-glimmer-30b"] === 2, JSON.stringify(calls));
      check("malformed: counted as no answer", p.results.length === 2 && p.failures.length === 1 && p.failures[0].malformed, JSON.stringify(p.failures));
      check("malformed: logged WITHOUT MINIMAX_DEBUG", logged.some((l) => /muse-glimmer-30b returned malformed JSON — retrying once/.test(l)) && logged.some((l) => /NO ANSWER after 2 tries/.test(l)), logged.join(" / "));
      install([BROKEN, '{"issues":[]}']);
      const p2 = await panel("reviewer", { system: "s", user: "u" }, { size: 3 });
      check("malformed then valid: the retry's answer counts", p2.results.length === 3 && p2.results.some((r) => r.tries === 2), JSON.stringify(p2.results.map((r) => r.tries)));
    } finally {
      globalThis.fetch = realFetch; console.error = realErr;
      for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }

  // (g) the token ceiling reaches the panel on BOTH review paths
  /* DeepSeek bills reasoning against max_tokens. At panel()'s default 8000 it
   * reasoned itself out of an answer on a publish review, and at 12000 on three
   * dead-link reviews (dry runs 5/8/10), 2026-09-22/23. */
  {
    const seen = [];
    const capture = async (_role, opts) => { seen.push(opts.maxTokens); return { results: [], failures: [], independent: false }; };
    await reviewContent({ title: "t", body: "b" }, { panelFn: capture });
    check("ceiling: publish review sends REVIEW_MAX_TOKENS (16000)", REVIEW_MAX_TOKENS === 16000 && seen[0] === REVIEW_MAX_TOKENS, JSON.stringify(seen));
    await reviewContent({ title: "t", body: "b" }, { panelFn: capture, prompt: { system: "s", user: "u", maxTokens: 12000 } });
    check("ceiling: a smaller prompt maxTokens is raised to the ceiling", seen[1] === REVIEW_MAX_TOKENS, JSON.stringify(seen));
    await reviewContent({ title: "t", body: "b" }, { panelFn: capture, prompt: { system: "s", user: "u", maxTokens: 20000 } });
    check("ceiling: a larger prompt maxTokens is kept", seen[2] === 20000, JSON.stringify(seen));
    const g = await gateSwap(
      { articleTitle: "T", segments: [], replacements: {}, candidate: { title: "Odoland 1L Stove", asin: "X" }, hit: { title: "T", blocks: [], segments: [] } },
      { hazardFlags: () => [], reviewContent: (spec, opts) => reviewContent(spec, { ...opts, panelFn: capture }) },
    );
    check("ceiling: dead-link gateSwap review sends >= REVIEW_MAX_TOKENS", seen[3] >= REVIEW_MAX_TOKENS && g.verdict === "defer", JSON.stringify({ seen, v: g.verdict }));
  }

  // (h) the REAL panel(): an EMPTY reply (reasoning ate max_tokens) is retried once
  {
    const env = { MINIMAX_API_KEY: process.env.MINIMAX_API_KEY, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, MINIMAX_DEBUG: process.env.MINIMAX_DEBUG };
    process.env.MINIMAX_API_KEY = "test"; process.env.OPENROUTER_API_KEY = "test"; delete process.env.MINIMAX_DEBUG;
    const realFetch = globalThis.fetch, realErr = console.error;
    const logged = [], calls = {}, maxSeen = {};
    const reply = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
    const install = (dsReplies) => {
      for (const k of Object.keys(calls)) delete calls[k];
      logged.length = 0;
      globalThis.fetch = async (_url, init) => {
        const b = JSON.parse(init.body);
        calls[b.model] = (calls[b.model] ?? 0) + 1;
        maxSeen[b.model] = b.max_tokens;
        if (b.model === "deepseek/deepseek-v4-pro") {
          const t = dsReplies[Math.min(calls[b.model], dsReplies.length) - 1];
          return reply({ choices: [{ message: { content: t }, finish_reason: t ? "stop" : "length" }] });
        }
        if (b.messages?.[0]?.role === "system") return reply({ choices: [{ message: { content: '{"issues":[]}' } }] });
        return reply({ content: [{ type: "text", text: '{"issues":[]}' }] });
      };
      console.error = (...a) => logged.push(a.join(" "));
    };
    try {
      install(["", '{"issues":[]}']);
      const r = await reviewContent({ title: "t", body: "b" }, {});
      check("empty: DeepSeek retried once and its second answer counts", calls["deepseek/deepseek-v4-pro"] === 2 && r?.passes === 3, JSON.stringify({ calls, passes: r?.passes }));
      check("empty: the real request carries max_tokens 16000", maxSeen["deepseek/deepseek-v4-pro"] === 16000, JSON.stringify(maxSeen));
      check("empty: retry is logged WITHOUT MINIMAX_DEBUG", logged.some((l) => /deepseek-v4-pro returned no text — retrying once.*finish_reason=length/.test(l)), logged.join(" / "));
      install(["", "", ""]);
      const p = await panel("reviewer", { system: "s", user: "u" }, { size: 3 });
      check("empty twice: exactly 2 calls, then counted as no answer", calls["deepseek/deepseek-v4-pro"] === 2 && p.results.length === 2 && p.failures.length === 1 && p.failures[0].tries === 2, JSON.stringify({ calls, f: p.failures }));
    } finally {
      globalThis.fetch = realFetch; console.error = realErr;
      for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }

  // (i) FAIL CLOSED: a reply from an UNRELATED request is no answer, never a pass
  /* 2026-09-23: SiliconFlow (serving deepseek/deepseek-v4-pro via OpenRouter)
   * twice returned another request's output. extractJSON found a {…} in each,
   * and a missing `issues` field read as "no issues" — a clean PASS vote. */
  {
    const JUNK_CONFIG = 'server:\n  host: 0.0.0.0\n  port: 8080\nlogging = {"level": "info", "rotate": true}\n# end of file';
    const JUNK_STATUS = '<status>{"state":"completed","progress":100,"job":"a91f"}</status>';
    const FLAG = '{"issues":[{"quote":"run this stove inside the tent","problem":"carbon monoxide","severity":"high"}]}';
    check("shape: config-like junk is not a review", !!reviewReplyError({ level: "info", rotate: true }));
    check("shape: <status> junk is not a review", !!reviewReplyError({ state: "completed", progress: 100, job: "a91f" }));
    check("shape: {issues:[]} is a review", reviewReplyError({ issues: [] }) === null);
    check("shape: bare [] is a review (MiniMax's clean answer)", reviewReplyError([]) === null);
    check("shape: a flag with quote+severity is a review", reviewReplyError(JSON.parse(FLAG)) === null);
    check("shape: issues not an array is not", !!reviewReplyError({ issues: "none" }));
    check("shape: an item without a quote is not", !!reviewReplyError({ issues: [{ problem: "x", severity: "high" }] }));
    check("shape: severity outside high|low is not", !!reviewReplyError({ issues: [{ quote: "q", problem: "x", severity: "critical" }] }));

    const env = { MINIMAX_API_KEY: process.env.MINIMAX_API_KEY, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, MINIMAX_DEBUG: process.env.MINIMAX_DEBUG };
    process.env.MINIMAX_API_KEY = "test"; process.env.OPENROUTER_API_KEY = "test"; delete process.env.MINIMAX_DEBUG;
    const realFetch = globalThis.fetch, realErr = console.error;
    const logged = [], calls = {};
    const reply = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
    // `others` answers for MiniMax and Muse; DeepSeek plays the rogue host.
    const install = (dsReplies, others = '{"issues":[]}') => {
      for (const k of Object.keys(calls)) delete calls[k];
      logged.length = 0;
      globalThis.fetch = async (_url, init) => {
        const b = JSON.parse(init.body);
        calls[b.model] = (calls[b.model] ?? 0) + 1;
        if (b.model === "deepseek/deepseek-v4-pro") {
          const t = dsReplies[Math.min(calls[b.model], dsReplies.length) - 1];
          return reply({ choices: [{ message: { content: t }, finish_reason: "stop" }] });
        }
        if (b.messages?.[0]?.role === "system") return reply({ choices: [{ message: { content: others } }] });
        return reply({ content: [{ type: "text", text: others }] });
      };
      console.error = (...a) => logged.push(a.join(" "));
    };
    try {
      for (const [name, junk] of [["config-like", JUNK_CONFIG], ["<status>", JUNK_STATUS]]) {
        install([junk, junk]);
        let seats = null;
        const r = await reviewContent({ title: "t", body: "b" }, { onSeats: (s) => { seats = s; } });
        const ds = seats?.find((x) => /deepseek/.test(x.seat));
        check(`junk ${name}: retried once, then NO ANSWER (not pass)`, calls["deepseek/deepseek-v4-pro"] === 2 && ds?.verdict === "no-answer" && r?.passes === 2, JSON.stringify({ calls, ds, passes: r?.passes }));
        check(`junk ${name}: logged without MINIMAX_DEBUG`, logged.some((l) => /deepseek-v4-pro returned malformed JSON — retrying once: .*wrong shape/.test(l)), logged.join(" / "));
      }
      // Junk from two seats: the review must not stand on the one real vote.
      install([JUNK_STATUS], JUNK_CONFIG);
      const none = await reviewContent({ title: "t", body: "b" }, {});
      check("junk everywhere: review reports null, never a pass", none === null, JSON.stringify(none));
      install([JUNK_STATUS, '{"issues":[]}']);
      const healed = await reviewContent({ title: "t", body: "b" }, {});
      check("junk then valid: the retry's clean answer counts", healed?.passes === 3 && calls["deepseek/deepseek-v4-pro"] === 2, JSON.stringify({ calls, p: healed?.passes }));
      install([FLAG], FLAG);
      const flagged = await reviewContent({ title: "t", body: "b" }, {});
      check("valid flags still flag (3 of 3, high)", flagged?.passes === 3 && flagged?.blocking.length === 1 && flagged.blocking[0].votes === 3, JSON.stringify(flagged));
      // An injected panel that ignores `validate` is re-checked by reviewContent.
      let seats = null;
      const lax = async () => ({ results: [
        { value: { issues: [] }, provider: "a", model: "1" },
        { value: { level: "info" }, provider: "b", model: "2" },
        { value: { state: "completed" }, provider: "c", model: "3" },
      ], failures: [], independent: true });
      const r = await reviewContent({ title: "t", body: "b" }, { panelFn: lax, onSeats: (s) => { seats = s; } });
      check("lax panelFn: junk values re-checked into no-answer", r === null && seats?.filter((s) => s.verdict === "no-answer").length === 2, JSON.stringify({ r, seats }));
      // audit-products shares the reviewer role with a different schema: no validate, no change.
      install([JUNK_STATUS]);
      const raw = await panel("reviewer", { system: "s", user: "u" }, { size: 3 });
      check("panel without validate: any JSON still accepted (other schemas unaffected)", raw.results.length === 3 && calls["deepseek/deepseek-v4-pro"] === 1, JSON.stringify({ calls, n: raw.results.length }));
    } finally {
      globalThis.fetch = realFetch; console.error = realErr;
      for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }

  // ── 10. GROUNDING: the swap is judged against the replacement's listing ────
  /* Dry run 4 (2026-09-22) swapped B07F2VP353 for the Odoland B0GQZ5D1HR with
   * all nine seats passing, while the rewrite carried the Fire-Maple's
   * "hard-anodized pot, lid", "piezo igniter" and "cannot use over a campfire"
   * onto a product whose listing says none of them. No seat had seen the
   * listing. These are the dry-run-4 drafts, verbatim for the cookware guide. */
  {
    const COOK = "budget-camping-cookware-that-works";
    const STOVES = "budget-portable-camping-stoves-compared";
    const DR4 = {
      "content#23": "When you want a stove and pot as one integrated unit, a canister-top stove system is the move. The Odoland 1L Heat Exchanger combines a small burner base with a hard-anodized pot, lid, and heat exchanger on the bottom. The heat exchanger is the key feature: it grabs more energy from the flame, so water boils faster and you use less fuel.",
      "content#24": `It is a great pick for backpackers who want one less decision at camp. The whole system nests together, the pot holds enough for one or two freeze-dried meals, and the piezo igniter lights it without a separate lighter. Weight is reasonable for the performance. The trade-off is that you cannot use the pot over a campfire and the system is designed for canister fuel. **[Check the Odoland 1L Heat Exchanger Backpacking and Camping Stove on Amazon](${amazonLink(NEW)})**`,
    };
    // The grounded version of the same two paragraphs: every specific is in ODOLAND_FACTS.
    const GROUNDED = {
      "content#23": "When you want a stove and pot as one integrated unit, a canister-top stove system is the move. The Odoland 1L Heat Exchanger pairs a small burner with a 1L pot that has a heat exchanger on the bottom. The heat exchanger is the key feature: it grabs more energy from the flame, so water boils faster and you use less fuel.",
      "content#24": `It is a great pick for backpackers who want one less decision at camp. The whole set nests inside the pot with a small canister, and a second small pot doubles as a frying pan or bowl. Weight is reasonable for the performance. The trade-off is that the system is designed for canister fuel. **[Check the Odoland 1L Heat Exchanger Backpacking and Camping Stove on Amazon](${amazonLink(NEW)})**`,
    };
    const ODO = { asin: NEW, title: ODOLAND_FACTS.title, rating: 4.6, ratingsTotal: 172, facts: ODOLAND_FACTS };
    const writerWith = (over) => { const base = honestWriter(); return async (p) => { const r = await base(p); const segs = r.value.segments; for (const id of Object.keys(segs)) if (JSON.parse(p.user).article.match(/Cookware/i) && over[id]) segs[id] = over[id]; return r; }; };
    const withOdo = (over = {}) => makeDeps({ listingFacts: async () => ODOLAND_FACTS, ...over });

    // (a) pure check on the dry-run-4 drafts
    const hit = locate(SOURCES, DEAD, aliasesFor("Fire-Maple Fixed Star 1 Backpacking and Camping Stove System")).find((h) => h.slug === COOK);
    const segs = hit.segments.filter((x) => DR4[x.id]);
    const found = ungroundedClaims(segs, DR4, ODO).map((u) => u.claim);
    check("grounding/dr4: hard-anodized flagged", found.includes("hard-anodized"), found.join(","));
    check("grounding/dr4: piezo igniter flagged", found.includes("piezo") && found.includes("igniter"), found.join(","));
    check("grounding/dr4: lid and campfire flagged", found.includes("lid") && found.includes("campfire"), found.join(","));
    check("grounding/dr4: 'nests' is SUPPORTED by this listing, so not flagged", !found.includes("nests"), found.join(","));
    check("grounding/supported: the grounded paragraphs raise nothing", ungroundedClaims(segs, GROUNDED, ODO).length === 0, JSON.stringify(ungroundedClaims(segs, GROUNDED, ODO)));
    {
      const got = ungroundedClaims([{ id: "p", kind: "paragraph", index: 1, own: false, text: "" }], { p: "The [Odoland 1L Heat Exchanger](x) combines pot and burner. Compatible with most fuel canisters, it fits standard options. The [Lepro](y) lantern is compatible with AA." }, ODO);
      check("grounding/pronoun: 'Compatible …, it fits' after naming the product is checked; the linked Lepro sentence is not",
        got.map((u) => u.claim).join() === "compatibility,fits most/standard fuel" && got.every((u) => /Compatible with most/.test(u.sentence)), JSON.stringify(got));
    }
    check("grounding/figures: an unlisted boil time is flagged, the listed one is not",
      ungroundedClaims([{ id: "p", kind: "paragraph", index: 1, own: true, text: "" }], { p: "It boils in 90 seconds. It boils 1L in 160s." }, ODO).map((u) => u.claim).join() === 'figure "90 seconds"');

    // (b) end to end: the dr4 cookware draft is REJECTED mechanically, before any seat is spent
    {
      const deps = withOdo({ write: writerWith(DR4) });
      const r = await run(deps);
      const a = r.report.articles[COOK];
      check("grounding/e2e: dr4 cookware draft is not swapped", a?.outcome === "unlinked", JSON.stringify(a).slice(0, 300));
      check("grounding/e2e: the reason names hard-anodized and piezo", /hard-anodized/.test(a?.why ?? "") && /piezo/.test(a?.why ?? ""), a?.why);
      check("grounding/e2e: no reviewer spent on the ungrounded draft", !deps.reviewed.some((x) => /Cookware/i.test(x.title)));
      check("grounding/e2e: the carried-over claim never lands", !r.sources.articles.includes("piezo igniter lights it without a separate lighter. Weight is reasonable for the performance. The trade-off is that you cannot use the pot over a campfire and the system is designed for canister fuel. **[Check the Odoland"));
      check("grounding/e2e: the stoves guide (hard-anodized, carried by the rename) is refused too", r.report.articles[STOVES]?.outcome === "unlinked" && /hard-anodized/.test(r.report.articles[STOVES].why), r.report.articles[STOVES]?.why);
    }
    // (c) end to end: the grounded cookware draft passes and swaps
    {
      const r = await run(withOdo({ write: writerWith(GROUNDED) }));
      check("grounding/e2e: grounded cookware draft is swapped", r.report.articles[COOK]?.outcome === "swapped", JSON.stringify(r.report.articles[COOK]).slice(0, 300));
      check("grounding/e2e: facts persisted with the candidate", r.entry.candidate?.facts?.bullets?.length === 5 && r.entry.candidate.facts.brand === "Odoland");
    }
    // (c2) dry run 5: the CTA's closing ** was dropped — must be refused, not shipped
    {
      const broken = { ...GROUNDED, "content#24": GROUNDED["content#24"].replace(/\*\*$/, "") };
      const r = await run(withOdo({ write: writerWith(broken) }));
      check("cta/bold: CTA missing its closing ** is refused", r.report.articles[COOK]?.outcome === "unlinked" && /unbalanced|call to action/.test(r.report.articles[COOK].why), r.report.articles[COOK]?.why);
    }
    // (d) never swap blind
    {
      const deps = withOdo({ listingFacts: async () => null });
      const r = await run(deps);
      check("blind/null facts: deferred, nothing swapped", r.entry.status === "pending" && !Object.values(r.entry.perArticle).some((p) => p.outcome === "swapped"), JSON.stringify(r.entry.perArticle).slice(0, 200));
      check("blind/null facts: no writer call", deps.write.calls.length === 0);
      check("blind/null facts: attempt not spent, candidate kept for the retry", r.entry.attempts === 0 && r.entry.candidate?.asin === NEW && !r.entry.candidate.facts);
      const q = await run(withOdo({ listingFacts: async () => { throw Object.assign(new Error("402"), { code: "QUOTA" }); } }));
      check("blind/quota: deferred with the reason", q.entry.status === "pending" && /quota/i.test(Object.values(q.entry.perArticle)[0].why));
      const late = await run(withOdo({ listingFacts: async () => null }), { ledger: { [DEAD]: r.entry }, now: new Date(NOW.getTime() + 73 * 3_600_000) });
      check("blind/deadline: still no facts after 72h ends in unlink", late.entry.status === "unlinked", late.entry.status);
      const bare = await run(withOdo({ listingFacts: async () => ({ ...ODOLAND_FACTS, bullets: [] }) }));
      check("blind/no bullets: candidate rejected, attempt counted", bare.entry.attempts === 1 && bare.entry.triedCandidates.includes(NEW) && bare.entry.candidate === null);
      const resumed = await run(withOdo({ write: writerWith(GROUNDED) }), { ledger: { [DEAD]: r.entry } });
      check("blind/resume: facts fetched on the next run, then swap", resumed.entry.perArticle[COOK]?.outcome === "swapped" && resumed.entry.candidate.facts?.bullets?.length === 5);
    }
    // (e) writer and reviewers are both given the listing, and told to hold claims to it
    {
      const wp = rewritePrompt({ articleTitle: "t", deadLabel: "Fire-Maple Fixed Star 1", candidate: ODO, segments: segs });
      const u = JSON.parse(wp.user);
      check("prompt/writer: listing bullets present", u.newProduct.listing?.featureBullets?.length === 5 && /nests completely inside/.test(wp.user));
      check("prompt/writer: grounding rule present", /must be stated in `newProduct.listing`/.test(wp.system) && /specifics do NOT transfer/.test(wp.system));
      const rp = editReviewPrompt({ articleTitle: "t", hit, replacements: Object.fromEntries(hit.segments.map((x) => [x.id, x.text])), candidate: ODO });
      check("prompt/review: listing present", JSON.parse(rp.user).newProduct.listing?.featureBullets?.length === 5);
      check("prompt/review: grounding rule with high severity", /GROUNDING/.test(rp.system) && /listing does not state is an issue with severity \\"high\\"/.test(rp.system.replace(/"/g, '\\"')));
      check("prompt/review: still no price", !/\$\d/.test(rp.user.replace(/"article":[\s\S]*$/, "")));
    }
    // (f) a claim the mechanical table cannot see is still caught by 2 of 3 seats, and a supported one passes
    {
      const LIE = "It is dishwasher safe and comes with a lifetime warranty.";
      const writer = writerWith({ ...GROUNDED, "content#23": GROUNDED["content#23"].replace(/\.$/, `. ${LIE}`) });
      const fake = scripted(({ title, newProduct }) => (/Cookware/i.test(title) && newProduct.listing
        ? [[hi(LIE, "not in the listing")], [hi(LIE, "listing says nothing about dishwasher or warranty")], []]
        : [[], [], []]));
      const r = await run(withPanel(fake, { write: writer, listingFacts: async () => ODOLAND_FACTS }));
      check("grounding/review: unsupported claim flagged by 2 seats → unlinked", r.report.articles[COOK]?.outcome === "unlinked" && /review rejected/.test(r.report.articles[COOK].why), JSON.stringify(r.report.articles[COOK]).slice(0, 300));
      const ok = await run(withPanel(scripted(() => [[], [], []]), { write: writerWith(GROUNDED), listingFacts: async () => ODOLAND_FACTS }));
      check("grounding/review: supported claims, clean seats → swapped", ok.report.articles[COOK]?.outcome === "swapped");
    }

    // ── 11. ONE writer retry, fed the exact refusal reason (2026-09-22) ──────
    /* Dry run 6 unlinked all three Odoland guides on refusals a second draft
     * could fix: a stray blank line, "campfire", and "the C-grip handle folds
     * out" against a listing that says only "Ergonomic C-grip handle". The
     * writer now gets one retry per guide with the refused draft and the
     * quoted reasons; a second failure is the old unlink. */
    const HANDLE = GROUNDED["content#24"].replace("Weight is reasonable for the performance.", "The folding handle makes pouring easy.");
    const LIE2 = "It is dishwasher safe and comes with a lifetime warranty.";
    const isCook = (p) => /Cookware/i.test(JSON.parse(p.user).article);
    /* A scripted cookware writer: `first` on the first call, `second` on the
     * retry (the call whose user carries refusedBecause). Other guides get the
     * honest rename. Every cookware prompt is kept for inspection. */
    const retryWriter = (first, second) => {
      const base = honestWriter();
      const fn = async (p) => {
        const r = await base(p);
        if (!isCook(p)) return r;
        const u = JSON.parse(p.user);
        fn.cook.push({ retry: !!u.refusedBecause, system: p.system, user: u });
        const over = u.refusedBecause ? second : first;
        for (const id of Object.keys(r.value.segments)) if (over[id]) r.value.segments[id] = over[id];
        return r;
      };
      fn.cook = [];
      return fn;
    };
    const cookReviews = (deps) => deps.reviewed.filter((x) => /Cookware/i.test(x.title)).length;

    // (a) mechanical refusal → retry carries the reason → fixed draft swaps
    {
      const w = retryWriter({ ...GROUNDED, "content#24": HANDLE }, GROUNDED);
      const deps = withOdo({ write: w });
      const r = await run(deps);
      const a = r.report.articles[COOK];
      check("retry/mech: cookware writer called exactly twice", w.cook.length === 2 && !w.cook[0].retry && w.cook[1].retry, JSON.stringify(w.cook.map((c) => c.retry)));
      const rp = w.cook[1];
      check("retry/mech: prompt quotes the refusal reason", rp?.user.refusedBecause?.some((x) => /"folding handle" not in the listing/.test(x) && /folding handle makes pouring easy/.test(x)), JSON.stringify(rp?.user.refusedBecause));
      check("retry/mech: prompt carries the refused draft", rp?.user.previousDraft?.["content#24"] === HANDLE);
      check("retry/mech: prompt carries the listing facts", rp?.user.newProduct?.listing?.featureBullets?.some((b) => /C-grip handle/.test(b)));
      check("retry/mech: prompt states the rule that was broken", /SECOND AND LAST ATTEMPT/.test(rp?.system ?? "") && /not in the listing\\?" must be deleted/.test(rp?.system ?? ""), rp?.system.slice(-600));
      check("retry/mech: fixed draft is swapped", a?.outcome === "swapped", JSON.stringify(a).slice(0, 300));
      check("retry/mech: ledger records both attempts", r.entry.perArticle[COOK]?.retry?.length === 2 && r.entry.perArticle[COOK].retry[0].stage === "mechanical" && r.entry.perArticle[COOK].retry[1].stage === "pass", JSON.stringify(r.entry.perArticle[COOK]?.retry));
      check("retry/mech: the refused claim never lands", !r.sources.articles.includes("The folding handle makes pouring easy."));
      check("retry/mech: panel asked once, about the fixed draft only", cookReviews(deps) === 1 && !deps.reviewed.some((x) => /folding handle/.test(x.body)));
      check("retry/mech: the retry is counted in the budget", r.report.calls.retry >= 1 && r.report.calls.writer === 3 + r.report.calls.retry, JSON.stringify(r.report.calls));
    }

    // (b) the retry repeats the problem → unlink, never a third draft, no panel
    {
      const w = retryWriter({ ...GROUNDED, "content#24": HANDLE }, { ...GROUNDED, "content#24": HANDLE });
      const deps = withOdo({ write: w });
      const r = await run(deps);
      const a = r.report.articles[COOK];
      check("retry/repeat: unlinked", a?.outcome === "unlinked" && /mechanical check: .*folding handle/.test(a.why), a?.why);
      check("retry/repeat: why names both attempts", /after one writer retry; first draft refused \(mechanical\)/.test(a?.why ?? ""), a?.why);
      check("retry/repeat: never retries twice", w.cook.length === 2, String(w.cook.length));
      check("retry/repeat: panel never called for the retried draft that fails mechanically", cookReviews(deps) === 0, String(cookReviews(deps)));
      check("retry/repeat: receipt records both attempts", a?.retry?.length === 2 && a.retry.every((t) => t.stage === "mechanical"), JSON.stringify(a?.retry));
    }

    // (c) panel rejection, edit-scoped and quoted → retry with the finding → clean second panel swaps
    {
      const w = retryWriter({ ...GROUNDED, "content#23": GROUNDED["content#23"].replace(/\.$/, `. ${LIE2}`) }, GROUNDED);
      const fake = scripted(({ title, article }) => (/Cookware/i.test(title) && article.includes(LIE2)
        ? [[hi(LIE2, "not in the listing")], [hi(LIE2, "listing says nothing about dishwasher or warranty")], []]
        : [[], [], []]));
      const deps = withPanel(fake, { write: w, listingFacts: async () => ODOLAND_FACTS });
      const r = await run(deps);
      const a = r.report.articles[COOK];
      check("retry/review: finding quoted in the retry prompt", w.cook[1]?.user.refusedBecause?.some((x) => /^review: /.test(x) && x.includes(LIE2) && /not in the listing|dishwasher/.test(x)), JSON.stringify(w.cook[1]?.user.refusedBecause));
      check("retry/review: fixed draft swapped", a?.outcome === "swapped", JSON.stringify(a).slice(0, 300));
      check("retry/review: ledger records review → pass", a?.retry?.[0]?.stage === "review" && a.retry[1].stage === "pass", JSON.stringify(a?.retry));
      check("retry/review: panel ran exactly twice for the guide", fake.prompts.filter((p) => /Cookware/i.test(JSON.parse(p.user).title)).length === 2, String(fake.prompts.filter((p) => /Cookware/i.test(JSON.parse(p.user).title)).length));
      check("retry/review: budget counts both panel runs", r.report.calls.review >= 6, JSON.stringify(r.report.calls));
    }

    // (d) panel rejects the retry too → unlink, two drafts only
    {
      const bad = { ...GROUNDED, "content#23": GROUNDED["content#23"].replace(/\.$/, `. ${LIE2}`) };
      const w = retryWriter(bad, bad);
      const fake = scripted(({ title, article }) => (/Cookware/i.test(title) && article.includes(LIE2)
        ? [[hi(LIE2, "not in the listing")], [hi(LIE2, "not in the listing")], []]
        : [[], [], []]));
      const r = await run(withPanel(fake, { write: w, listingFacts: async () => ODOLAND_FACTS }));
      const a = r.report.articles[COOK];
      check("retry/review-repeat: unlinked", a?.outcome === "unlinked" && /review rejected/.test(a.why) && /after one writer retry/.test(a.why), a?.why);
      check("retry/review-repeat: two drafts, never three", w.cook.length === 2);
      check("retry/review-repeat: the claim never lands", !r.sources.articles.includes(LIE2));
    }

    // (e) a retry that answers "not the same kind" or never answers is the second failure
    {
      const w = retryWriter({ ...GROUNDED, "content#24": HANDLE }, GROUNDED);
      const flaky = async (p) => (JSON.parse(p.user).refusedBecause && isCook(p) ? null : w(p));
      const r = await run(withOdo({ write: flaky }));
      check("retry/unreachable: unlinked, reason says so", r.report.articles[COOK]?.outcome === "unlinked" && /retry writer unreachable/.test(r.report.articles[COOK].why), r.report.articles[COOK]?.why);
    }

    // ── 12. SPAN-WIDE grounding: dry run 7's unattributed fit claim ──────────
    /* Dry run 7 swapped the dispersed guide with "Compatible with most fuel
     * canisters, it fits standard backpacking fuel options." — one sentence
     * away from the Odoland's name, so the adjacency filter never read it; one
     * seat of three flagged it. The listing says only "fits 230g gas canister".
     * These are the dry-run-7 drafts, verbatim but for the test ASIN. */
    {
      const DISP = "dispersed-camping-beginners-guide";
      const FIT = "Compatible with most fuel canisters, it fits standard backpacking fuel options.";
      const DR7 = {
        "content#21": `A reliable stove is the heart of your kitchen. The [Odoland 1L Heat Exchanger Backpacking and Camping Stove System](${amazonLink(NEW)}) combines pot and burner into one unit, eliminating the need to carry separate components. The dual pot and pot stand support varied outdoor cooking, from boiling water to heating sauces, and the heat exchanger base improves fuel efficiency for cooking real meals rather than just rehydrating packets. ${FIT}`,
        "content#28": `Dispersed camping rewards preparation. For lighting, the [Lepro LED Camping Lantern](https://www.amazon.com/dp/B083TXB5QY?tag=camprally-20) four-pack provides the best combination of versatility and quantity for a beginner setting up their first off-grid camp. The [National Forest Camping](https://www.amazon.com/dp/1885464851?tag=camprally-20) directory is the single most valuable planning resource, turning hours of online research into a compact reference guide. The [Odoland 1L Heat Exchanger Backpacking and Camping Stove](${amazonLink(NEW)}) replaces multiple pieces of cooking gear with one reliable system that performs consistently in variable conditions.`,
      };
      const FIXED = { ...DR7, "content#21": DR7["content#21"].replace(FIT, "The whole set nests inside the pot along with a 230g gas canister.") };
      const dhit = locate(SOURCES, DEAD, aliasesFor("Fire-Maple Fixed Star 1 Backpacking and Camping Stove System")).find((h) => h.slug === DISP);
      const dsegs = dhit.segments.filter((x) => DR7[x.id]);
      check("span/setup: both dr7 segments located, not own-section", dsegs.length === 2 && dsegs.every((x) => !x.own), dsegs.map((x) => `${x.id}:${x.own}`).join());

      // (a) pure: the far sentence is read and refused, quoted
      const u = ungroundedClaims(dsegs, DR7, ODO);
      check("span/dr7: the fit sentence is flagged", u.some((x) => x.claim === "fits most/standard fuel") && u.some((x) => x.claim === "compatibility"), JSON.stringify(u));
      check("span/dr7: every finding quotes that sentence, nothing else flagged", u.length && u.every((x) => x.segment === "content#21" && x.sentence === FIT), JSON.stringify(u));
      check("span/dr7: the corrected draft raises nothing", ungroundedClaims(dsegs, FIXED, ODO).length === 0, JSON.stringify(ungroundedClaims(dsegs, FIXED, ODO)));
      const reasons = checkRewrite(dsegs, DR7, { aliases: aliasesFor("Fire-Maple Fixed Star 1 Backpacking and Camping Stove System"), dead: DEAD, replacement: NEW, label: "Odoland", blocks: dhit.blocks, candidate: ODO }).problems;
      check("span/dr7: refusal reason quotes the sentence for the retry", reasons.some((x) => x.includes(`— "${FIT}"`) && /not in the listing/.test(x)), JSON.stringify(reasons));

      // (b) over-refusal guard: a generic category sentence in the edited span passes
      const GENERIC = { ...FIXED, "content#21": FIXED["content#21"].replace("A reliable stove is the heart of your kitchen.", "Integrated canister systems bundle a burner, pot, and heat exchanger.") };
      check("span/generic: category sentence ('canister systems bundle a burner, pot, and heat exchanger') passes", ungroundedClaims(dsegs, GENERIC, ODO).length === 0, JSON.stringify(ungroundedClaims(dsegs, GENERIC, ODO)));
      check("span/generic: a supported specific fit ('fits a 230g gas canister') passes",
        ungroundedClaims(dsegs, { ...FIXED, "content#21": FIXED["content#21"].replace("The whole set nests inside the pot along with a 230g gas canister.", "The set fits a 230g gas canister inside the pot.") }, ODO).length === 0);
      check("span/other-product: an unlinked brand sentence about another product is not read",
        ungroundedClaims([{ id: "p", kind: "paragraph", index: 1, own: false, text: "The [Lepro LED Lantern](y) and a stove.", before: "", after: "" }], { p: "The [Odoland 1L Heat Exchanger](x) boils fast. Lepro lanterns work with all standard AA batteries." }, ODO).length === 0);

      // (c) end to end: dr7 draft refused mechanically → retry quotes it → fixed draft swaps
      const isDisp = (p) => /Dispersed/i.test(JSON.parse(p.user).article);
      const base = honestWriter();
      const calls = [];
      const w = async (p) => {
        const r = await base(p);
        if (!isDisp(p)) return r;
        const usr = JSON.parse(p.user);
        calls.push(usr);
        const over = usr.refusedBecause ? FIXED : DR7;
        for (const id of Object.keys(r.value.segments)) if (over[id]) r.value.segments[id] = over[id];
        return r;
      };
      const deps = withOdo({ write: w });
      const r = await run(deps);
      const a = r.report.articles[DISP];
      check("span/e2e: dispersed writer called twice (draft + one retry)", calls.length === 2 && !calls[0].refusedBecause && !!calls[1].refusedBecause, String(calls.length));
      check("span/e2e: retry prompt quotes the fit sentence", calls[1]?.refusedBecause?.some((x) => x.includes(FIT)), JSON.stringify(calls[1]?.refusedBecause));
      check("span/e2e: corrected draft is swapped", a?.outcome === "swapped", JSON.stringify(a).slice(0, 300));
      check("span/e2e: the fit claim never lands", !readArticle(r.sources.articles, DISP).content.includes(FIT));
      check("span/e2e: panel never saw the refused draft", !deps.reviewed.some((x) => x.body?.includes?.(FIT)));

      // ── 13. ALL mechanical failures in one pass (dry run 8) ────────────────
      /* Dry run 8: the first dispersed draft was refused for length only, the
       * retry for a paragraph break only — both had appended a CTA paragraph —
       * and the ungrounded fit sentence was never reported to either. */
      const CTA = `**[Check the Odoland 1L Heat Exchanger Backpacking and Camping Stove on Amazon](${amazonLink(NEW)})**`;
      const BOTH = { ...DR7, "content#21": `${DR7["content#21"]}\n\n${CTA}` };
      const dopts = { aliases: aliasesFor("Fire-Maple Fixed Star 1 Backpacking and Camping Stove System"), dead: DEAD, replacement: NEW, label: "Odoland", blocks: dhit.blocks, candidate: ODO };
      const all = checkRewrite(dsegs, BOTH, dopts).problems;
      check("all/pure: formatting reason (paragraph break) reported", all.some((x) => /paragraph break/.test(x) && x.includes("Check the Odoland")), JSON.stringify(all));
      check("all/pure: added CTA reported, quoted", all.some((x) => /added a call to action/.test(x) && x.includes("Check the Odoland")), JSON.stringify(all));
      check("all/pure: grounding reason reported in the SAME pass, quoted", all.some((x) => /not in the listing/.test(x) && x.includes(FIT)), JSON.stringify(all));
      const LONG = { ...DR7, "content#21": `${DR7["content#21"]} ${DR7["content#21"]}` };
      const lp = checkRewrite(dsegs, LONG, dopts).problems;
      check("all/pure: length and grounding together, length quotes its text", lp.some((x) => /length \d+% of original .*allowed \d+-\d+.* — "A reliable stove/.test(x)) && lp.some((x) => x.includes(`— "${FIT}"`)), JSON.stringify(lp));

      const calls13 = [];
      const w13 = async (p) => {
        const r = await base(p);
        if (!isDisp(p)) return r;
        const usr = JSON.parse(p.user);
        calls13.push({ system: p.system, user: usr });
        const over = usr.refusedBecause ? FIXED : BOTH;
        for (const id of Object.keys(r.value.segments)) if (over[id]) r.value.segments[id] = over[id];
        return r;
      };
      const deps13 = withOdo({ write: w13 });
      const r13 = await run(deps13);
      const rb = calls13[1]?.user.refusedBecause ?? [];
      check("all/e2e: retry prompt lists the formatting reason with its quote", rb.some((x) => /paragraph break/.test(x) && x.includes("Check the Odoland")), JSON.stringify(rb));
      check("all/e2e: retry prompt lists the grounding reason with its quote", rb.some((x) => /not in the listing/.test(x) && x.includes(FIT)), JSON.stringify(rb));
      check("all/e2e: retry prompt names the CTA rule", /Remove the call to action you added/.test(calls13[1]?.system ?? ""));
      check("all/e2e: corrected draft swapped after one retry", calls13.length === 2 && r13.report.articles[DISP]?.outcome === "swapped", JSON.stringify(r13.report.articles[DISP]).slice(0, 300));
      check("all/e2e: panel never saw the refused draft", !deps13.reviewed.some((x) => x.body?.includes?.(FIT) || x.body?.includes?.(CTA)));

      // the writer prompt states the structural contract, first attempt and retry alike
      const sys0 = calls13[0]?.system ?? "";
      check("contract: prompt states paragraph count, length range, no added CTA, listing-only",
        /same number of paragraphs/.test(sys0) && /allowedChars/.test(sys0) && /60-140%/.test(sys0) && /Never add a call to action/.test(sys0) && /Only claims `newProduct.listing` supports/.test(sys0), sys0.slice(-900));
      check("contract: retry prompt carries the same contract", /same number of paragraphs/.test(calls13[1]?.system ?? "") && /Never add a call to action/.test(calls13[1]?.system ?? ""));
      const c21 = calls13[0]?.user.segments.find((x) => x.id === "content#21");
      check("contract: each paragraph carries its allowedChars range", Array.isArray(c21?.allowedChars) && c21.allowedChars[0] < c21.text.length && c21.allowedChars[1] > c21.text.length, JSON.stringify(c21?.allowedChars));
    }
  }
  // (f) sabotage positive control for the retry itself, and hazards are NOT retried
  {
    const w = honestWriter({ sabotage: (s, t) => (s.kind === "paragraph" && /^An integrated canister system/.test(s.text)
      ? "An integrated canister system with its own pot. On a cold night you can run this stove inside the tent for warmth while you cook, which makes a backpacking kitchen feel complete."
      : t) });
    const r = await run(makeDeps({ write: w }));
    check("retry/hazard: a hazard is not retried", w.calls.filter((t) => /Stoves/i.test(t)).length === 1, JSON.stringify(w.calls));
    check("retry/hazard: still unlinked", r.report.articles["budget-portable-camping-stoves-compared"]?.outcome === "unlinked");
    // A hazard that arrives WITH a fixable formatting failure is still not retried.
    const w2 = honestWriter({ sabotage: (s, t) => (s.kind === "paragraph" && /^An integrated canister system/.test(s.text)
      ? "An integrated canister system with its own pot.\n\nOn a cold night you can run this stove inside the tent for warmth while you cook, which makes a backpacking kitchen feel complete."
      : t) });
    const rh = await run(makeDeps({ write: w2 }));
    const sh = rh.report.articles["budget-portable-camping-stoves-compared"];
    check("retry/hazard+format: not retried", w2.calls.filter((t) => /Stoves/i.test(t)).length === 1, JSON.stringify(w2.calls));
    check("retry/hazard+format: unlinked as a hazard", sh?.outcome === "unlinked" && /hazard/.test(sh.why) && !sh.retry, JSON.stringify(sh).slice(0, 300));
    // The paragraph-break refusal names its segment, so the retry can act on it.
    const pb = honestWriter({ sabotage: (s, t) => (/^A reliable stove is the heart/.test(s.text) ? t.replace(". ", ".\n\n") : t) });
    const r2 = await run(makeDeps({ write: pb }));
    check("retry/paragraph-break: reason names the segment", /paragraph break \(content#\d+ contains a blank line/.test(r2.report.articles["dispersed-camping-beginners-guide"]?.why ?? ""), r2.report.articles["dispersed-camping-beginners-guide"]?.why);
  }
}

console.log(`${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
