#!/usr/bin/env node
/**
 * Weekly KPI rollup. Run by cron every Monday; stdout is delivered to
 * Telegram by the cron's announce mode, so this prints the report a human
 * actually wants to read and appends the raw numbers to
 * ~/.openclaw/workspace/state/camprally-kpis.json for trend history.
 *
 * Sources, all readable without a human: Pinterest API (account + analytics
 * where the plan allows), Beehiiv API (subscribers), the repo itself
 * (articles published, cycle receipts), and the live site (health probe).
 * Amazon Associates earnings have no API at zero sales — that number stays
 * manual until the Creators API threshold (10 sales/30d) is reached.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";

const ROOT = new URL("..", import.meta.url).pathname;
const KPIS = `${homedir()}/.openclaw/workspace/state/camprally-kpis.json`;
const PIN_STATE = `${homedir()}/.openclaw/workspace/skills/pinterest/state/pinterest-posted.json`;

const vars = JSON.parse(readFileSync(`${homedir()}/.openclaw/openclaw.json`, "utf8")).env.vars;
const now = new Date();
const weekAgo = new Date(now - 7 * 86400000);
const day = (d) => d.toISOString().slice(0, 10);

async function pinterest() {
  const h = { Authorization: `Bearer ${vars.PINTEREST_ACCESS_TOKEN}` };
  const out = { posted7d: 0, followers: null, impressions7d: null, outboundClicks7d: null };
  try {
    const posted = JSON.parse(readFileSync(PIN_STATE, "utf8")).posted ?? [];
    out.posted7d = posted.filter((p) => Date.parse(p.at) > weekAgo).length;
  } catch { /* no pins posted yet */ }
  try {
    const acct = await (await fetch("https://api.pinterest.com/v5/user_account", { headers: h })).json();
    out.followers = acct.follower_count ?? null;
  } catch { /* leave null */ }
  try {
    const q = `start_date=${day(weekAgo)}&end_date=${day(now)}&metric_types=IMPRESSION,OUTBOUND_CLICK`;
    const res = await fetch(`https://api.pinterest.com/v5/user_account/analytics?${q}`, { headers: h });
    if (res.ok) {
      const a = (await res.json()).all?.summary_metrics ?? {};
      out.impressions7d = a.IMPRESSION ?? null;
      out.outboundClicks7d = a.OUTBOUND_CLICK ?? null;
    }
  } catch { /* analytics may be gated by plan tier */ }
  return out;
}

async function beehiiv() {
  try {
    const res = await fetch(
      `https://api.beehiiv.com/v2/publications/${vars.BEEHIIV_PUBLICATION_ID}?expand=stats`,
      { headers: { Authorization: `Bearer ${vars.BEEHIIV_API_KEY}` } });
    if (!res.ok) return { subscribers: null };
    const d = (await res.json()).data ?? {};
    return { subscribers: d.stats?.active_subscriptions ?? null };
  } catch { return { subscribers: null }; }
}

function repo() {
  const articles = (readFileSync(`${ROOT}src/data/articles.ts`, "utf8").match(/slug: "/g) ?? []).length;
  const receipts = existsSync(`${ROOT}state/runs`)
    ? readdirSync(`${ROOT}state/runs`)
        .filter((f) => f.endsWith(".json"))
        .map((f) => JSON.parse(readFileSync(`${ROOT}state/runs/${f}`, "utf8")))
        .filter((r) => Date.parse(r.startedAt) > weekAgo)
    : [];
  const byOutcome = {};
  for (const r of receipts) byOutcome[r.outcome] = (byOutcome[r.outcome] ?? 0) + 1;
  return { articles, cycles7d: receipts.length, byOutcome };
}

async function site() {
  try {
    const res = await fetch("https://www.camprally.co", { redirect: "follow", signal: AbortSignal.timeout(15000) });
    return { up: res.ok };
  } catch { return { up: false }; }
}

const [pin, news, rep, live] = [await pinterest(), await beehiiv(), repo(), await site()];

const entry = {
  weekEnding: day(now),
  site_up: live.up,
  articles_published_total: rep.articles,
  cycles_last_7d: rep.cycles7d,
  cycle_outcomes: rep.byOutcome,
  pins_posted_7d: pin.posted7d,
  pinterest_followers: pin.followers,
  pinterest_impressions_7d: pin.impressions7d,
  pinterest_outbound_clicks_7d: pin.outboundClicks7d,
  beehiiv_subscribers: news.subscribers,
};

try {
  const kpis = JSON.parse(readFileSync(KPIS, "utf8"));
  kpis.weekly = kpis.weekly ?? [];
  kpis.weekly.push(entry);
  kpis.meta.updated = now.toISOString();
  writeFileSync(KPIS, JSON.stringify(kpis, null, 2) + "\n");
} catch (err) {
  console.error(`(could not update camprally-kpis.json: ${err.message})`);
}

const fmt = (v) => (v === null || v === undefined ? "n/a" : String(v));
console.log(
  [
    `📊 STATUS — CampRally weekly (${day(now)})`,
    `site: ${live.up ? "up" : "DOWN"} · articles live: ${rep.articles}`,
    `cycles 7d: ${rep.cycles7d} (${Object.entries(rep.byOutcome).map(([k, v]) => `${k}:${v}`).join(" ") || "none"})`,
    `pins posted 7d: ${pin.posted7d} · followers: ${fmt(pin.followers)}`,
    `pin impressions 7d: ${fmt(pin.impressions7d)} · outbound clicks 7d: ${fmt(pin.outboundClicks7d)}`,
    `newsletter subs: ${fmt(news.subscribers)}`,
    `revenue: check Amazon Associates + GA4 affiliate_click events (no API until 10 sales/30d)`,
  ].join("\n"),
);
