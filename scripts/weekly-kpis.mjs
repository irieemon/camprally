#!/usr/bin/env node
/**
 * Weekly KPI rollup. Run by cron every Monday; stdout is delivered to
 * Telegram by the cron's announce mode, so this prints the report a human
 * actually wants to read and appends the raw numbers to
 * ~/.openclaw/workspace/state/camprally-kpis.json for trend history.
 *
 * Sources, all readable without a human: Pinterest API (account + analytics
 * where the plan allows), Beehiiv API (subscribers), the repo itself
 * (articles published, cycle receipts), the live site (health probe), Gumroad
 * (printables sales) and Printify (merch catalogue + orders).
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

/**
 * Third rail: Printify merch.
 *
 * NOTE THE STATE SHAPES DIFFER FROM THE PRINTABLES RAIL and copying that
 * reader verbatim reports a confident zero. Printables keep `{posted: [{at}]}`;
 * merch keeps `{pins: {"<design>:<kind>": {lastPinnedAt}}}` — an object, not an
 * array, with a different timestamp key. Likewise the merch ledger nests
 * products inside each design rather than listing them flat.
 */
async function merch() {
  const out = { productsLive: 0, designsLive: 0, pins7d: 0, orders7d: null, revenue7dCents: null };
  // Overridable for the same reason sync-merch.mjs allows it: so the
  // missing-sibling-repo path can be exercised rather than assumed.
  const ROOT_M = process.env.MERCH_REPO ?? `${homedir()}/camprally-merch`;
  try {
    const designs = Object.values(JSON.parse(readFileSync(`${ROOT_M}/state/designs.json`, "utf8")).designs ?? {});
    for (const d of designs) {
      const live = Object.values(d.products ?? {}).filter((p) => p.status === "published" && p.url);
      if (live.length) out.designsLive += 1;
      out.productsLive += live.length;
    }
  } catch { /* engine may not have run on this machine */ }
  try {
    const pins = Object.values(JSON.parse(readFileSync(`${ROOT_M}/state/pins-posted.json`, "utf8")).pins ?? {});
    out.pins7d = pins.filter((p) => Date.parse(p.lastPinnedAt) > weekAgo).length;
  } catch { /* no merch pins yet */ }
  try {
    if (vars.PRINTIFY_ACCESS_TOKEN) {
      const shops = await (await fetch("https://api.printify.com/v1/shops.json", {
        headers: { Authorization: `Bearer ${vars.PRINTIFY_ACCESS_TOKEN}` } })).json();
      const shopId = process.env.PRINTIFY_SHOP_ID ?? shops?.[0]?.id;
      if (shopId) {
        const res = await fetch(`https://api.printify.com/v1/shops/${shopId}/orders.json?limit=50`, {
          headers: { Authorization: `Bearer ${vars.PRINTIFY_ACCESS_TOKEN}` } });
        if (res.ok) {
          const orders = (await res.json()).data ?? [];
          /* Printify stamps created_at as "YYYY-MM-DD HH:MM:SS+00:00" — a space
           * where ISO wants a T. V8 happens to parse it, but normalising costs
           * nothing and an unparsed date would silently drop every order. */
          const recent = orders.filter((o) => Date.parse(String(o.created_at ?? "").replace(" ", "T")) > weekAgo);
          out.orders7d = recent.length;
          out.revenue7dCents = recent.reduce((n, o) => n + (o.total_price ?? 0), 0);
        }
      }
    }
  } catch { /* leave null — null reads as "not measured", 0 as "measured, none" */ }
  return out;
}

async function site() {
  try {
    const res = await fetch("https://www.camprally.co", { redirect: "follow", signal: AbortSignal.timeout(15000) });
    return { up: res.ok };
  } catch { return { up: false }; }
}

const [pin, news, rep, live, prod, mer] = [
  await pinterest(), await beehiiv(), repo(), await site(), await printables(), await merch(),
];

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
  merch_designs_live: mer.designsLive,
  merch_products_live: mer.productsLive,
  merch_pins_7d: mer.pins7d,
  printify_orders_7d: mer.orders7d,
  printify_revenue_7d_cents: mer.revenue7dCents,
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
    `merch: ${mer.productsLive} products live across ${mer.designsLive} designs · ${mer.pins7d} pins 7d`,
    mer.orders7d === null
      ? `printify: orders unreadable (no PRINTIFY_ACCESS_TOKEN, or API error)`
      : `printify 7d: ${mer.orders7d} orders · $${((mer.revenue7dCents ?? 0) / 100).toFixed(2)}`,
    `merch clicks: GA4 merch_click, split by design + product`,
    `amazon: check Associates + GA4 affiliate_click events (no API until 10 sales/30d)`,
  ].join("\n"),
);
