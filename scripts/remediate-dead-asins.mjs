#!/usr/bin/env node
/**
 * Fix a dead affiliate product in the published guides: swap it for a
 * reviewed replacement, or unlink it. ADR-0001.
 *
 *   node scripts/remediate-dead-asins.mjs                  # oldest dead ASIN, edits + builds
 *   node scripts/remediate-dead-asins.mjs --dry-run        # decide and report, write nothing
 *   node scripts/remediate-dead-asins.mjs --dry-run --out <dir> --asin B07F2VP353
 *
 * Handles AT MOST ONE dead ASIN per run, and that run ends it in one of
 * swapped, unlinked, mixed, or pending-with-a-deadline. The decision logic
 * lives in lib/dead-link-remediation.mjs; this file owns the disk, the build,
 * and the rollback.
 *
 * Does NOT commit. run-cycle owns git, for the same reason publish-article
 * leaves it alone: a failed build must never leave a half-fixed commit behind.
 *
 * The last stdout line is always `RESULT {json}` — run-cycle parses it for the
 * files to commit and the receipt's deadLinks[].
 *
 * Exit codes:
 *   0  ran — whatever it decided, including "pending"
 *   1  the unlink itself failed to build (everything restored). The ONLY
 *      dead-link failure that still blocks the cycle.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { verifyAsin, EXIT } from "./lib/amazon.mjs";
import { loadCache, saveCache, record, get } from "./lib/asin-cache.mjs";
import { referencedAsins } from "./lib/referenced-asins.mjs";
import { discover, priceCeiling, fetchListingFacts } from "./lib/discover.mjs";
import { callRole } from "./lib/llm.mjs";
import { hazardFlags, reviewContent } from "./lib/content-review.mjs";
import { remediate, oldestDead } from "./lib/dead-link-remediation.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const LEDGER = `${ROOT}state/dead-link-remediation.json`;
const DISCOVERY_CACHE = `${ROOT}state/discovery-cache.json`;
const FILES = {
  articles: "src/data/articles.ts",
  sections: "src/data/article-sections.ts",
  heroAlt: "src/data/hero-alt.json",
};
/* Rebuilt from the hand-authored files, never edited — but they change when
 * the build runs, so a rollback has to put them back too. */
const GENERATED = ["src/data/catalog.json", "src/data/product-images.json", "public/search-index.json"];

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const argOf = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const OUT = argOf("--out");
const ONLY = argOf("--asin");

const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { cwd: ROOT, encoding: "utf8", stdio: "pipe", ...opts }).trim();
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

function emit(result) {
  console.log(`RESULT ${JSON.stringify(result)}`);
  process.exit(result.exit ?? EXIT.OK);
}

function loadSources() {
  const specs = {};
  // Top level only: specs/quarantine holds REJECTED drafts, which the site
  // does not serve and refresh-asins does not scan.
  for (const f of readdirSync(`${ROOT}specs`)) {
    if (f.endsWith(".json")) specs[f.slice(0, -5)] = read(`specs/${f}`);
  }
  return { articles: read(FILES.articles), sections: read(FILES.sections), heroAlt: read(FILES.heroAlt), specs };
}

/** Relative paths whose text differs between two source sets, with new text. */
function changedFiles(before, after) {
  const out = {};
  for (const k of Object.keys(FILES)) if (before[k] !== after[k]) out[FILES[k]] = after[k];
  for (const [slug, t] of Object.entries(after.specs)) if (before.specs[slug] !== t) out[`specs/${slug}.json`] = t;
  return out;
}

function loadLedger() {
  if (!existsSync(LEDGER)) return {};
  try { return JSON.parse(readFileSync(LEDGER, "utf8")); } catch { return {}; }
}
function saveLedger(ledger) {
  mkdirSync(dirname(LEDGER), { recursive: true });
  writeFileSync(`${LEDGER}.tmp`, JSON.stringify(ledger, null, 2) + "\n");
  renameSync(`${LEDGER}.tmp`, LEDGER);
}

/**
 * The last price the site knew for an ASIN.
 *
 * asin-cache keeps no price, and by the time a product is DEAD the catalog
 * rebuild has already dropped it — so the only anchor is git history. The
 * pickaxe finds the commit that removed it; its parent holds the last record.
 * For B07F2VP353 that is 21eb5e8^ at $49.95, not the ~$60-70 the brief guessed.
 */
function anchorPrice(asin) {
  const fromCatalog = (text) => {
    try { return JSON.parse(text)?.products?.[asin]?.priceValue ?? null; } catch { return null; }
  };
  const now = fromCatalog(read("src/data/catalog.json"));
  if (typeof now === "number") return { price: now, source: "src/data/catalog.json (current)" };
  let shas = [];
  try { shas = sh("git", ["log", `-S${asin}`, "--format=%h", "-n", "6", "--", "src/data/catalog.json"]).split("\n").filter(Boolean); } catch { /* no git */ }
  for (const sha of shas) {
    for (const rev of [sha, `${sha}^`]) {
      try {
        const p = fromCatalog(sh("git", ["show", `${rev}:src/data/catalog.json`], { maxBuffer: 64 * 1024 * 1024 }));
        if (typeof p === "number") return { price: p, source: `git ${rev}:src/data/catalog.json` };
      } catch { /* rev without the file */ }
    }
  }
  return null;
}

/** Days since a Canopy search was cached; Infinity when never, or undated. */
function searchAgeDays(term, min, max) {
  try {
    const c = JSON.parse(readFileSync(DISCOVERY_CACHE, "utf8"))[`${term}|${min ?? ""}|${max ?? ""}`];
    if (!c?.fetchedAt) return Infinity;
    return (Date.now() - Date.parse(c.fetchedAt)) / 86_400_000;
  } catch { return Infinity; }
}

/* The site's dates are Eastern — the cron and Sean both are — so an evening
 * run must not stamp tomorrow's UTC date on `updated`. */
const today = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

// ── pick the dead ASIN ──────────────────────────────────────────────────────
const cache = loadCache();
const ledger = loadLedger();
const referenced = referencedAsins(ROOT);
const dead = ONLY ? [ONLY] : [...referenced].filter((a) => get(cache, a)?.verdict === "DEAD");

const summaries = (l) => Object.entries(l)
  .filter(([a, e]) => e.status === "pending" || dead.includes(a))
  .map(([a, e]) => ({
    asin: a, status: e.status, attempts: e.attempts, deadline: e.deadline,
    replacement: e.candidate?.asin ?? Object.values(e.perArticle).find((p) => p.replacement)?.replacement ?? null,
  }));

if (!dead.length) emit({ event: "none", changed: [], deadLinks: summaries(ledger) });

const asin = oldestDead(dead, ledger, cache);
const now = new Date();
const sources = loadSources();

const deps = {
  anchorPrice,
  discover,
  searchAgeDays,
  verifyAsin: (a) => verifyAsin(a),
  listingFacts: (a, o) => fetchListingFacts(a, o),
  write: (prompt) => callRole("writer", { ...prompt, maxTokens: 8000 }),
  hazardFlags,
  reviewContent,
  deadInCache: (a) => get(cache, a)?.verdict === "DEAD",
  cachedTitle: (a) => get(cache, a)?.title ?? "",
  priceCeiling,
  today,
};

/* The one writer retry per guide (ADR-0001), as "<first stage> → <final stage>"
 * per slug — rides into the receipt and the Telegram tally. */
const retriesOf = (report) => Object.fromEntries(Object.entries(report.articles)
  .filter(([, a]) => a.retry?.length)
  .map(([s, a]) => [s, { first: a.retry[0].stage, final: a.retry.at(-1).stage, firstReasons: a.retry[0].reasons.slice(0, 3), finalReasons: a.retry.at(-1).reasons.slice(0, 3) }]));

console.log(`remediating ${asin}${DRY ? " (dry run)" : ""}`);
let run = await remediate({ asin, sources, ledger, now, deps });
let changed = changedFiles(sources, run.sources);

// ── dry run: show everything, write nothing live ────────────────────────────
if (DRY) {
  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    for (const [rel, text] of Object.entries(changed)) {
      for (const side of ["a", "b"]) mkdirSync(dirname(join(OUT, side, rel)), { recursive: true });
      writeFileSync(join(OUT, "a", rel), existsSync(join(ROOT, rel)) ? read(rel) : "");
      writeFileSync(join(OUT, "b", rel), text);
    }
    let diff = "";
    try { sh("git", ["diff", "--no-index", "--no-color", "a", "b"], { cwd: OUT }); }
    catch (err) { diff = err.stdout ?? ""; } // exits 1 when the trees differ
    writeFileSync(join(OUT, "proposed.diff"), diff);
    writeFileSync(join(OUT, "report.json"), JSON.stringify({ report: run.report, entry: run.entry, cacheRecords: run.cacheRecords }, null, 2) + "\n");
    console.log(`dry run artefacts: ${OUT}/proposed.diff, ${OUT}/report.json`);
  }
  console.log(JSON.stringify(run.report, null, 2));
  emit({ event: "dry-run", asin, status: run.entry.status, retries: retriesOf(run.report),
    reviews: Object.fromEntries(Object.entries(run.report.articles).filter(([, a]) => a.review).map(([s, a]) => [s, a.review.seats.map((x) => `${x.seat.split("/").pop()}: ${x.verdict}`)])), changed: Object.keys(changed), deadLinks: summaries({ ...ledger, [asin]: run.entry }) });
}

// ── write, verify, roll back on failure ─────────────────────────────────────
const TRANSIENT = /Failed to fetch .* from Google Fonts|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i;

function applyAndBuild(files) {
  const touched = [...Object.keys(files), ...GENERATED];
  const snapshot = Object.fromEntries(touched.map((rel) => [rel, existsSync(join(ROOT, rel)) ? read(rel) : null]));
  const restore = () => { for (const [rel, t] of Object.entries(snapshot)) if (t !== null) writeFileSync(join(ROOT, rel), t); };
  for (const [rel, t] of Object.entries(files)) writeFileSync(join(ROOT, rel), t);
  try {
    sh("node", ["scripts/check-internal-links.mjs"]);
    sh("node", ["scripts/check-price-claims.mjs"]);
    // A photo for the new product. Never fatal — an icon tile is cosmetic.
    try { sh("node", ["scripts/backfill-product-images.mjs"]); } catch { console.log("(photo backfill incomplete — icon tile until the next cycle)"); }
    sh("node", ["scripts/build-catalog.mjs"]); // drops the dead ASIN from catalog.json
    const build = () => { try { sh("npm", ["run", "build"]); return null; } catch (e) { return `${e.stdout ?? ""}${e.stderr ?? ""}`; } };
    let fail = build();
    if (fail && TRANSIENT.test(fail)) fail = build();
    if (fail) throw Object.assign(new Error("build failed"), { stdout: fail });
    return { ok: true };
  } catch (err) {
    restore();
    return { ok: false, why: `${err.message}\n${(err.stdout ?? err.stderr ?? "").slice(-1200)}` };
  }
}

if (Object.keys(changed).length) {
  const res = applyAndBuild(changed);
  if (!res.ok) {
    console.log(`ROLLED BACK — ${res.why}`);
    const hadSwap = Object.values(run.report.articles).some((a) => a.outcome === "swapped");
    if (!hadSwap) {
      emit({ event: "unlink-build-failed", asin, changed: [], exit: EXIT.FAIL, why: res.why.slice(0, 600), deadLinks: summaries(ledger) });
    }
    // A swap that does not build falls back to the deterministic unlink, in
    // the same run, from the ORIGINAL sources and ledger.
    run = await remediate({ asin, sources, ledger, now, deps, forceUnlink: "the swapped version failed to build" });
    changed = changedFiles(sources, run.sources);
    const res2 = applyAndBuild(changed);
    if (!res2.ok) {
      console.log(`ROLLED BACK — ${res2.why}`);
      emit({ event: "unlink-build-failed", asin, changed: [], exit: EXIT.FAIL, why: res2.why.slice(0, 600), deadLinks: summaries(ledger) });
    }
  }
}

for (const { asin: a, result } of run.cacheRecords) record(cache, a, result, now.toISOString());
if (run.cacheRecords.length) saveCache(cache);
const nextLedger = { ...ledger, [asin]: run.entry };
saveLedger(nextLedger);

const arts = Object.entries(run.report.articles);
const bySlug = (o) => arts.filter(([, a]) => a.outcome === o).map(([s]) => s);
const swapped = bySlug("swapped"), unlinked = bySlug("unlinked");
const reasons = arts.filter(([, a]) => a.outcome === "unlinked").map(([s, a]) => `${s}: ${a.why}`);
/* Per-guide panel record, carried into the cycle receipt (deadLinkEvent) so
 * the Telegram note and any later audit can say which seat decided what. */
const reviews = Object.fromEntries(arts.filter(([, a]) => a.review).map(([s, a]) => [s, a.review.seats.map((x) => ({
  seat: x.seat, verdict: x.verdict, severity: x.severity,
  top: x.findings[0] ? `${x.findings[0].quote.slice(0, 80)} — ${x.findings[0].problem.slice(0, 120)}` : (x.error ?? null),
}))]));
emit({
  event: swapped.length && unlinked.length ? "mixed" : swapped.length ? "swapped" : unlinked.length ? "unlinked" : "pending",
  asin,
  label: run.entry.label,
  replacement: swapped.length ? run.entry.candidate?.asin : null,
  replacementLabel: swapped.length ? run.entry.candidate?.title?.split(",")[0].slice(0, 70) : null,
  swapped, unlinked,
  why: reasons.join(" | ").slice(0, 600) || null,
  reviews,
  retries: retriesOf(run.report),
  status: run.entry.status,
  changed: Object.keys(changed),
  deadLinks: summaries(nextLedger),
});
