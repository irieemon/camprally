#!/usr/bin/env node
/**
 * Keep prices current, independently of publishing.
 *
 *   node scripts/price-cycle.mjs              # refresh, validate, commit, push
 *   node scripts/price-cycle.mjs --no-push
 *   node scripts/price-cycle.mjs --dry-run
 *
 * WHY THIS IS NOT PART OF run-cycle: it used to be. Price refreshing was step
 * 2b of the publish cycle, which silently coupled two unrelated things — the
 * moment publishing stopped, prices stopped. And publishing stops for perfectly
 * ordinary reasons: the queue empties, the tree is dirty, a dead link blocks a
 * release. Every one of those left the site quietly serving ageing prices while
 * the receipts said "idle", which is exactly the kind of silent failure the
 * receipts exist to prevent.
 *
 * Correct prices are not a side effect of publishing. They are their own job,
 * with their own receipt, on their own schedule.
 *
 * Same output-forcing contract as run-cycle: every run writes exactly one
 * receipt to state/price-runs/<timestamp>.json.
 *
 *   refreshed   prices changed and were committed
 *   current     nothing was stale enough to re-price
 *   degraded    the price source failed; existing prices kept and still shown
 *   idle        paused
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";

const ROOT = new URL("..", import.meta.url).pathname;
const RUNS = `${ROOT}state/price-runs`;
const PAUSE = `${homedir()}/.openclaw/workspace/state/pause.flag`;

const DRY = process.argv.includes("--dry-run");
const PUSH = !process.argv.includes("--no-push");
const startedAt = new Date().toISOString();
const stamp = startedAt.replace(/[:.]/g, "-");

const PIPES = ["ignore", "pipe", "pipe"];
const sh = (cmd, args) =>
  execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: PIPES }).trim();
function run(args) {
  try {
    return { code: 0, out: execFileSync("node", args, { cwd: ROOT, encoding: "utf8", stdio: PIPES }) };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/**
 * Write the receipt, then commit it together with whatever the run changed.
 *
 * Receipt first, commit second, both inside one exit path — the first cut
 * committed in a separate step before finish() wrote the receipt, so every
 * receipt landed untracked and the repo never recorded that prices had been
 * checked. A heartbeat nobody can see is not a heartbeat.
 */
function finish(outcome, detail, code = 0) {
  const receipt = { startedAt, finishedAt: new Date().toISOString(), outcome, ...detail };
  if (!DRY) {
    mkdirSync(RUNS, { recursive: true });
    writeFileSync(`${RUNS}/${stamp}.json`, JSON.stringify(receipt, null, 2) + "\n");
    writeFileSync(`${ROOT}state/last-price-run.json`, JSON.stringify(receipt, null, 2) + "\n");

    const paths = ["state/", "src/data/catalog.json"];
    try {
      sh("git", ["add", ...paths]);
      if (sh("git", ["status", "--porcelain", ...paths])) {
        sh("git", ["commit", "-m",
          `chore(prices): ${outcome} — ${detail.displayable ?? "?"}/${detail.products ?? "?"} products with a current price`]);
        receipt.commit = sh("git", ["rev-parse", "--short", "HEAD"]);
        if (PUSH) sh("git", ["push", "origin", "HEAD"]);
      }
    } catch (err) {
      // Never let a git failure mask the price outcome it was reporting.
      console.error(`(receipt commit failed, continuing: ${err.message?.slice(0, 160)})`);
    }
  }
  console.log(`\n=== ${outcome.toUpperCase()} ===`);
  console.log(JSON.stringify(receipt, null, 2));
  process.exit(code);
}

// ── step 0: pause flag ────────────────────────────────────────────────────
if (existsSync(PAUSE)) {
  finish("idle", { reason: "paused", message: readFileSync(PAUSE, "utf8").trim() });
}

// ── step 1: refresh ───────────────────────────────────────────────────────
// refresh-prices regenerates the catalog itself, so the catalog is current
// whether or not anything needed re-pricing.
const refresh = run(["scripts/refresh-prices.mjs"]);
console.log(refresh.out);
// Exit 2 (DEFER) means the source is unavailable — a degraded run, not a
// failure. Existing prices stay live and keep rendering until they age out.
const degraded = refresh.code !== 0;

// ── step 2: validate ──────────────────────────────────────────────────────
const check = run(["scripts/check-price-claims.mjs"]);
console.log(check.out);
const priceClaims = check.code === 0 ? "ok" : "frozen-price-claims";

const catalog = JSON.parse(readFileSync(`${ROOT}src/data/catalog.json`, "utf8")).products ?? {};
const products = Object.values(catalog);
const priced = products.filter((p) => p.price && p.priceAsOf);
const cutoff = Date.now() - 10 * 24 * 60 * 60 * 1000;
const displayable = priced.filter((p) => Date.parse(p.priceAsOf) >= cutoff).length;

if (DRY) {
  finish("current", { reason: "dry-run", products: products.length, priced: priced.length, displayable, priceClaims });
}

// ── step 3: record (finish commits the receipt alongside any price changes) ─
/* Did any price actually move? The receipt itself changes every run, so asking
 * "was there a commit" would report every run as a refresh and make a stuck
 * price source indistinguishable from a quiet week. Ask the catalog instead. */
const catalogChanged = Boolean(sh("git", ["status", "--porcelain", "src/data/catalog.json"]));

finish(
  degraded ? "degraded" : catalogChanged ? "refreshed" : "current",
  {
    ...(degraded ? { reason: "price-source-unavailable" } : {}),
    products: products.length,
    priced: priced.length,
    displayable,
    stale: priced.length - displayable,
    priceClaims,
  },
);
