#!/usr/bin/env node
/**
 * Controls for scripts/lib/indexnow-edits.mjs — announcing hand edits.
 *
 *   node scripts/test-indexnow-edits.mjs
 *
 * Zero network: the origin (fetch) and the IndexNow endpoint (submit) are both
 * injected, and every ledger lives in a throwaway temp dir. The parser runs
 * against the REAL articles.ts, read from git at a PINNED commit — 1936647,
 * the second SEO rewrite of 2026-09-24 — so its count cannot drift as the rail
 * keeps publishing. Override with INE_FIXTURE_REF only to re-pin deliberately.
 *
 * The cases that matter most are the ones where a quiet answer would be wrong:
 * a first run must send NOTHING, a corrupt ledger must not read as "nothing
 * changed" forever, and a URL that is not live yet must come back next cycle
 * rather than being dropped.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  articleVersions, readLedger, changedSlugs, announceEdits, recordAnnounced, MAX_PER_CYCLE, CHECK_TIMEOUT_MS,
} from "./lib/indexnow-edits.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const FIXTURE_REF = process.env.INE_FIXTURE_REF ?? "1936647d9a724404d5b66e26d208504ad1958842";
const REAL = execFileSync("git", ["-C", ROOT, "show", `${FIXTURE_REF}:src/data/articles.ts`], { maxBuffer: 64 * 1024 * 1024 }).toString();
const ORIGIN = "https://www.camprally.co";
const NOW = new Date("2026-09-24T18:00:00Z");
const TMP = mkdtempSync(join(tmpdir(), "indexnow-edits-"));
/* d156249 (five) + 1936647 (four). */
const REWRITES_0924 = [
  "best-portable-camping-fans", "how-to-camp-in-rain", "best-budget-trekking-poles",
  "budget-camping-cookware-that-works", "best-budget-sleeping-bags-cold-weather",
  "best-camping-coolers-under-100", "best-camping-lanterns-under-30",
  "best-camping-hammocks-under-50", "best-4-season-tents-under-300",
];

let failures = 0;
let n = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/** A synthetic articles.ts in the real file's shape (4-space fields, body at column 0). */
function articlesSrc(list) {
  return "export const articles: Article[] = [\n" + list.map(({ slug, date, updated, body = "" }) =>
    `  {\n    id: "art-${slug}",\n    slug: "${slug}",\n    title: "T",\n    date: "${date}",\n` +
    `${updated ? `    updated: "${updated}",\n` : ""}    content: \`\n${body}\n\`\n  },\n`).join("") + "];\n";
}

/** Origin stub. `pages` maps slug -> { status, dateModified } ; default 200 + matching version. */
function origin(pages = {}, versions = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const slug = url.split("/blog/")[1];
    const p = pages[slug] ?? { status: 200, dateModified: versions[slug] };
    if (p.throws) throw new Error("ECONNRESET");
    return {
      status: p.status,
      text: async () => (p.dateModified ? `<script>{"dateModified":"${p.dateModified}"}</script>` : "<html></html>"),
    };
  };
  return { fetchImpl, calls };
}

/** IndexNow stub. */
function endpoint(result = { ok: true, status: 200 }) {
  const calls = [];
  const submit = async (urls, opts) => {
    calls.push({ urls, host: opts?.host });
    if (result === "throw") throw new Error("boom");
    return { ...result, submitted: urls.length };
  };
  return { submit, calls };
}

const ledgerAt = () => join(TMP, `ledger-${++n}.json`);
const announcedIn = (p) => JSON.parse(readFileSync(p, "utf8")).announced;
const run = (src, ledgerPath, o, e, extra = {}) =>
  announceEdits({ src, ledgerPath, origin: ORIGIN, now: NOW, fetchImpl: o.fetchImpl, submit: e.submit, ...extra });

const BASE = [
  { slug: "alpha", date: "2026-04-01" },
  { slug: "bravo", date: "2026-05-01", updated: "2026-09-02" },
  { slug: "charlie", date: "2026-06-01" },
];
const bumped = (slug, updated, list = BASE) => list.map((a) => (a.slug === slug ? { ...a, updated } : a));
const versionsOf = (list) => articleVersions(articlesSrc(list));

/* ── parser, against the real corpus ────────────────────────────────────── */
{
  const v = articleVersions(REAL);
  const today = Object.entries(v).filter(([, d]) => d === "2026-09-24").map(([s]) => s).sort();
  check("parses all 67 articles at the pinned commit", Object.keys(v).length === 67, `got ${Object.keys(v).length}`);
  /* 12 on that date: the 9 hand rewrites, the two guides 6583112's dead-link
   * swap bumped (stoves, dispersed — cookware was in both), and the article
   * the rail published that morning. */
  check("the 12 articles changed on 2026-09-24 all read as that version", today.length === 12, today.join(","));
  check("…including all 9 hand rewrites", REWRITES_0924.every((s) => v[s] === "2026-09-24"),
    REWRITES_0924.filter((s) => v[s] !== "2026-09-24").join(","));
  check("updated wins over date (fans: date 2026-04-16, updated 2026-09-24)", v["best-portable-camping-fans"] === "2026-09-24");
  check("date is the fallback when there is no updated", Object.values(v).every(Boolean));
  const trap = articlesSrc([{ slug: "trap", date: "2026-04-01", body: "date: \"2030-01-01\"\n    updated: \"2030-01-01\"" }]);
  check("a body line shaped like a field is not the field", articleVersions(trap).trap === "2026-04-01", articleVersions(trap).trap);
  check("garbage parses to nothing, not a throw", Object.keys(articleVersions(undefined)).length === 0);
}

/* ── first run: seed silently ───────────────────────────────────────────── */
{
  const p = ledgerAt(), o = origin(), e = endpoint();
  const r = await run(REAL, p, o, e);
  check("first run seeds every article", r.seeded === 67 && Object.keys(announcedIn(p)).length === 67, JSON.stringify(r));
  check("first run submits NOTHING and fetches nothing", e.calls.length === 0 && o.calls.length === 0);
  const r2 = await run(REAL, p, o, e);
  check("second run with no edits: changed 0, nothing sent", r2.changed === 0 && e.calls.length === 0, JSON.stringify(r2));
}

/* ── change detection ───────────────────────────────────────────────────── */
{
  const p = ledgerAt();
  await run(articlesSrc(BASE), p, origin(), endpoint());
  const after = bumped("alpha", "2026-09-24");
  const o = origin({}, versionsOf(after)), e = endpoint();
  const r = await run(articlesSrc(after), p, o, e);
  check("a bumped `updated` is announced — and only that URL", e.calls.length === 1 &&
    JSON.stringify(e.calls[0].urls) === JSON.stringify([`${ORIGIN}/blog/alpha`]), JSON.stringify(e.calls));
  check("host is the origin's host", e.calls[0]?.host === "www.camprally.co");
  check("ledger records the new version after acceptance", announcedIn(p).alpha === "2026-09-24");
  check("receipt names what was submitted", JSON.stringify(r.submitted) === '["alpha"]', JSON.stringify(r));
  const e2 = endpoint();
  await run(articlesSrc(after), p, origin({}, versionsOf(after)), e2);
  check("announced once, not every cycle after", e2.calls.length === 0);

  const withNew = [...after, { slug: "delta", date: "2026-09-25" }];
  const e3 = endpoint();
  await run(articlesSrc(withNew), p, origin({}, versionsOf(withNew)), e3);
  check("a slug missing from the ledger (new, or step 8 missed it) is announced", e3.calls[0]?.urls?.[0] === `${ORIGIN}/blog/delta`);

  const gone = withNew.filter((a) => a.slug !== "charlie");
  const e4 = endpoint();
  const r4 = await run(articlesSrc(gone), p, origin({}, versionsOf(gone)), e4);
  check("an unpublished slug leaves the ledger quietly", !("charlie" in announcedIn(p)) && e4.calls.length === 0 && r4.changed === 0);

  check("changedSlugs orders newest edit first", JSON.stringify(changedSlugs({}, { a: "2026-01-01", b: "2026-09-01" })) === '["b","a"]');
}

/* ── not live yet: retried next cycle, never dropped ────────────────────── */
{
  const p = ledgerAt();
  await run(articlesSrc(BASE), p, origin(), endpoint());
  const after = bumped("charlie", "2026-09-24");

  const e1 = endpoint();
  const r1 = await run(articlesSrc(after), p, origin({ charlie: { status: 404 } }), e1);
  check("404 → not submitted", e1.calls.length === 0);
  check("404 → reported pending with its reason", r1.pending?.[0]?.slug === "charlie" && /404/.test(r1.pending[0].why), JSON.stringify(r1));
  check("404 → ledger still holds the OLD version", announcedIn(p).charlie === "2026-06-01");

  const e2 = endpoint();
  const r2 = await run(articlesSrc(after), p, origin({ charlie: { status: 200, dateModified: "2026-06-01" } }), e2);
  check("200 but serving the old dateModified → still pending (deploy not landed)",
    e2.calls.length === 0 && /serving 2026-06-01/.test(r2.pending?.[0]?.why ?? ""), JSON.stringify(r2));

  const e3 = endpoint();
  await run(articlesSrc(after), p, origin({ charlie: { status: 308 } }), e3);
  check("a redirect is not a 200", e3.calls.length === 0);

  const e4 = endpoint();
  await run(articlesSrc(after), p, origin({ charlie: { throws: true } }), e4);
  check("a network error is pending, not a throw", e4.calls.length === 0 && announcedIn(p).charlie === "2026-06-01");

  const e5 = endpoint();
  await run(articlesSrc(after), p, origin({ charlie: { status: 200 } }), e5);
  check("next cycle, now live (no dateModified on page) → announced", e5.calls.length === 1 && announcedIn(p).charlie === "2026-09-24");
}

/* ── endpoint refuses: retried next cycle ───────────────────────────────── */
{
  const p = ledgerAt();
  await run(articlesSrc(BASE), p, origin(), endpoint());
  const after = bumped("alpha", "2026-09-24");
  const r1 = await run(articlesSrc(after), p, origin({}, versionsOf(after)), endpoint({ ok: false, status: 429 }));
  check("429 → not recorded, pending names the status", announcedIn(p).alpha === "2026-04-01" && /429/.test(r1.pending?.[0]?.why ?? ""), JSON.stringify(r1));
  const r2 = await run(articlesSrc(after), p, origin({}, versionsOf(after)), endpoint("throw"));
  check("a submit that throws is contained", announcedIn(p).alpha === "2026-04-01" && r2.error === undefined, JSON.stringify(r2));
  const e3 = endpoint();
  await run(articlesSrc(after), p, origin({}, versionsOf(after)), e3);
  check("the next healthy cycle sends it", e3.calls.length === 1 && announcedIn(p).alpha === "2026-09-24");
}

/* ── corrupt ledger: must not read as "nothing changed" forever ─────────── */
for (const [label, content] of [
  ["truncated JSON", '{"announced": {"alpha": "2026-0'],
  ["valid JSON, no announced map", "{}"],
  ["valid JSON, wrong shape", '{"announced": ["alpha"]}'],
]) {
  const p = ledgerAt();
  writeFileSync(p, content);
  check(`${label} reads as corrupt, not as a ledger`, readLedger(p).problem?.startsWith("corrupt"));
  const list = [...BASE, { slug: "echo", date: "2026-04-01", updated: "2026-09-22" }];
  const e1 = endpoint();
  const r1 = await run(articlesSrc(list), p, origin({}, versionsOf(list)), e1);
  check(`${label}: recovery is reported on the receipt`, typeof r1.reseeded === "string", JSON.stringify(r1));
  check(`${label}: an edit inside the recovery window is still announced`,
    e1.calls.length === 1 && JSON.stringify(e1.calls[0].urls) === JSON.stringify([`${ORIGIN}/blog/echo`]), JSON.stringify(e1.calls));
  check(`${label}: old articles are NOT re-sent (no flood)`, !e1.calls.flatMap((c) => c.urls).some((u) => /alpha|bravo|charlie/.test(u)));
  check(`${label}: the bad file is kept for inspection`, readdirSync(TMP).some((f) => f.startsWith(p.split("/").pop() + ".corrupt-")));
  check(`${label}: the rebuilt ledger does not carry the recovery`, !("recoveredFrom" in JSON.parse(readFileSync(p, "utf8"))));
  const after = bumped("alpha", "2026-09-24", list);
  const e2 = endpoint();
  const r2 = await run(articlesSrc(after), p, origin({}, versionsOf(after)), e2);
  check(`${label}: detection works again on the next edit`, e2.calls[0]?.urls?.[0] === `${ORIGIN}/blog/alpha`, JSON.stringify(e2.calls));
  check(`${label}: …and neither that ledger write nor its receipt repeats the recovery`,
    !("recoveredFrom" in JSON.parse(readFileSync(p, "utf8"))) && r2.reseeded === undefined, JSON.stringify(r2));
}

/* ── refusals that protect the ledger ───────────────────────────────────── */
{
  const p = ledgerAt();
  await run(REAL, p, origin(), endpoint());
  const before = readFileSync(p, "utf8");
  const e = endpoint();
  const r = await run("export const articles = [];\n", p, origin(), e);
  check("parsed 0 articles → error, nothing sent, ledger untouched",
    /parsed 0/.test(r.error ?? "") && e.calls.length === 0 && readFileSync(p, "utf8") === before, JSON.stringify(r));
  const half = articlesSrc(BASE); // 3 articles against a 67-slug ledger
  const r2 = await run(half, p, origin(), e);
  check("parse far short of the ledger → error, ledger untouched",
    /parsed 3/.test(r2.error ?? "") && e.calls.length === 0 && readFileSync(p, "utf8") === before, JSON.stringify(r2));
}

/* ── flood guard ────────────────────────────────────────────────────────── */
{
  const p = ledgerAt();
  const many = Array.from({ length: MAX_PER_CYCLE + 5 }, (_, i) => ({ slug: `s${String(i).padStart(2, "0")}`, date: "2026-04-01" }));
  await run(articlesSrc(many), p, origin(), endpoint());
  const all = many.map((a, i) => ({ ...a, updated: `2026-09-${String(1 + (i % 28)).padStart(2, "0")}` }));
  const e1 = endpoint();
  const r1 = await run(articlesSrc(all), p, origin({}, versionsOf(all)), e1);
  check(`${all.length} edits at once → ${MAX_PER_CYCLE} sent, 5 deferred`, e1.calls[0]?.urls.length === MAX_PER_CYCLE && r1.deferred === 5, JSON.stringify(r1).slice(0, 200));
  const e2 = endpoint();
  await run(articlesSrc(all), p, origin({}, versionsOf(all)), e2);
  check("the deferred 5 go out the next cycle", e2.calls[0]?.urls.length === 5);
}

/* ── dry run, and step 8's hand-off ─────────────────────────────────────── */
{
  const p = ledgerAt();
  const e = endpoint(), o = origin();
  const r = await run(articlesSrc(BASE), p, o, e, { dry: true });
  check("dry run on first run writes nothing", !existsSync(p) && r.dry === true && e.calls.length === 0);
  await run(articlesSrc(BASE), p, origin(), endpoint());
  const after = bumped("alpha", "2026-09-24");
  const o2 = origin({}, versionsOf(after)), e2 = endpoint();
  const r2 = await run(articlesSrc(after), p, o2, e2, { dry: true });
  check("dry run reports, but fetches, submits and records nothing",
    JSON.stringify(r2.wouldAnnounce) === '["alpha"]' && o2.calls.length === 0 && e2.calls.length === 0 && announcedIn(p).alpha === "2026-04-01");

  const withNew = [...BASE, { slug: "delta", date: "2026-09-25" }];
  check("recordAnnounced marks step 8's slug", recordAnnounced(p, { delta: "2026-09-25" }) === true);
  const e3 = endpoint();
  await run(articlesSrc(withNew), p, origin({}, versionsOf(withNew)), e3);
  check("…so the next cycle does not announce it twice", e3.calls.length === 0);
  const missing = join(TMP, "never-seeded.json");
  check("recordAnnounced will not create a ledger (seeding is announceEdits' job)",
    recordAnnounced(missing, { delta: "2026-09-25" }) === false && !existsSync(missing));
}

/* ── a hung origin cannot hold the cycle ────────────────────────────────── */
/* Review FIX-REQUIRED: the checks ran one after another at 15 s each, so a full
 * batch against an unreachable origin held step 3 for ~375 s. Run with the
 * DEFAULT timeout on purpose — an injected short one would prove the mechanism
 * but not the number the cycle actually runs with. */
{
  const p = ledgerAt();
  const many = Array.from({ length: MAX_PER_CYCLE }, (_, i) => ({ slug: `h${String(i).padStart(2, "0")}`, date: "2026-04-01" }));
  await run(articlesSrc(many), p, origin(), endpoint());
  const all = many.map((a) => ({ ...a, updated: "2026-09-24" }));
  const before = readFileSync(p, "utf8");

  for (const [label, fetchImpl] of [
    // Never settles and ignores the abort signal: only the race can end it.
    ["a fetch that never answers and ignores abort", () => new Promise(() => {})],
    // Headers arrive, the body never does, and it DOES honour the signal.
    ["headers then a stalled body", async (_url, { signal }) => ({
      status: 200,
      text: () => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
    })],
  ]) {
    const e = endpoint();
    const t0 = Date.now();
    const r = await run(articlesSrc(all), p, { fetchImpl }, e);
    const secs = (Date.now() - t0) / 1000;
    check(`${label}: ${MAX_PER_CYCLE} URLs settle in one timeout (${secs.toFixed(1)} s, budget ${CHECK_TIMEOUT_MS / 1000 + 2} s)`,
      secs < CHECK_TIMEOUT_MS / 1000 + 2, `${secs} s`);
    check(`${label}: every URL is pending with a timeout reason, nothing sent, ledger untouched`,
      r.pending?.length === MAX_PER_CYCLE && r.pending.every((x) => /timeout/.test(x.why)) &&
      e.calls.length === 0 && readFileSync(p, "utf8") === before, JSON.stringify(r).slice(0, 200));
  }
  const e = endpoint();
  await run(articlesSrc(all), p, origin({}, versionsOf(all)), e);
  check("…and the origin coming back sends the whole batch next cycle", e.calls[0]?.urls.length === MAX_PER_CYCLE);
}

rmSync(TMP, { recursive: true, force: true });
if (failures) {
  console.error(`\n${failures} control(s) failed`);
  process.exit(1);
}
console.log("\nall indexnow-edit controls passed");
