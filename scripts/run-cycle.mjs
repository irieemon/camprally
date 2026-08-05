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

/* Declared up here, not at the check itself: the pause-flag and dirty-tree
 * gates call finish() before step 2c is reached, and reading a `let` from its
 * temporal dead zone throws — even through typeof. */
let priceClaims = null;

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts }).trim();
}

/**
 * Fetch photographs for any referenced product that lacks one, then fold them
 * into the catalog.
 *
 * Called twice per cycle and a no-op both times unless there is actually a gap:
 * the script filters referenced ASINs against the ones already in
 * product-images.json and exits without touching the network when the set is
 * empty. Before the queue check it retries gaps a previous run was throttled
 * out of; after a publish it covers the ASINs that article just introduced,
 * which is the only point at which they become referenced.
 *
 * Never fatal. A product with no photo renders a branded icon tile, which is a
 * cosmetic loss; failing the cycle over it would trade that for a dead
 * pipeline. Amazon throttling is the common cause and it is transient, so the
 * next cycle simply picks up what this one missed.
 */
function backfillPhotos(when) {
  try {
    const out = sh("node", ["scripts/backfill-product-images.mjs"]);
    if (out) console.log(out);
    console.log(sh("node", ["scripts/build-catalog.mjs"]));
  } catch (err) {
    console.log(err.stdout ?? "");
    console.log(`(product photo backfill incomplete at ${when} — icon tiles until the next cycle)`);
  }
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
  const receipt = {
    startedAt, finishedAt: new Date().toISOString(), outcome,
    ...(typeof priceClaims === "string" ? { priceClaims } : {}),
    ...detail,
  };
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
      // product-images.json rides along: the maintenance backfill runs before
      // the queue check, so a cycle that ends idle or blocked can still have
      // recovered photos worth keeping.
      sh("git", ["add", "state/", "src/data/catalog.json", "src/data/product-images.json", "src/data/printables.json", "public/images/printables"]);
      if (sh("git", ["status", "--porcelain", "state/", "src/data/catalog.json", "src/data/product-images.json", "src/data/printables.json", "public/images/printables"])) {
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
// The gate exists to avoid clobbering a human's work-in-progress, so it must
// not trip on the pipeline's own outputs: state receipts, generated specs, and
// the price snapshot are all written by cycles (a --dry-run legitimately
// leaves a spec behind) and are committed by the publish step anyway. Before
// this exclusion, a dry-run wedged every real cycle that followed it.
const dirty = sh("git", ["status", "--porcelain", "--", ".", ":!state", ":!specs", ":!src/data/catalog.json", ":!src/data/product-images.json", ":!src/data/printables.json", ":!public/images/printables", ":!public/images/heroes"]);
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

// ── step 2b: refresh prices ───────────────────────────────────────────────
// Runs every cycle regardless of whether anything publishes, because stale
// prices are a problem on their own. src/data/catalog.json is committed below,
// so a refresh alone triggers a Vercel rebuild and the site shows current
// figures. Failure here is never fatal: pages fall back to the copy already in
// the article, which is exactly what they did before live pricing existed.
try {
  console.log(sh("node", ["scripts/refresh-prices.mjs"]));
} catch (err) {
  console.log(err.stdout ?? "");
  console.log("(price refresh did not complete — pages keep their existing figures)");
}

// ── step 2c: price-claim check ────────────────────────────────────────────
// Deliberately non-blocking. A frozen price is a correctness problem worth
// surfacing on every run, but wedging the publisher over one line of prose
// would trade a wrong number for a dead pipeline — the worse failure. The
// render layer already refuses to display anything but live prices, so this
// reports rather than gates.
priceClaims = "ok";
try {
  console.log(sh("node", ["scripts/check-price-claims.mjs"]));
} catch (err) {
  priceClaims = "frozen-price-claims";
  console.log(err.stdout ?? "");
  console.log("(frozen price claims found — see scripts/strip-prose-prices.mjs)");
}

// ── step 2d: retry any product photos an earlier cycle missed ─────────────
backfillPhotos("maintenance");

// ── step 2e: mirror the Gumroad printables ────────────────────────────────
// Vercel builds from git and cannot see the sibling printables repo, so the
// product list and cover art have to be committed here. Local-only and cheap;
// a missing sibling repo is the normal state elsewhere and leaves the committed
// copy alone. Never fatal — the site keeps showing whatever it last synced.
try {
  console.log(sh("node", ["scripts/sync-printables.mjs"]));
} catch (err) {
  console.log(err.stdout ?? "");
  console.log("(printables sync failed — site keeps the last synced product list)");
}

// ── step 3: pick the next unpublished queue item ──────────────────────────
const queueRaw = JSON.parse(readFileSync(`${ROOT}article-queue.json`, "utf8"));
const items = Array.isArray(queueRaw) ? queueRaw
  : queueRaw.articles ?? queueRaw.queue ?? queueRaw.items ?? [];
const published = readFileSync(`${ROOT}src/data/articles.ts`, "utf8");
const pending = items.filter((i) => i.slug && !published.includes(`slug: "${i.slug}"`));

if (!pending.length) {
  finish("idle", { reason: "queue-empty", queued: items.length }, EXIT.OK);
}

// Prefer whatever is ready to ship. Selecting purely by priority would wedge
// the pipeline permanently: the top-priority item has no spec, so every run
// would block on it while a finished article sat unpublished behind it.
// Priority orders the ready set; it does not gate it.
const hasSpec = (i) => existsSync(`${ROOT}specs/${i.slug}.json`);
const byPriority = (a, b) => {
  const rank = { high: 0, medium: 1, low: 2 };
  return (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3);
};

// Prefer something already specced; otherwise write one now. Discovery means a
// spec no longer requires a human to go shopping first, so "no spec" stopped
// being a reason to stop — it is just the next step.
const ready = pending.filter(hasSpec).sort(byPriority);
let next = ready[0];

if (!next) {
  const target = [...pending].sort(byPriority)[0];
  // heroKeyword is the queue's own description of what the article is about,
  // which is exactly the right search term. Fall back to the first keyword.
  const term = target.heroKeyword || target.keywords?.[0] || target.title;
  const cap = (target.title.match(/under\s*\$?\s*(\d+)/i) || [])[1];

  console.log(`\nno spec for ${target.slug} — generating one (term: "${term}"${cap ? `, under $${cap}` : ""})`);
  const args = ["scripts/write-article.mjs", target.slug, "--discover", term, "--count", "6"];
  if (cap) args.push("--max", cap);

  try {
    console.log(sh("node", args));
    next = hasSpec(target) ? target : null;
  } catch (err) {
    console.log(err.stdout ?? "");
    // Exit 2 from write-article means a transient limit (Canopy quota), not a
    // broken article. Defer so the next cycle retries instead of raising a
    // blocker that needs a human.
    if (err.status === EXIT.DEFER) {
      finish("deferred", {
        reason: "product-data-quota",
        slug: target.slug,
        message: "Canopy request quota exhausted — add pay-as-you-go or wait for the monthly reset.",
      }, EXIT.OK);
    }
    finish("blocked", {
      reason: "spec-generation-failed",
      slug: target.slug,
      message: `Could not generate a spec for ${target.slug}.\n${(err.stdout ?? err.message ?? "").slice(-900)}`,
    }, EXIT.FAIL);
  }
}

if (!next) {
  finish("blocked", {
    reason: "no-spec",
    pending: pending.length,
    message: "Spec generation reported success but produced no spec file.",
  }, EXIT.FAIL);
}

console.log(`\nnext up: ${next.slug} (${ready.length} ready of ${pending.length} pending)`);

if (DRY) {
  finish("idle", {
    reason: "dry-run", wouldPublish: next.slug,
    ready: ready.length, pending: pending.length,
  }, EXIT.OK);
}

const specPath = `${ROOT}specs/${next.slug}.json`;

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

// ── step 5b: photographs for the products this article just introduced ────
// Only reachable after a successful publish, which is the first moment those
// ASINs are referenced by the site and therefore in scope for the backfill.
backfillPhotos("publish");

// ── step 6: commit, and push so Vercel deploys ────────────────────────────
sh("git", ["add", "src/data/articles.ts", "src/data/heroes.ts", "src/data/article-sections.ts", "src/app/blog/[slug]/page.tsx", "state/asin-cache.json", "src/data/catalog.json", "src/data/product-images.json", "src/data/printables.json", "public/images/printables", "public/images/heroes", specPath]);
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
