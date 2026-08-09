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

import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const SITE = process.env.CAMPRALLY_SITE ?? "https://www.camprally.co";

const args = process.argv.slice(2);
const budgetAt = args.indexOf("--budget");
/* 600s, raised from 300s on 2026-08-09 after labor-day-camping-weekend-guide
 * was recorded `published-unverified` and then went live 30 seconds later.
 *
 * 300s was measured against a quiet queue. It is too tight when a build is
 * already running — this cycle pushed on the heels of the 18:00 heartbeat
 * commit, so the publish sat queued behind another build before it started.
 * A false `published-unverified` is expensive out of proportion to the wait:
 * it is the outcome the off-machine watchdog escalates on, so crying wolf here
 * trains everyone to ignore the one signal that catches a genuinely failed
 * Vercel build still serving the last good deployment. Ten minutes of polling
 * costs a few dozen HEAD requests and one idle cron slot. */
const budgetSec = Number(args[budgetAt + 1]) || 600;
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

/**
 * The commit this machine expects to see serving.
 *
 * Null outside a git checkout, which downgrades the whole check to the old
 * content probe rather than failing — verification getting weaker is survivable,
 * verification getting stuck is not.
 */
function localHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/**
 * Does the live build already contain our commit?
 *
 * An exact match is the common case. The ancestor test covers the queued-push
 * race: if two commits land close together Vercel may build only the later one,
 * and a strict equality check would then poll until the budget expired and cry
 * failure over a deploy that shipped our change. If our commit is an ancestor
 * of what is live, what is live includes it.
 */
function contains(servedSha, ourSha) {
  if (!servedSha || !ourSha) return false;
  if (servedSha === ourSha) return true;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ourSha, servedSha], { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch {
    // Non-zero means "not an ancestor", but it also means "commit unknown here"
    // — a build from a commit this checkout has never seen. Neither is ours.
    return false;
  }
}

async function servedCommit() {
  try {
    const res = await fetch(`${SITE}/`, { redirect: "follow", headers: { "cache-control": "no-cache" } });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const html = await res.text();
    const m = html.match(/<meta name="build-commit" content="([^"]*)"/);
    return { sha: m?.[1] ?? null };
  } catch (err) {
    return { error: `unreachable: ${err.message?.slice(0, 120)}` };
  }
}

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

const head = localHead();
let attempt = 0;
let last = [];

let commitNote = "";

while (Date.now() < deadline) {
  attempt++;
  last = [];
  for (const t of targets) last.push({ ...t, ...(await probe(t.url, t.mustInclude)) });

  /* The commit check is the real test, and it is authoritative in both
   * directions: it can pass a deploy the content probe would still be waiting
   * on, and it can hold back one the content probe would have waved through. */
  const served = await servedCommit();
  const sha = served.sha && served.sha !== "local" ? served.sha : null;

  if (head && sha) {
    if (contains(sha, head)) {
      console.log(
        `deploy verified after ${attempt} attempt(s): serving ${sha.slice(0, 7)}` +
        `${sha === head ? "" : ` (a descendant of ${head.slice(0, 7)})`} · ` +
        last.map((r) => `${r.label} ${r.detail}`).join(" · "),
      );
      process.exit(0);
    }
    commitNote = `serving ${sha.slice(0, 7)}, expected ${head.slice(0, 7)}`;
  } else {
    /* No usable stamp — an older build, a non-Vercel host, or the env var
     * missing. Fall back to the content probe rather than blocking forever, and
     * say which check actually ran so a pass is not read as stronger evidence
     * than it is. */
    commitNote = served.error ?? "no build-commit stamp on the page";
    if (last.every((r) => r.ok)) {
      console.log(
        `deploy verified after ${attempt} attempt(s) by content only (${commitNote}): ` +
        last.map((r) => `${r.label} ${r.detail}`).join(" · "),
      );
      process.exit(0);
    }
  }

  const remaining = Math.round((deadline - Date.now()) / 1000);
  if (remaining <= 0) break;
  const failures = last.filter((r) => !r.ok).map((r) => `${r.label}: ${r.detail}`).join(", ");
  console.log(`not live yet (${[commitNote, failures].filter(Boolean).join(" · ")}) — ${remaining}s left`);
  await sleep(Math.min(INTERVAL_MS, deadline - Date.now()));
}

console.error(
  `deploy NOT verified after ${budgetSec}s: ${commitNote} · ` +
  last.map((r) => `${r.label}: ${r.detail}`).join(" · "),
);
process.exit(1);
