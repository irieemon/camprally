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

async function printables() {
  const out = { productsLive: 0, awaiting: 0, pins7d: 0, sales7d: null, revenue7dCents: null };
  const ROOT_P = `${homedir()}/camprally-printables`;
  try {
    const products = Object.values(JSON.parse(readFileSync(`${ROOT_P}/state/products.json`, "utf8")).products);
    out.productsLive = products.filter((p) => p.status === "published").length;
    out.awaiting = products.filter((p) => ["generated", "publishing-partial"].includes(p.status)).length;
  } catch { /* engine may not have run yet */ }
  try {
    const posted = JSON.parse(readFileSync(`${ROOT_P}/state/pins-posted.json`, "utf8")).posted ?? [];
    out.pins7d = posted.filter((p) => Date.parse(p.at) > weekAgo).length;
  } catch { /* no product pins yet */ }
  try {
    if (vars.GUMROAD_ACCESS_TOKEN) {
      const res = await fetch(`https://api.gumroad.com/v2/sales?after=${day(weekAgo)}`, {
        headers: { Authorization: `Bearer ${vars.GUMROAD_ACCESS_TOKEN}` } });
      if (res.ok) {
        const sales = (await res.json()).sales ?? [];
        out.sales7d = sales.length;
        out.revenue7dCents = sales.reduce((n, s) => n + (s.price ?? 0), 0);
      }
    }
  } catch { /* leave null */ }
  return out;
}

async function site() {
  try {
    const res = await fetch("https://www.camprally.co", { redirect: "follow", signal: AbortSignal.timeout(15000) });
    return { up: res.ok };
  } catch { return { up: false }; }
}

const [pin, news, rep, live, prod] = [await pinterest(), await beehiiv(), repo(), await site(), await printables()];

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
  printables_live: prod.productsLive,
  printables_awaiting_publish: prod.awaiting,
  printables_pins_7d: prod.pins7d,
  gumroad_sales_7d: prod.sales7d,
  gumroad_revenue_7d_cents: prod.revenue7dCents,
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
    `printables: ${prod.productsLive} live · ${prod.awaiting} awaiting publish · ${prod.pins7d} pins 7d`,
    prod.sales7d === null
      ? `gumroad: no token yet (products queue until GUMROAD_ACCESS_TOKEN lands)`
      : `gumroad 7d: ${prod.sales7d} sales · $${((prod.revenue7dCents ?? 0) / 100).toFixed(2)}`,
    `amazon: check Associates + GA4 affiliate_click events (no API until 10 sales/30d)`,
  ].join("\n"),
);
