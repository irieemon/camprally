/**
 * Bing Webmaster API — a READ-ONLY view of how Bing sees camprally.co.
 *
 * WHY THIS EXISTS. The August failure (see the header of lib/indexnow.mjs) was
 * a sitemap Bing had not read in four months while the dashboard said
 * "Success", zero errors. Nobody looked, because looking meant logging into
 * Bing Webmaster Tools, and the only programmatic alternatives were
 * third-party SEO packages Sean did not want running against his account.
 * Bing's own JSON API answers the same questions with one key and no
 * dependencies, so this is that, and nothing more.
 *
 * READ-ONLY BY CONSTRUCTION, NOT BY CONVENTION. The API key can also submit
 * URLs, add or remove sites, block URLs and change crawl settings. None of
 * that belongs in a report, so the client below refuses any method not on
 * READ_METHODS — even a Get* one — before a request is built. A write cannot
 * be added "as an option" later without editing that list, which is the point.
 *
 * THE KEY NEVER LEAVES THIS PROCESS. It rides in the query string (the API's
 * design, not ours), so anything that echoes a URL — a fetch error, a proxy
 * message, a stack trace — would print it. Every string that leaves the client
 * goes through redact(), and the CLI runs its whole output through it again.
 * Belt and braces is right here: a leaked key is a write credential.
 *
 * QUIRKS PAID FOR:
 *   - Dates arrive as `/Date(1789958452000)/` (WCF JSON), sometimes with an
 *     offset suffix like `/Date(1789958452000-0700)/`. The number is UTC ms
 *     either way; the offset only describes the server's zone.
 *   - GetQueryStats / GetPageStats return one row per query-or-page PER WEEK.
 *     A query that showed up in four weeks is four rows, so a naive top-15 is
 *     the same query four times. aggregateRows() folds them.
 *   - GetPageStats rows carry the URL in the field named `Query`.
 *   - AvgClickPosition is -1 when there were no clicks. Positions are only
 *     meaningful weighted by impressions, and only where impressions exist.
 *   - A bad key is HTTP 400 with {"ErrorCode":3,"Message":"ERROR!!! InvalidApiKey"},
 *     not 401. An unknown method is a bare 404.
 */

export const SITE_URL = "https://camprally.co/";
const API = "https://ssl.bing.com/webmaster/api.svc/json";

/** The only methods this client will call. Every one is a GET read. */
export const READ_METHODS = Object.freeze([
  "GetRankAndTrafficStats",
  "GetQueryStats",
  "GetPageStats",
  "GetFeeds",
  "GetCrawlStats",
  "GetCrawlIssues",
]);

/** August's silent failure went four months. Two weeks is loud enough. */
export const STALE_SITEMAP_DAYS = 14;

const DAY_MS = 86_400_000;

/**
 * Strip a key from any string. Removes the literal key wherever it appears
 * AND any `apikey=` query value, so a key we were never told about (say, a
 * different one in an echoed URL) is scrubbed too.
 */
export function redact(text, key) {
  let s = String(text ?? "");
  if (key) s = s.split(key).join("[redacted]");
  return s.replace(/(apikey=)[^&\s"']*/gi, "$1[redacted]");
}

/** `/Date(1789958452000)/` or `/Date(1789958452000-0700)/` → Date, else null. */
export function parseMsDate(value) {
  const m = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(String(value ?? ""));
  if (!m) return null;
  const d = new Date(Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** YYYY-MM-DD in UTC, or "never" — a missing date must not print as 1970. */
export function ymd(date) {
  return date ? date.toISOString().slice(0, 10) : "never";
}

/**
 * Build a read-only client. `fetchImpl` is injectable so tests run with no
 * network. Every call returns {ok, data} or {ok:false, error} — never throws —
 * and every error string is already redacted.
 */
export function createClient({ key, fetchImpl = fetch, siteUrl = SITE_URL, timeoutMs = 20_000 } = {}) {
  return async function get(method) {
    if (!READ_METHODS.includes(method)) {
      /* Thrown, not returned: this is a programming error in the caller, not
       * an API condition, and it must never be mistaken for a quiet empty. */
      throw new Error(`refusing non-read Bing method: ${method}`);
    }
    if (!key) return { ok: false, error: "BING_API_KEY is not set" };
    const url = `${API}/${method}?siteUrl=${encodeURIComponent(siteUrl)}&apikey=${encodeURIComponent(key)}`;
    try {
      const res = await fetchImpl(url, { method: "GET", signal: AbortSignal.timeout(timeoutMs) });
      const body = await res.text();
      if (!res.ok) {
        let msg = body.slice(0, 200);
        try {
          const j = JSON.parse(body);
          if (j?.Message) msg = `${j.Message}${j.ErrorCode != null ? ` (ErrorCode ${j.ErrorCode})` : ""}`;
        } catch {
          /* non-JSON error body — keep the raw slice */
        }
        return { ok: false, error: redact(`${method}: HTTP ${res.status}${msg ? ` — ${msg}` : ""}`, key) };
      }
      let json;
      try {
        json = JSON.parse(body);
      } catch {
        return { ok: false, error: redact(`${method}: response was not JSON`, key) };
      }
      /* Every Get* answers {"d": ...}. A 200 without it is not an empty
       * result, it is something we do not understand — say so. */
      if (!json || !("d" in json)) return { ok: false, error: `${method}: response had no "d" field` };
      return { ok: true, data: json.d };
    } catch (err) {
      return { ok: false, error: redact(`${method}: ${err?.message ?? "request failed"}`, key) };
    }
  };
}

/**
 * Fold weekly rows into one row per Query (or page URL). Impressions and
 * clicks sum; position is the impression-weighted mean of
 * AvgImpressionPosition, ignoring rows with no impressions or no position
 * (the API uses -1 / 0 for "none").
 */
export function aggregateRows(rows) {
  const by = new Map();
  for (const r of rows ?? []) {
    const k = r?.Query;
    if (!k) continue;
    const a = by.get(k) ?? { key: k, impressions: 0, clicks: 0, weeks: 0, _posW: 0, _posImp: 0 };
    const imp = Number(r.Impressions) || 0;
    const pos = Number(r.AvgImpressionPosition);
    a.impressions += imp;
    a.clicks += Number(r.Clicks) || 0;
    a.weeks += 1;
    if (imp > 0 && pos > 0) {
      a._posW += pos * imp;
      a._posImp += imp;
    }
    by.set(k, a);
  }
  return [...by.values()]
    .map(({ _posW, _posImp, ...a }) => ({ ...a, position: _posImp ? Math.round((_posW / _posImp) * 10) / 10 : null }))
    .sort((x, y) => y.impressions - x.impressions || y.clicks - x.clicks || x.key.localeCompare(y.key));
}

/**
 * Daily rank-and-traffic rows → 28-day and all-time click/impression totals.
 * A row whose Date does not parse is left out of EVERY total and counted in
 * skippedRows: counting it in all-time alone would inflate a total whose
 * date range (firstDate → lastDate) cannot account for it.
 */
export function trafficTotals(rows, now = new Date()) {
  const since = now.getTime() - 28 * DAY_MS;
  const t = { last28: { clicks: 0, impressions: 0 }, allTime: { clicks: 0, impressions: 0 }, firstDate: null, lastDate: null, skippedRows: 0 };
  for (const r of rows ?? []) {
    const d = parseMsDate(r?.Date);
    if (!d) {
      t.skippedRows += 1;
      continue;
    }
    const c = Number(r?.Clicks) || 0;
    const i = Number(r?.Impressions) || 0;
    t.allTime.clicks += c;
    t.allTime.impressions += i;
    if (d.getTime() >= since) {
      t.last28.clicks += c;
      t.last28.impressions += i;
    }
    if (!t.firstDate || d < t.firstDate) t.firstDate = d;
    if (!t.lastDate || d > t.lastDate) t.lastDate = d;
  }
  return t;
}

/** The newest GetCrawlStats row, by Date — not by array position. */
export function latestCrawl(rows) {
  let best = null;
  let bestDate = null;
  for (const r of rows ?? []) {
    const d = parseMsDate(r?.Date);
    if (d && (!bestDate || d > bestDate)) {
      best = r;
      bestDate = d;
    }
  }
  if (!best) return null;
  return {
    date: bestDate,
    indexed: Number(best.InIndex) || 0,
    crawled: Number(best.CrawledPages) || 0,
    code4xx: Number(best.Code4xx) || 0,
    code5xx: Number(best.Code5xx) || 0,
    blockedByRobots: Number(best.BlockedByRobotsTxt) || 0,
    inLinks: Number(best.InLinks) || 0,
    crawlErrors: Number(best.CrawlErrors) || 0,
  };
}

/**
 * Sitemap health from GetFeeds. A sitemap is stale when Bing's last crawl is
 * more than STALE_SITEMAP_DAYS old — or when there is no last-crawl date at
 * all, because "never crawled" is the worst case of stale, not an exemption.
 */
export function sitemapStatus(feeds, now = new Date(), staleDays = STALE_SITEMAP_DAYS) {
  return (feeds ?? []).map((f) => {
    const lastCrawled = parseMsDate(f?.LastCrawled);
    const ageDays = lastCrawled ? Math.floor((now.getTime() - lastCrawled.getTime()) / DAY_MS) : null;
    return {
      url: f?.Url ?? "(no url)",
      type: f?.Type ?? "",
      status: f?.Status ?? "(none)",
      urlCount: Number(f?.UrlCount) || 0,
      lastCrawled,
      submitted: parseMsDate(f?.Submitted),
      ageDays,
      stale: ageDays == null || ageDays > staleDays,
    };
  });
}

/**
 * The verdict. Exit 2 beats everything: if any call failed, the report cannot
 * claim health for the part it could not see, and a half-fetched report that
 * exits 0 is exactly the silence this exists to prevent.
 */
export function evaluate({ errors, sitemaps, crawl }) {
  const problems = [];
  if (errors.length) return { code: 2, problems: errors.map((e) => `API: ${e}`) };
  if (!sitemaps.length) problems.push("no sitemap is registered with Bing");
  for (const s of sitemaps) {
    if (s.stale) {
      problems.push(
        s.lastCrawled
          ? `sitemap ${s.url} last crawled ${ymd(s.lastCrawled)} — ${s.ageDays} days ago (limit ${STALE_SITEMAP_DAYS})`
          : `sitemap ${s.url} has never been crawled`,
      );
    }
    if (!/^success$/i.test(s.status)) problems.push(`sitemap ${s.url} status is "${s.status}"`);
  }
  if (!crawl) problems.push("GetCrawlStats returned no rows");
  else if (crawl.code5xx > 0) problems.push(`${crawl.code5xx} page(s) returned 5xx to Bingbot`);
  return { code: problems.length ? 1 : 0, problems };
}

/**
 * Fetch everything and assemble the report object. Calls run in parallel;
 * each result is independent, so one failure does not hide the others.
 */
export async function buildReport({ key, fetchImpl, now = new Date(), top = 15 } = {}) {
  const get = createClient({ key, fetchImpl });
  const [traffic, queries, pages, feeds, crawlStats, crawlIssues] = await Promise.all(READ_METHODS.map((m) => get(m)));
  const errors = [traffic, queries, pages, feeds, crawlStats, crawlIssues].filter((r) => !r.ok).map((r) => r.error);

  /* No key → every call fails identically. Collapse to one line. */
  const uniqueErrors = [...new Set(errors)];

  const totals = traffic.ok ? trafficTotals(traffic.data, now) : null;
  const q = queries.ok ? aggregateRows(queries.data) : null;
  const p = pages.ok ? aggregateRows(pages.data) : null;
  const sitemaps = feeds.ok ? sitemapStatus(feeds.data, now) : [];
  const crawl = crawlStats.ok ? latestCrawl(crawlStats.data) : null;
  const issues = crawlIssues.ok
    ? (crawlIssues.data ?? []).map((i) => ({
        url: i?.Url ?? "(no url)",
        httpCode: i?.HttpCode ?? null,
        issues: i?.Issues ?? null,
        inLinks: i?.InLinks ?? null,
      }))
    : null;

  const verdict = evaluate({ errors: uniqueErrors, sitemaps, crawl });
  return {
    site: SITE_URL,
    generatedAt: now.toISOString(),
    verdict,
    totals,
    queries: q && { distinct: q.length, top: q.slice(0, top) },
    pages: p && { distinct: p.length, top: p.slice(0, top) },
    sitemaps,
    crawl,
    crawlIssues: issues,
  };
}

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const fmtPos = (p) => (p == null ? "  -" : p.toFixed(1));

/** Plain-text rendering. The verdict goes FIRST so it cannot be scrolled past. */
export function renderText(r) {
  const out = [];
  const head = { 0: "OK", 1: "ATTENTION", 2: "API FAILURE — THIS REPORT IS INCOMPLETE" }[r.verdict.code];
  out.push(`Bing Webmaster report — ${r.site}   (${r.generatedAt.slice(0, 16).replace("T", " ")}Z)`);
  out.push(`VERDICT: ${head}`);
  for (const pr of r.verdict.problems) out.push(`  !! ${pr}`);
  out.push("");

  if (r.totals) {
    const t = r.totals;
    out.push("TRAFFIC (GetRankAndTrafficStats)");
    out.push(`  last 28 days   ${lpad(t.last28.clicks, 5)} clicks  ${lpad(t.last28.impressions, 6)} impressions`);
    out.push(`  all time       ${lpad(t.allTime.clicks, 5)} clicks  ${lpad(t.allTime.impressions, 6)} impressions   (${ymd(t.firstDate)} → ${ymd(t.lastDate)})`);
    if (t.skippedRows > 0) out.push(`  (${t.skippedRows} row(s) skipped — unparseable Date, excluded from all totals)`);
    out.push("");
  }

  for (const [label, block] of [["TOP QUERIES (GetQueryStats, weekly rows folded)", r.queries], ["TOP PAGES (GetPageStats, weekly rows folded)", r.pages]]) {
    if (!block) continue;
    out.push(`${label} — ${block.distinct} distinct`);
    out.push(`  ${pad("impr", 5)} ${pad("clk", 4)} ${pad("pos", 5)} ${"query / page"}`);
    /* Bing passes operator-stuffed queries through verbatim (one real row is
     * sixteen `-site:` clauses); truncate so one scraper cannot wrap the table. */
    const clip = (s) => (s.length > 90 ? `${s.slice(0, 87)}...` : s);
    for (const row of block.top) out.push(`  ${lpad(row.impressions, 4)}  ${lpad(row.clicks, 3)}  ${lpad(fmtPos(row.position), 4)}  ${clip(row.key)}`);
    if (!block.top.length) out.push("  (none)");
    out.push("");
  }

  out.push("SITEMAP (GetFeeds)");
  if (!r.sitemaps.length) out.push("  (no sitemap registered)");
  for (const s of r.sitemaps) {
    const flag = s.stale ? "   <<< STALE — Bing is not reading the sitemap" : "";
    out.push(`  ${s.url}`);
    out.push(`    status ${s.status} · ${s.urlCount} URLs · last crawled ${ymd(s.lastCrawled)}${s.ageDays != null ? ` (${s.ageDays}d ago)` : ""}${flag}`);
  }
  out.push("");

  if (r.crawl) {
    const c = r.crawl;
    out.push(`CRAWL (GetCrawlStats, latest row ${ymd(c.date)})`);
    out.push(`  indexed ${c.indexed} · crawled ${c.crawled} · 4xx ${c.code4xx} · 5xx ${c.code5xx} · robots-blocked ${c.blockedByRobots} · inbound links ${c.inLinks}`);
    out.push("");
  }

  if (r.crawlIssues) {
    out.push("CRAWL ISSUES (GetCrawlIssues)");
    for (const i of r.crawlIssues) out.push(`  ${i.httpCode ?? "?"}  ${i.url}${i.issues != null ? `  [issues ${i.issues}]` : ""}`);
    if (!r.crawlIssues.length) {
      out.push(
        r.crawl?.code4xx
          ? `  API lists no URLs, although crawl stats count ${r.crawl.code4xx} 4xx. The URLs are only visible in
  Bing Webmaster Tools → Site Explorer (filter: 4xx) or URL Inspection.`
          : "  (none)",
      );
    }
  }
  return out.join("\n");
}
