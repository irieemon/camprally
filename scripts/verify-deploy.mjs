#!/usr/bin/env node
/**
 * Confirm that what we pushed is actually being served.
 *
 *   node scripts/verify-deploy.mjs how-to-camp-in-rain
 *   node scripts/verify-deploy.mjs                      # home page only
 *   node scripts/verify-deploy.mjs <slug> --budget 240  # seconds to wait
 *
 * A green `next build` on this Mac is not a deploy. Vercel builds again on its
 * own machine, with its own Node version, its own environment and its own
 * timeouts, and when that build fails the last good deployment keeps serving —
 * silently. The cycle would report `published`, announce it to Telegram, commit
 * a receipt saying the same, and the article would not exist. Every signal in
 * the system would agree, and all of them would be wrong.
 *
 * So the claim is checked against the origin rather than inferred from a git
 * push succeeding.
 *
 * Exit codes:
 *   0  serving the expected content
 *   1  did not appear within the budget
 */

const SITE = process.env.CAMPRALLY_SITE ?? "https://www.camprally.co";

const args = process.argv.slice(2);
const budgetAt = args.indexOf("--budget");
const budgetSec = Number(args[budgetAt + 1]) || 300;
/* Skip the value belonging to --budget when looking for the slug. Without this,
 * `verify-deploy.mjs --budget 300` reads "300" as the slug and spends the whole
 * budget polling /blog/300 for a 404 it was never going to stop getting. */
const slug = args.find((a, i) => !a.startsWith("--") && i !== budgetAt + 1) ?? null;

const deadline = Date.now() + budgetSec * 1000;
/* Vercel typically publishes a small Next site in 60-120s. Polling every 15s
 * costs at most a few dozen requests across the budget and keeps the cycle's
 * wall-clock honest — a publish that takes four minutes to appear is worth
 * knowing about even though it eventually succeeded. */
const INTERVAL_MS = 15_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(url, mustInclude) {
  try {
    // The apex redirects to www; following it keeps CAMPRALLY_SITE forgiving.
    const res = await fetch(url, { redirect: "follow", headers: { "cache-control": "no-cache" } });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    if (!mustInclude) return { ok: true, detail: `HTTP 200` };
    const body = await res.text();
    return body.includes(mustInclude)
      ? { ok: true, detail: "HTTP 200, expected content present" }
      : { ok: false, detail: "HTTP 200 but expected content missing (older deployment still serving)" };
  } catch (err) {
    return { ok: false, detail: `unreachable: ${err.message?.slice(0, 120)}` };
  }
}

const targets = [{ url: `${SITE}/`, mustInclude: null, label: "home" }];
if (slug) targets.push({ url: `${SITE}/blog/${slug}`, mustInclude: slug, label: slug });

let attempt = 0;
let last = [];

while (Date.now() < deadline) {
  attempt++;
  last = [];
  for (const t of targets) last.push({ ...t, ...(await probe(t.url, t.mustInclude)) });

  if (last.every((r) => r.ok)) {
    console.log(`deploy verified after ${attempt} attempt(s): ${last.map((r) => `${r.label} ${r.detail}`).join(" · ")}`);
    process.exit(0);
  }

  const remaining = Math.round((deadline - Date.now()) / 1000);
  if (remaining <= 0) break;
  console.log(`not live yet (${last.filter((r) => !r.ok).map((r) => `${r.label}: ${r.detail}`).join(", ")}) — ${remaining}s left`);
  await sleep(Math.min(INTERVAL_MS, deadline - Date.now()));
}

console.error(`deploy NOT verified after ${budgetSec}s: ${last.map((r) => `${r.label}: ${r.detail}`).join(" · ")}`);
process.exit(1);
