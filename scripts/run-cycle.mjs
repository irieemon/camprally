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
 *   published              an article was committed, pushed, and confirmed live
 *   published-unverified   committed and pushed, but the origin never served it
 *   blocked                something stopped us, with a named reason
 *   deferred               transient (Amazon throttling) — retry later
 *   idle                   nothing to do, recorded explicitly
 *
 * This exists because of what the old loop did. Between 2026-04-16 and
 * 2026-06-05 it ran repeatedly and published nothing, logging "clean cycle,
 * no changes needed" and "maintenance / heartbeat" while 16 writable articles
 * sat in the queue and 40% of the site's affiliate links were dead. It graded
 * its own homework and always passed. A receipt every run makes that
 * impossible to hide: no receipt means the host is dead, and a receipt that
 * says "blocked" for days is visible in a way that silence never was.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { EXIT } from "./lib/amazon.mjs";
import { acquire } from "./lib/run-lock.mjs";
import { sinceLastPublish } from "./lib/run-history.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const RUNS = `${ROOT}state/runs`;
const BLOCKERS = `${ROOT}state/blockers.md`;
const LOCK = `${ROOT}state/cycle.lock`;
const QUARANTINE = `${ROOT}specs/quarantine`;
const SKIPS = `${ROOT}state/content-skips.json`;
const PAUSE = `${homedir()}/.openclaw/workspace/state/pause.flag`;

/* Runs that end without publishing are individually legitimate and collectively
 * a dead pipeline. Six was two full days at three cycles a day — long enough
 * that a throttling spell or a same-day queue top-up passes unremarked, short
 * enough that nobody discovers the silence four months later.
 *
 * The cadence dropped to one run a day on 2026-08-09, which turned those same
 * six runs into six days. The threshold is a promise about WALL-CLOCK silence,
 * not about run counts — run counts were only ever a proxy for it — so it moves
 * to 3 to keep roughly the two-to-three day promise the number was chosen for.
 * Keep this in step with the cron schedule and with STALE_HOURS in
 * .github/scripts/liveness.mjs, which is coupled to the same cadence. */
const STALL_AFTER_RUNS = 3;

/* Two rejected drafts of the same article is enough. The model gets a second
 * attempt because regeneration is cheap and often lands clean, but a topic it
 * cannot write safely twice is a topic a human should look at, and the queue
 * has to keep moving in the meantime. */
const MAX_CONTENT_ATTEMPTS = 2;

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
  } catch (err) {
    console.log(err.stdout ?? "");
    console.log(`(product photo backfill incomplete at ${when} — icon tiles until the next cycle)`);
  }
  // OUTSIDE the try, on purpose: a throttled PHOTO scrape must never block
  // PRICES from publishing. When both sat in one block, best-camping-socks
  // shipped 2026-08-18 with its six products absent from catalog.json
  // entirely — no prices AND no images — instead of the intended fallback of
  // fresh prices with icon tiles. A build-catalog failure is its own event
  // and still ends the cycle loudly.
  console.log(sh("node", ["scripts/build-catalog.mjs"]));
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
function finish(outcome, detail, code, { commit = true } = {}) {
  /* Stall escalation.
   *
   * `deferred` and `idle` exit 0 by design — one throttled run or one empty
   * queue is not a failure, and treating it as one would page someone daily.
   * But nothing was summing them, so an unbroken month of them read exactly
   * like an unbroken month of health. Past the threshold the exit code flips,
   * which is all the cron needs to start alerting: it already pages after two
   * consecutive failures.
   *
   * A deliberate pause is excluded inside sinceLastPublish — pausing the
   * pipeline should not page the person who paused it. */
  /* An EXHAUSTED QUEUE is not a stall, it is a request, and it gets the exit
   * code immediately rather than after STALL_AFTER_RUNS.
   *
   * The distinction is whether waiting can fix it. A throttled discovery call
   * or a dirty tree resolves on its own, so counting runs before escalating is
   * right — it absorbs the noise. An empty queue resolves only when a human
   * writes briefs, so every run spent waiting is a run guaranteed to publish
   * nothing. The queue is hand-curated, and on 2026-08-09 it reached its last
   * item; the next run would have exited 0, turned the cron green and gone
   * silent on Telegram at the exact moment the site stopped publishing.
   *
   * Two runs at three-a-day is a Telegram alert the same afternoon, against two
   * days under the stall counter. */
  if (!DRY && outcome === "idle" && detail.reason === "queue-empty") {
    code = EXIT.FAIL;
    detail = { ...detail, needs: "briefs — article-queue.json has no unpublished items left" };
  }

  let stalledRuns;
  if (!DRY && (outcome === "deferred" || outcome === "idle") && detail.reason !== "paused") {
    const { runs, reasons } = sinceLastPublish(RUNS);
    stalledRuns = runs + 1; // this run is not on disk yet
    if (stalledRuns >= STALL_AFTER_RUNS) {
      code = EXIT.FAIL;
      detail = {
        ...detail,
        stalledSince: `${stalledRuns} consecutive runs without publishing`,
        stalledReasons: [...new Set([detail.reason, ...reasons].filter(Boolean))],
      };
    }
  }

  /* Strip terminal colour codes before anything is recorded.
   *
   * `next build` writes ANSI escapes, and its output is captured verbatim into
   * detail.message on a failed publish — so a receipt carried 32 of them, and
   * they flowed on into blockers.md and out to Telegram, where they render as
   * literal garbage around the one line that actually explains the failure.
   * Colour is for a terminal; none of these three destinations is one. */
  if (typeof detail.message === "string") {
    // eslint-disable-next-line no-control-regex
    detail = { ...detail, message: detail.message.replace(/\[[0-9;]*[A-Za-z]/g, "") };
  }

  const receipt = {
    startedAt, finishedAt: new Date().toISOString(), outcome,
    ...(typeof priceClaims === "string" ? { priceClaims } : {}),
    ...(stalledRuns ? { runsSincePublish: stalledRuns } : {}),
    ...detail,
  };
  if (!DRY) {
    mkdirSync(RUNS, { recursive: true });
    const receiptPath = `${RUNS}/${stamp}.json`;
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
    writeFileSync(`${ROOT}state/last-run.json`, JSON.stringify(receipt, null, 2) + "\n");
    // A stall is recorded here too. It is not a "blocked" outcome, but it needs
    // a human exactly as much as one does, and this file is where a human looks.
    if (outcome === "blocked" || detail.stalledSince) {
      appendFileSync(
        BLOCKERS,
        `\n## ${startedAt} — ${detail.stalledSince ? `stalled: ${detail.reason}` : detail.reason}\n\n` +
        `${detail.stalledSince ? `${detail.stalledSince} (reasons: ${detail.stalledReasons.join(", ")})\n\n` : ""}` +
        `${detail.message ?? ""}\n`,
      );
    }
    // Best-effort heartbeat commit. Never let this failure mask the real
    // outcome — a heartbeat that changes the exit code is worse than none.
    //
    // Suppressed when another cycle holds the lock: this function runs on every
    // exit path including that one, and committing from underneath a run that is
    // mid-publish is the exact interleaving the lock exists to prevent. The
    // receipt above is still written, so the run is not invisible — it simply
    // does not touch git, and the holder's own heartbeat carries the push.
    if (!commit) console.log("(heartbeat commit skipped — another cycle holds the lock)");
    else try {
      // product-images.json rides along: the maintenance backfill runs before
      // the queue check, so a cycle that ends idle or blocked can still have
      // recovered photos worth keeping.
      // specs/quarantine rides along so a rejected draft is preserved off the
      // machine. It is the evidence for why a slug stopped publishing, and it is
      // useless if it only ever exists on the Mac that rejected it.
      const heartbeatPaths = ["state/", "specs/quarantine", "src/data/catalog.json", "src/data/product-images.json", "src/data/printables.json", "public/images/printables", "src/data/merch.json", "public/images/merch"];
      sh("git", ["add", ...heartbeatPaths]);
      if (sh("git", ["status", "--porcelain", ...heartbeatPaths])) {
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

// ── step 0b: single-holder lock ───────────────────────────────────────────
// Checked after the pause flag so a paused pipeline still answers "paused"
// rather than "busy", and before anything touches the tree.
if (!DRY) {
  const lock = acquire(LOCK);
  if (!lock.ok) {
    // Not a failure: the previous cycle is still working. Exit 0 so the cron
    // does not treat healthy overlap as an incident.
    finish("idle", {
      reason: "already-running",
      message: `Another cycle holds the lock (${lock.reason}).`,
    }, EXIT.OK, { commit: false });
  }
}

// ── step 1: clean tree ────────────────────────────────────────────────────
// The gate exists to avoid clobbering a human's work-in-progress, so it must
// not trip on the pipeline's own outputs: state receipts, generated specs, and
// the price snapshot are all written by cycles (a --dry-run legitimately
// leaves a spec behind) and are committed by the publish step anyway. Before
// this exclusion, a dry-run wedged every real cycle that followed it.
const dirty = sh("git", ["status", "--porcelain", "--", ".", ":!state", ":!specs", ":!src/data/catalog.json", ":!src/data/product-images.json", ":!src/data/printables.json", ":!public/images/printables", ":!src/data/merch.json", ":!public/images/merch", ":!public/images/heroes"]);
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

// ── step 2f: mirror the Printify merch ────────────────────────────────────
// Same contract as the printables above. The card art is fetched from Printify
// only when the ledger says a design's artwork or chest logo changed, so the
// usual run costs no API call and works with no token at all.
try {
  console.log(sh("node", ["scripts/sync-merch.mjs"]));
} catch (err) {
  console.log(err.stdout ?? "");
  console.log("(merch sync failed — site keeps the last synced product list)");
}

// ── step 3: pick the next unpublished queue item ──────────────────────────
const queueRaw = JSON.parse(readFileSync(`${ROOT}article-queue.json`, "utf8"));
const items = Array.isArray(queueRaw) ? queueRaw
  : queueRaw.articles ?? queueRaw.queue ?? queueRaw.items ?? [];
const published = readFileSync(`${ROOT}src/data/articles.ts`, "utf8");

/* Slugs the content review has rejected too many times.
 *
 * Without this the pipeline wedges on its own safety gate: a quarantined spec
 * is regenerated next run, rejected again, and the queue never advances past
 * the one topic the model cannot write safely. Skipping keeps the other eleven
 * articles shipping while the bad one waits for a human. */
const skips = existsSync(SKIPS) ? JSON.parse(readFileSync(SKIPS, "utf8")) : {};
const exhausted = new Set(
  Object.entries(skips).filter(([, v]) => (v.attempts ?? 0) >= MAX_CONTENT_ATTEMPTS).map(([slug]) => slug),
);

const pending = items.filter((i) =>
  i.slug && !published.includes(`slug: "${i.slug}"`) && !exhausted.has(i.slug));

if (exhausted.size) {
  console.log(`(skipping ${exhausted.size} slug(s) held by content review: ${[...exhausted].join(", ")})`);
}

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
      /* write-article names its own deferral, because there is now more than one
       * kind and they need different responses: a Canopy quota is out until the
       * 1st of the month, while an overloaded model is usually fine by the next
       * cycle. Defaulting to the quota kept the old behaviour when no marker is
       * printed. */
      const named = (err.stdout ?? "").match(/^deferring:\s*([a-z0-9-]+)/mi)?.[1];
      const reason = named ?? "product-data-quota";
      finish("deferred", {
        reason,
        slug: target.slug,
        message: reason === "model-overloaded"
          ? "MiniMax was overloaded across three attempts. Transient — the next cycle retries."
          : "Canopy request quota exhausted — add pay-as-you-go or wait for the monthly reset.",
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

// ── step 4b: content review ───────────────────────────────────────────────
// The last gate that reads what the article actually says. Everything before
// it checks that the machinery is sound — links resolve, prices are fresh, the
// build compiles — and none of that would notice an article recommending a
// propane heater inside a tent.
//
// A rejection quarantines the spec rather than stopping the cycle. The run
// still ends blocked, so it is recorded and alertable, but the draft is moved
// aside and the slug's attempt count goes up; the next cycle regenerates it, and
// after MAX_CONTENT_ATTEMPTS the queue moves on without it. A safety gate that
// halts publishing forever gets switched off by whoever is on call, which is
// the one outcome worse than not having it.
let reviewOut = "";
try {
  reviewOut = sh("node", ["scripts/review-article.mjs", specPath]);
  console.log(reviewOut);
} catch (err) {
  reviewOut = `${err.stdout ?? ""}${err.stderr ?? ""}`;
  console.log(reviewOut);

  const attempts = (skips[next.slug]?.attempts ?? 0) + 1;
  skips[next.slug] = { attempts, lastAt: new Date().toISOString(), findings: reviewOut.slice(-1200) };
  writeFileSync(SKIPS, JSON.stringify(skips, null, 2) + "\n");

  mkdirSync(QUARANTINE, { recursive: true });
  renameSync(specPath, `${QUARANTINE}/${next.slug}-${stamp}.json`);

  finish("blocked", {
    reason: "content-review",
    slug: next.slug,
    attempts,
    message:
      `Content review rejected ${next.slug} (attempt ${attempts} of ${MAX_CONTENT_ATTEMPTS}).\n` +
      `Spec quarantined to specs/quarantine/${next.slug}-${stamp}.json\n\n${reviewOut.slice(-1200)}`,
  }, EXIT.FAIL);
}

// ── step 4c: internal-link check ──────────────────────────────────────────
// Blocking, and deliberately so: an article whose closing "related guides" line
// points at /blog/slugs-that-do-not-exist sends every reader who clicks to a
// 404, and unlike a dead affiliate link it leaves no trace anywhere — the build
// passes, the deploy verifies, the receipt says published. That is how 21 of 21
// trailers on this site came to be hallucinated slugs before anyone noticed.
//
// It reuses the content-review quarantine path rather than halting: the draft is
// moved aside, the attempt count goes up, and the next cycle regenerates it from
// the closed list of real slugs the writer prompt now supplies. Blocking a
// publish this way should be rare — this is the backstop, not the fix.
try {
  console.log(sh("node", ["scripts/check-internal-links.mjs", specPath]));
} catch (err) {
  const out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
  console.log(out);

  const attempts = (skips[next.slug]?.attempts ?? 0) + 1;
  skips[next.slug] = { attempts, lastAt: new Date().toISOString(), findings: out.slice(-1200) };
  writeFileSync(SKIPS, JSON.stringify(skips, null, 2) + "\n");

  mkdirSync(QUARANTINE, { recursive: true });
  renameSync(specPath, `${QUARANTINE}/${next.slug}-${stamp}.json`);

  finish("blocked", {
    reason: "internal-links",
    slug: next.slug,
    attempts,
    message:
      `Dead internal links in ${next.slug} (attempt ${attempts} of ${MAX_CONTENT_ATTEMPTS}).\n` +
      `Spec quarantined to specs/quarantine/${next.slug}-${stamp}.json\n\n${out.slice(-1200)}`,
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

// ── step 5b: photographs for the products this article just introduced ────
// Only reachable after a successful publish, which is the first moment those
// ASINs are referenced by the site and therefore in scope for the backfill.
backfillPhotos("publish");

// ── step 6: commit, and push so Vercel deploys ────────────────────────────
sh("git", ["add", "src/data/articles.ts", "src/data/heroes.ts", "src/data/article-sections.ts", "src/app/blog/[slug]/page.tsx", "state/asin-cache.json", "src/data/catalog.json", "src/data/product-images.json", "src/data/printables.json", "public/images/printables", "src/data/merch.json", "public/images/merch", "public/images/heroes", specPath]);
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

// ── step 7: confirm the deploy is actually serving ────────────────────────
// A push is not a deploy. Vercel rebuilds on its own machine and, when that
// build fails, keeps serving the previous one — so every local signal says
// "published" while the article does not exist. Asking the origin is the only
// way to tell the difference.
//
// Never downgraded to a failure: the commit is good, the push succeeded, and a
// deploy that is merely slow will land on its own. The outcome records which
// of the two happened so a run of `published-unverified` receipts is visible
// rather than being quietly indistinguishable from success.
let deployVerified = false;
let deployDetail = "not checked (--no-push)";
if (pushed) {
  try {
    deployDetail = sh("node", ["scripts/verify-deploy.mjs", next.slug]);
    deployVerified = true;
  } catch (err) {
    deployDetail = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim().slice(-400);
  }
  console.log(deployDetail);
}

finish(pushed && !deployVerified ? "published-unverified" : "published", {
  slug: next.slug, commit: sha, pushed,
  deployVerified, deploy: deployDetail,
  remaining: pending.length - 1,
}, EXIT.OK);
