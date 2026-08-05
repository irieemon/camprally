#!/usr/bin/env node
/**
 * Turn a run receipt into one line a phone can display.
 *
 *   node scripts/announce-run.mjs                          # state/last-run.json
 *   node scripts/announce-run.mjs state/last-price-run.json
 *   node scripts/announce-run.mjs --max-age 1800
 *
 * The crons announce their command's stdout straight to Telegram, and that
 * stdout is a build log: git push porcelain, `=== PUBLISHED ===` banners, and a
 * pretty-printed JSON receipt, with ANSI colour codes from `next build` in the
 * failure cases. Twenty lines of that arrives on a phone as noise, and noise is
 * how a channel stops being read — which costs far more than it looks, because
 * this is the same channel the blocker alerts use.
 *
 * TELEGRAM.md sets the house format and this obeys it: one of the five tags,
 * plain text, no markdown (it renders inconsistently across TG clients), short
 * enough to read on a lock screen, and actionable or not worth sending.
 *
 * The receipt is the input, not the console output, so the message says what
 * the run DECIDED rather than what it happened to print last.
 */

import { readFileSync, existsSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const receiptPath = args.find((a) => !a.startsWith("--")) ?? `${ROOT}state/last-run.json`;
/* A receipt older than this means the run under way never recorded one. Fifteen
 * minutes clears a slow cycle — the publish path waits up to five minutes on
 * the deploy alone — without being long enough to mistake yesterday's success
 * for today's. */
const maxAgeSec = Number(args[args.indexOf("--max-age") + 1]) || 900;

const say = (s) => { console.log(s.replace(/\s+/g, " ").trim()); process.exit(0); };
const quote = (s) => (s ? `"${s}"` : "");

if (!existsSync(receiptPath)) {
  say(`⚠️ ERROR: the cycle recorded no outcome at all — ${receiptPath} is missing. The run failed before it could write a receipt.`);
}

const r = JSON.parse(readFileSync(receiptPath, "utf8"));
const ageSec = (Date.now() - Date.parse(r.finishedAt ?? r.startedAt)) / 1000;

/* Guard against announcing a stale receipt.
 *
 * Without this the failure mode is the worst kind: run-cycle dies before
 * finish(), the previous receipt is still on disk, and Telegram cheerfully
 * reports the LAST run's success as though it were this one's. Silence would be
 * better than that, and this is better than silence. */
if (ageSec > maxAgeSec) {
  say(
    `⚠️ ERROR: this run produced no receipt — the newest is ${Math.round(ageSec / 60)}m old ` +
    `(${r.outcome}). The cycle crashed before recording an outcome. Check state/cycle.err.log`,
  );
}

// ── the publishing cycle ──────────────────────────────────────────────────
if (r.outcome === "published") {
  say(`✅ DONE: published ${quote(r.slug)} — confirmed live on the site. ${r.remaining ?? "?"} left in the queue.`);
}

if (r.outcome === "published-unverified") {
  say(
    `⚠️ ERROR: published ${quote(r.slug)} (commit ${r.commit}) but it never appeared on the site. ` +
    `Vercel's build may have failed — the site is still serving the previous version. Check the Vercel dashboard.`,
  );
}

if (r.stalledSince) {
  say(
    `🚨 BLOCKER: nothing has published in ${r.runsSincePublish} consecutive runs ` +
    `(${(r.stalledReasons ?? []).join(", ") || r.reason}). The pipeline is running but not producing. Needs a decision.`,
  );
}

if (r.outcome === "blocked") {
  // Each reason gets its own sentence because the fix differs, and "blocked" on
  // its own tells nobody what to do.
  const detail = {
    "content-review": `the safety review rejected ${quote(r.slug)} (attempt ${r.attempts}/2). Draft quarantined; the next run rewrites it. No action needed unless it repeats.`,
    "dead-links": "confirmed dead affiliate links. Publishing is held until they are fixed — run scripts/verify-asins.mjs",
    "working-tree-dirty": "uncommitted changes in the repo. Commit or stash them; the cycle refuses to run over someone's work.",
    "publish-failed": `the build failed for ${quote(r.slug)} and everything was rolled back. Nothing shipped.`,
    "push-failed": `${quote(r.slug)} is committed locally (${r.commit}) but the push failed. The site will not update until it lands.`,
    "spec-generation-failed": `could not write ${quote(r.slug)}.`,
    "no-spec": "spec generation reported success but produced no file.",
  }[r.reason] ?? `${r.reason}.`;
  say(`⚠️ ERROR: cycle blocked — ${detail}`);
}

if (r.outcome === "deferred") {
  say(`📊 STATUS: cycle deferred — ${r.reason === "product-data-quota" ? "product data quota is exhausted; discovery resumes on the 1st" : r.reason}. Retrying next cycle.`);
}

if (r.outcome === "idle") {
  const detail = {
    "queue-empty": `the article queue is empty (${r.queued ?? 0} total). Nothing left to publish — add topics to article-queue.json.`,
    paused: "paused. Nothing will publish until the pause flag is cleared.",
    "already-running": "another cycle was still running, so this one stood down.",
    "dry-run": `dry run — would publish ${quote(r.wouldPublish)}.`,
  }[r.reason] ?? `${r.reason}.`;
  say(`📊 STATUS: cycle idle — ${detail}`);
}

// ── the price cycle ───────────────────────────────────────────────────────
if (r.outcome === "refreshed" || r.outcome === "current") {
  const claims = r.priceClaims && r.priceClaims !== "ok" ? ` Frozen price claims found — see check-price-claims.` : "";
  say(`📊 STATUS: prices ${r.outcome} — ${r.priced}/${r.products} products priced, ${r.displayable} displayable, ${r.stale} stale.${claims}`);
}

if (r.outcome === "degraded") {
  say(`⚠️ ERROR: price refresh degraded — ${r.stale} of ${r.products} products have stale prices and will render "Check price" instead of a figure.`);
}

// Unknown outcome. Say so plainly rather than inventing a shape for it — a new
// outcome that announces itself as unrecognised is a bug report; one that gets
// silently dropped is a blind spot.
say(`📊 STATUS: cycle finished with an unrecognised outcome "${r.outcome}" — ${r.reason ?? ""} (announce-run.mjs needs a case for it).`);
