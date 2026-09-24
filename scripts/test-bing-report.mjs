#!/usr/bin/env node
/**
 * Controls for scripts/bing-report.mjs and lib/bing-webmaster.mjs.
 *
 *   node scripts/test-bing-report.mjs
 *
 * Zero network: fetch is injected and answers from fixtures copied off the
 * live API on 2026-09-24 (shapes verbatim — `/Date(ms)/`, the `d` wrapper, the
 * URL in GetPageStats' `Query` field, the 400 body for a bad key).
 *
 * The cases that matter most are the ones where a quiet answer would be wrong:
 * a stale sitemap must not exit 0, an API failure must not read as healthy,
 * and the key must not appear in ANY output, including the error paths that
 * echo a URL back at us.
 */

import {
  parseMsDate, aggregateRows, trafficTotals, latestCrawl, sitemapStatus, evaluate,
  createClient, redact, READ_METHODS, buildReport,
} from "./lib/bing-webmaster.mjs";
import { main } from "./bing-report.mjs";

const NOW = new Date("2026-09-24T18:00:00Z");
const KEY = "fixturekey0123456789abcdefFAKE";
const ms = (iso) => `/Date(${Date.parse(iso)})/`;

let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) pass++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/* ---- fixtures ------------------------------------------------------------ */

const q = (Query, iso, Impressions, Clicks, AvgImpressionPosition, AvgClickPosition = -1) => ({
  __type: "QueryStats:#Microsoft.Bing.Webmaster.Api", AvgClickPosition, AvgImpressionPosition, Clicks, Date: ms(iso), Impressions, Query,
});

const FIX = {
  GetRankAndTrafficStats: [
    { Clicks: 1, Date: ms("2026-04-20T00:00:00Z"), Impressions: 10 },
    { Clicks: 0, Date: ms("2026-08-01T00:00:00Z"), Impressions: 20 },
    { Clicks: 1, Date: ms("2026-09-10T00:00:00Z"), Impressions: 30 },
    { Clicks: 0, Date: ms("2026-09-22T00:00:00Z"), Impressions: 5 },
  ],
  GetQueryStats: [
    /* the same query across three weeks: 4 @ pos 2, 1 @ pos 12, 0 @ -1 */
    q("affordable camping gear for beginners", "2026-09-01T00:00:00Z", 4, 1, 2),
    q("affordable camping gear for beginners", "2026-09-08T00:00:00Z", 1, 0, 12),
    q("affordable camping gear for beginners", "2026-09-15T00:00:00Z", 0, 0, -1),
    q("best camping tent under 100", "2026-09-08T00:00:00Z", 3, 0, 9),
  ],
  GetPageStats: [
    q("https://www.camprally.co/blog/cheapest-camping-setup-for-beginners", "2026-09-01T00:00:00Z", 2, 0, 5),
    q("https://www.camprally.co/blog/cheapest-camping-setup-for-beginners", "2026-09-08T00:00:00Z", 2, 0, 3),
  ],
  GetFeeds: [{
    Compressed: false, FileSize: 0, LastCrawled: ms("2026-09-21T01:20:52Z"), Status: "Success",
    Submitted: ms("2026-08-25T17:20:14Z"), Type: "Sitemap", Url: "https://www.camprally.co/sitemap.xml", UrlCount: 82,
  }],
  GetCrawlStats: [
    /* deliberately out of order: the latest row must be chosen by Date */
    { Date: ms("2026-09-23T00:00:00Z"), InIndex: 87, CrawledPages: 87, Code4xx: 2, Code5xx: 0, BlockedByRobotsTxt: 0, InLinks: 0, CrawlErrors: 2 },
    { Date: ms("2026-04-15T00:00:00Z"), InIndex: 0, CrawledPages: 0, Code4xx: 0, Code5xx: 9, BlockedByRobotsTxt: 0, InLinks: 0, CrawlErrors: 0 },
  ],
  GetCrawlIssues: [],
};

/** A fake fetch. `overrides[method]` may be a {status, body} or a function that throws. */
function fakeFetch(fix = FIX, overrides = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, method: init?.method ?? "GET" });
    const m = /\/json\/(\w+)\?/.exec(url)?.[1];
    const o = overrides[m];
    if (typeof o === "function") return o(url);
    const status = o?.status ?? 200;
    const body = o?.body ?? JSON.stringify({ d: fix[m] });
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
  impl.calls = calls;
  return impl;
}

/* ---- /Date()/ parsing ---------------------------------------------------- */

check("parse plain /Date(ms)/", parseMsDate("/Date(1789958452000)/")?.toISOString() === "2026-09-21T02:40:52.000Z");
check("parse /Date(ms-0700)/ keeps UTC ms", parseMsDate("/Date(1789958452000-0700)/")?.getTime() === 1789958452000);
check("parse /Date(ms+0100)/", parseMsDate("/Date(1789958452000+0100)/")?.getTime() === 1789958452000);
check("garbage date is null, not epoch", parseMsDate("2026-09-21") === null && parseMsDate(undefined) === null && parseMsDate("") === null);

/* ---- weekly-row aggregation ---------------------------------------------- */

const agg = aggregateRows(FIX.GetQueryStats);
const top = agg[0];
check("weekly rows fold to one per query", agg.length === 2, `got ${agg.length}`);
check("impressions sum", top.impressions === 5, `got ${top.impressions}`);
check("clicks sum", top.clicks === 1, `got ${top.clicks}`);
/* (4*2 + 1*12) / 5 = 4.0 — and the -1 / 0-impression row is excluded */
check("position weighted by impressions", top.position === 4, `got ${top.position}`);
check("weeks counted", top.weeks === 3);
check("sorted by impressions desc", agg[0].key === "affordable camping gear for beginners" && agg[1].key === "best camping tent under 100");
check("no-impression query has null position", aggregateRows([q("x", "2026-09-01T00:00:00Z", 0, 0, -1)])[0].position === null);
check("pages aggregate on the Query field", aggregateRows(FIX.GetPageStats)[0].impressions === 4 && aggregateRows(FIX.GetPageStats)[0].position === 4);

/* ---- traffic totals ------------------------------------------------------ */

const t = trafficTotals(FIX.GetRankAndTrafficStats, NOW);
check("28-day totals", t.last28.impressions === 35 && t.last28.clicks === 1, JSON.stringify(t.last28));
check("all-time totals", t.allTime.impressions === 65 && t.allTime.clicks === 2, JSON.stringify(t.allTime));
check("no skipped rows on clean fixture", t.skippedRows === 0, String(t.skippedRows));

/* A row whose Date does not parse must not inflate ANY total: it cannot move
   firstDate/lastDate, so counting it would put traffic outside the stated range. */
const badRow = { ...FIX.GetRankAndTrafficStats[0], Date: "/Date(garbage)/", Clicks: 100, Impressions: 1000 };
const tb = trafficTotals([...FIX.GetRankAndTrafficStats, badRow], NOW);
check("bad-date row excluded from all-time", tb.allTime.impressions === 65 && tb.allTime.clicks === 2, JSON.stringify(tb.allTime));
check("bad-date row excluded from 28-day", tb.last28.impressions === 35 && tb.last28.clicks === 1, JSON.stringify(tb.last28));
check("bad-date row counted as skipped", tb.skippedRows === 1, String(tb.skippedRows));
check("bad-date row leaves date range alone", +tb.firstDate === +t.firstDate && +tb.lastDate === +t.lastDate);

/* ---- crawl --------------------------------------------------------------- */

const c = latestCrawl(FIX.GetCrawlStats);
check("latest crawl row chosen by date, not position", c.indexed === 87 && c.code5xx === 0 && c.code4xx === 2);

/* ---- stale sitemap ------------------------------------------------------- */

const fresh = sitemapStatus(FIX.GetFeeds, NOW)[0];
check("3-day-old sitemap is fresh", fresh.stale === false && fresh.ageDays === 3, JSON.stringify(fresh));
const at14 = sitemapStatus([{ ...FIX.GetFeeds[0], LastCrawled: ms("2026-09-10T18:00:00Z") }], NOW)[0];
check("exactly 14 days is not stale", at14.stale === false && at14.ageDays === 14);
const at15 = sitemapStatus([{ ...FIX.GetFeeds[0], LastCrawled: ms("2026-09-09T17:00:00Z") }], NOW)[0];
check("15 days is stale", at15.stale === true);
const april = sitemapStatus([{ ...FIX.GetFeeds[0], LastCrawled: ms("2026-04-11T00:00:00Z") }], NOW)[0];
check("the August failure (last crawl 11 April) is stale", april.stale === true);
const never = sitemapStatus([{ ...FIX.GetFeeds[0], LastCrawled: null }], NOW)[0];
check("never-crawled sitemap is stale, not exempt", never.stale === true);

{
  const r = await main({ argv: [], key: KEY, now: NOW, fetchImpl: fakeFetch({ ...FIX, GetFeeds: [{ ...FIX.GetFeeds[0], LastCrawled: ms("2026-04-11T00:00:00Z") }] }) });
  check("stale sitemap → exit 1", r.code === 1, `got ${r.code}`);
  check("stale sitemap flagged loudly in text", /STALE/.test(r.output) && /VERDICT: ATTENTION/.test(r.output));
}
{
  const r = await main({ argv: [], key: KEY, now: NOW, fetchImpl: fakeFetch({ ...FIX, GetFeeds: [] }) });
  check("no sitemap registered → exit 1", r.code === 1);
}
{
  const r = await main({ argv: [], key: KEY, now: NOW, fetchImpl: fakeFetch({ ...FIX, GetFeeds: [{ ...FIX.GetFeeds[0], Status: "Failed" }] }) });
  check("non-Success sitemap status → exit 1", r.code === 1);
}
{
  const r = await main({ argv: [], key: KEY, now: NOW, fetchImpl: fakeFetch({ ...FIX, GetCrawlStats: [{ ...FIX.GetCrawlStats[0], Code5xx: 3 }] }) });
  check("5xx in latest crawl row → exit 1", r.code === 1 && /5xx/.test(r.output));
}

{
  const bad = { ...FIX.GetRankAndTrafficStats[0], Date: "/Date(garbage)/", Clicks: 100, Impressions: 1000 };
  const r = await main({ argv: [], key: KEY, now: NOW, fetchImpl: fakeFetch({ ...FIX, GetRankAndTrafficStats: [...FIX.GetRankAndTrafficStats, bad] }) });
  check("text report names skipped bad-date rows", /1 row\(s\) skipped/.test(r.output), r.output.split("\n").filter((l) => /all time|skipped/.test(l)).join(" | "));
}

/* ---- the healthy path ---------------------------------------------------- */

{
  const f = fakeFetch();
  const r = await main({ argv: [], key: KEY, now: NOW, fetchImpl: f });
  check("healthy fixtures → exit 0", r.code === 0, `got ${r.code}: ${r.output.split("\n").slice(0, 4).join(" | ")}`);
  check("4xx with no GetCrawlIssues rows says where to look", /Site Explorer/.test(r.output));
  check("clean traffic → no skipped-rows line", !/skipped/.test(r.output));
  check("only READ_METHODS were called, all as GET",
    f.calls.length === READ_METHODS.length && f.calls.every((x) => x.method === "GET" && READ_METHODS.includes(/\/json\/(\w+)\?/.exec(x.url)[1])));
  const j = await main({ argv: ["--json"], key: KEY, now: NOW, fetchImpl: fakeFetch() });
  const parsed = JSON.parse(j.output);
  check("--json is valid JSON carrying the verdict", parsed.verdict.code === 0 && parsed.queries.top[0].impressions === 5);
}

/* ---- read-only guard ----------------------------------------------------- */

{
  const get = createClient({ key: KEY, fetchImpl: fakeFetch() });
  let threw = false;
  for (const m of ["SubmitUrl", "SubmitUrlBatch", "AddSite", "RemoveSite", "GetUserSites_but_not_listed"]) {
    try {
      await get(m);
    } catch {
      threw = true;
      continue;
    }
    threw = false;
    break;
  }
  check("client refuses every non-READ_METHODS call", threw);
  check("READ_METHODS are all Get*", READ_METHODS.every((m) => /^Get[A-Z]/.test(m)));
}

/* ---- API failure → exit 2 ------------------------------------------------ */

const BAD_KEY = { status: 400, body: JSON.stringify({ ErrorCode: 3, Message: "ERROR!!! InvalidApiKey" }) };
{
  const bad = Object.fromEntries(READ_METHODS.map((m) => [m, BAD_KEY]));
  const r = await main({ argv: [], key: KEY, now: NOW, fetchImpl: fakeFetch(FIX, bad) });
  check("invalid key → exit 2", r.code === 2, `got ${r.code}`);
  check("invalid key never reads as healthy", !/VERDICT: OK/.test(r.output) && /INCOMPLETE/.test(r.output) && /InvalidApiKey/.test(r.output));
}
{
  /* ONE method failing, everything else healthy, must still be 2 */
  const r = await main({ argv: [], key: KEY, now: NOW, fetchImpl: fakeFetch(FIX, { GetCrawlStats: { status: 500, body: "" } }) });
  check("single failed call → exit 2", r.code === 2, `got ${r.code}`);
}
{
  const r = await main({ argv: [], key: null, now: NOW, fetchImpl: fakeFetch() });
  check("missing key → exit 2", r.code === 2 && /BING_API_KEY is not set/.test(r.output));
}
{
  const r = await main({ argv: [], key: KEY, now: NOW, fetchImpl: fakeFetch(FIX, { GetFeeds: { status: 200, body: "<html>maintenance</html>" } }) });
  check("non-JSON 200 → exit 2", r.code === 2);
}
{
  const r = await main({ argv: [], key: KEY, now: NOW, fetchImpl: fakeFetch(FIX, { GetFeeds: { status: 200, body: "{}" } }) });
  check("200 without d → exit 2, not an empty sitemap list", r.code === 2);
}

/* ---- redaction ----------------------------------------------------------- */

{
  /* Every failure shape that could echo the URL: a thrown fetch error quoting
   * it, an error body quoting it, and a success body quoting it. */
  const echo = (url) => { throw new Error(`connect ECONNREFUSED while fetching ${url}`); };
  const overrides = {
    GetRankAndTrafficStats: echo,
    GetQueryStats: { status: 502, body: `Bad gateway for ${"https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats?apikey=" + KEY}` },
    GetPageStats: { status: 400, body: JSON.stringify({ ErrorCode: 3, Message: `bad key ${KEY}` }) },
  };
  const outs = [];
  for (const argv of [[], ["--json"]]) {
    outs.push((await main({ argv, key: KEY, now: NOW, fetchImpl: fakeFetch(FIX, overrides) })).output);
  }
  /* and the healthy path, where a feed URL carrying the key would be echoed */
  const leakyFeeds = [{ ...FIX.GetFeeds[0], Url: `https://www.camprally.co/sitemap.xml?apikey=${KEY}` }];
  outs.push((await main({ argv: [], key: KEY, now: NOW, fetchImpl: fakeFetch({ ...FIX, GetFeeds: leakyFeeds }) })).output);
  outs.push((await main({ argv: ["--json"], key: KEY, now: NOW, fetchImpl: fakeFetch({ ...FIX, GetFeeds: leakyFeeds }) })).output);
  check("key appears in NO output (text, json, error and success paths)", outs.every((o) => !o.includes(KEY)),
    outs.find((o) => o.includes(KEY))?.slice(0, 120));
  check("the error paths were actually exercised", /ECONNREFUSED/.test(outs[0]) && /HTTP 502/.test(outs[0]));
  check("redact() scrubs an unknown key in an apikey= param", !redact("x?apikey=someOtherKey&y=1", KEY).includes("someOtherKey"));
  /* the thrown-error path is also exercised directly through buildReport */
  const rep = await buildReport({ key: KEY, now: NOW, fetchImpl: fakeFetch(FIX, overrides) });
  check("buildReport verdict errors are redacted", !JSON.stringify(rep).includes(KEY));
}

/* ---- evaluate: errors dominate ------------------------------------------- */

check("errors beat a stale sitemap (2 over 1)", evaluate({ errors: ["x"], sitemaps: [april], crawl: c }).code === 2);

console.log(`${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
