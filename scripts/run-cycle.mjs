#!/usr/bin/env node
/**
 * One autonomous publishing cycle. Tier 3 — output forcing.
 *
 *   node scripts/run-cycle.mjs                 # full cycle, commits and pushes
 *   node scripts/run-cycle.mjs --no-push       # commit locally only
 *   node scripts/run-cycle.mjs --dry-run       # decide and report, change nothing
 *
 * THE RULE: every run ends in exactly one recorded outcome, written to
 * state/runs/<timestamp>.json. There is no silent success and no "nothing
 * needed" that leaves no trace.
 *
 *   published  an article was committed
 *   blocked    something stopped us, with a named reason
 *   deferred   transient (Amazon throttling) — retry later, not a failure
 *   idle       queue genuinely empty, recorded explicitly
 *
 * This exists because of what the old loop did. Between 2026-04-16 and
 * 2026-06-05 it ran repeatedly and published nothing, logging "clean cycle,
 * no changes needed" and "maintenance / heartbeat" while 16 writable articles
 * sat in the queue and 40% of the site's affiliate links were dead. It graded
 * its own homework and always passed. A receipt every run makes that
 * impossible to hide: no receipt means the host is dead, and a receipt that
 * says "blocked" for days is visible in a way that silence never was.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { EXIT } from "./lib/amazon.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const RUNS = `${ROOT}state/runs`;
const BLOCKERS = `${ROOT}state/blockers.md`;
const PAUSE = `${homedir()}/.openclaw/workspace/state/pause.flag`;

const DRY = process.argv.includes("--dry-run");
const PUSH = !process.argv.includes("--no-push");

const startedAt = new Date().toISOString();
const stamp = startedAt.replace(/[:.]/g, "-");

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts }).trim();
}

/**
 * Record the outcome and exit. This is the only way this script terminates.
 *
 * The receipt is committed and pushed on EVERY outcome, not just successful
 * publishes. That is deliberate: it makes the repo itself the heartbeat.
 * Without it, "blocked for six days" and "the Mac has been off for six days"
 * both look like an absence of commits, and those need different responses.
 * With it, Tier 4 can tell them apart — stale receipts mean the host is gone,
 * fresh receipts saying "blocked" mean the host is alive and stuck.
 */
function finish(outcome, detail, code) {
  const receipt = { startedAt, finishedAt: new Date().toISOString(), outcome, ...detail };
  if (!DRY) {
    mkdirSync(RUNS, { recursive: true });
    const receiptPath = `${RUNS}/${stamp}.json`;
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
    writeFileSync(`${ROOT}state/last-run.json`, JSON.stringify(receipt, null, 2) + "\n");
    if (outcome === "blocked") {
      appendFileSync(BLOCKERS, `\n## ${startedAt} — ${detail.reason}\n\n${detail.message ?? ""}\n`);
    }
    // Best-effort heartbeat commit. Never let this failure mask the real
    // outcome — a heartbeat that changes the exit code is worse than none.
    try {
      sh("git", ["add", "state/"]);
      if (sh("git", ["status", "--porcelain", "state/"])) {
        sh("git", ["commit", "-m", `chore(heartbeat): ${outcome} — ${detail.reason ?? detail.slug ?? ""}`.trim()]);
        if (PUSH) sh("git", ["push", "origin", "HEAD"]);
      }
    } catch (err) {
      console.error(`(heartbeat commit failed, continuing: ${err.message?.slice(0, 160)})`);
    }
  }
  console.log(`\n=== ${outcome.toUpperCase()} ===`);
  console.log(JSON.stringify(receipt, null, 2));
  process.exit(code);
}

// ── step 0: pause flag ────────────────────────────────────────────────────
if (existsSync(PAUSE)) {
  finish("idle", { reason: "paused", message: readFileSync(PAUSE, "utf8").trim() }, EXIT.OK);
}

// ── step 1: clean tree ────────────────────────────────────────────────────
const dirty = sh("git", ["status", "--porcelain"]);
if (dirty) {
  finish("blocked", {
    reason: "working-tree-dirty",
    message: `Refusing to run with uncommitted changes:\n${dirty}`,
  }, EXIT.FAIL);
}

// ── step 2: link health gate ──────────────────────────────────────────────
// Refresh the stalest few ASINs. A confirmed dead link blocks publishing —
// adding article N+1 while existing links are broken is filling a leaking bucket.
let refreshCode = 0;
try {
  console.log(sh("node", ["scripts/refresh-asins.mjs"]));
} catch (err) {
  refreshCode = err.status ?? 1;
  console.log(err.stdout ?? "");
}
if (refreshCode === EXIT.FAIL) {
  finish("blocked", {
    reason: "dead-links",
    message: "refresh-asins found confirmed dead affiliate links. Fix before publishing more.",
  }, EXIT.FAIL);
}
// refreshCode === DEFER just means Amazon throttled; publishing from cache is fine.

// ── step 3: pick the next unpublished queue item ──────────────────────────
const queueRaw = JSON.parse(readFileSync(`${ROOT}article-queue.json`, "utf8"));
const items = Array.isArray(queueRaw) ? queueRaw
  : queueRaw.articles ?? queueRaw.queue ?? queueRaw.items ?? [];
const published = readFileSync(`${ROOT}src/data/articles.ts`, "utf8");
const pending = items.filter((i) => i.slug && !published.includes(`slug: "${i.slug}"`));

if (!pending.length) {
  finish("idle", { reason: "queue-empty", queued: items.length }, EXIT.OK);
}

const next = pending.find((i) => i.priority === "high") ?? pending[0];
console.log(`\nnext up: ${next.slug} (${pending.length} pending)`);

if (DRY) {
  finish("idle", { reason: "dry-run", wouldPublish: next.slug, pending: pending.length }, EXIT.OK);
}

// ── step 4: a spec must already exist ─────────────────────────────────────
// write-article.mjs needs a verified product set, which needs ASINs confirmed
// live — and that is rate-limited. So spec generation is a separate, human- or
// cron-triggered step; this cycle publishes specs that are ready.
const specPath = `${ROOT}specs/${next.slug}.json`;
if (!existsSync(specPath)) {
  finish("blocked", {
    reason: "no-spec",
    slug: next.slug,
    message:
      `No spec for ${next.slug}. Generate one:\n` +
      `  node scripts/refresh-asins.mjs --all --limit 6   # verify candidate ASINs\n` +
      `  node scripts/write-article.mjs ${next.slug} --products <asins>`,
  }, EXIT.FAIL);
}

// ── step 5: publish (gated on cached-live links + a passing build) ────────
let pubCode = 0, pubOut = "";
try {
  pubOut = sh("node", ["scripts/publish-article.mjs", specPath]);
} catch (err) {
  pubCode = err.status ?? 1;
  pubOut = `${err.stdout ?? ""}${err.stderr ?? ""}`;
}
console.log(pubOut);

if (pubCode === EXIT.DEFER) {
  finish("deferred", {
    reason: "asins-unconfirmed",
    slug: next.slug,
    message: "Amazon throttled; product ASINs not yet confirmed live. Retry later.",
  }, EXIT.OK);
}
if (pubCode !== EXIT.OK) {
  finish("blocked", { reason: "publish-failed", slug: next.slug, message: pubOut.slice(-1200) }, EXIT.FAIL);
}

// ── step 6: commit, and push so Vercel deploys ────────────────────────────
sh("git", ["add", "src/data/articles.ts", "src/app/blog/[slug]/page.tsx", "state/asin-cache.json", specPath]);
sh("git", ["commit", "-m",
  `Publish ${next.slug}\n\n` +
  `Generated from specs/${next.slug}.json. All affiliate ASINs verified live\n` +
  `against the cache before publishing; build passed.\n\n` +
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`]);
const sha = sh("git", ["rev-parse", "--short", "HEAD"]);

let pushed = false;
if (PUSH) {
  try { sh("git", ["push", "origin", "HEAD"]); pushed = true; }
  catch (err) {
    finish("blocked", {
      reason: "push-failed", slug: next.slug, commit: sha,
      message: `Committed locally but push failed:\n${err.stderr ?? err.message}`,
    }, EXIT.FAIL);
  }
}

finish("published", {
  slug: next.slug, commit: sha, pushed,
  remaining: pending.length - 1,
}, EXIT.OK);
