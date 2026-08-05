#!/usr/bin/env node
/**
 * Decide whether the autonomous pipeline is healthy, from GitHub's side.
 *
 * Runs in GitHub Actions, never on the Mac — see the comment block in
 * liveness.yml for why that separation is the entire point.
 *
 * Reads state/last-run.json, which run-cycle.mjs commits on every outcome.
 * Emits GITHUB_OUTPUT lines: status and summary.
 *
 * Statuses:
 *   ok             recent run, publishing, site serving
 *   host-silent    no heartbeat in STALE_HOURS — the machine is probably off
 *   stuck          heartbeat is fresh but nothing has published in STUCK_RUNS
 *   deploy-failing committing and pushing, but the origin never serves it
 *   site-down      host healthy, site not
 *   never-started  no heartbeat has ever been committed
 */

import { readFileSync, existsSync } from "node:fs";
import { sinceLastPublish, receipts } from "../../scripts/lib/run-history.mjs";

/* Hours, not days.
 *
 * Three days was the original threshold and it is far too slack for a pipeline
 * that runs three times daily: nine missed cycles before anyone hears about it.
 * The binding constraint is the overnight gap — the 19:00 run to the 09:00 run
 * is 14 hours of legitimate silence — so 20 gives a margin over that without
 * waiting for a third day. */
const STALE_HOURS = 20;

/* Consecutive non-publishing runs that mean stuck.
 *
 * Counted by "did anything publish", not by "was the outcome blocked". The old
 * test required all three of the last runs to be `blocked`, so a pipeline
 * alternating blocked / deferred / idle — which is what a quota exhaustion
 * actually looks like — never tripped it while publishing nothing for weeks. */
const STUCK_RUNS = 6;

/* Runs that committed and pushed but whose deploy never appeared. One is a slow
 * build; three in a row means Vercel is failing and the site is frozen at an
 * older commit while every local signal reports success. */
const DEPLOY_FAIL_RUNS = 3;

const out = [];
const emit = (k, v) => out.push(`${k}=${String(v).replace(/\n/g, "%0A")}`);

const LAST = "state/last-run.json";

if (!existsSync(LAST)) {
  emit("status", "never-started");
  emit(
    "summary",
    "**No heartbeat has ever been recorded.**\n\n" +
    "`state/last-run.json` does not exist, so `run-cycle.mjs` has not completed a run.\n" +
    "Check that the launchd job is loaded on the Mac:\n\n" +
    "```\nlaunchctl list | grep camprally\n```",
  );
  console.log(out.join("\n"));
  process.exit(0);
}

const last = JSON.parse(readFileSync(LAST, "utf8"));
const ageMs = Date.now() - Date.parse(last.finishedAt ?? last.startedAt);
const ageHours = ageMs / 3_600_000;
const ageDays = ageMs / 86_400_000;

if (ageHours > STALE_HOURS) {
  emit("status", "host-silent");
  emit(
    "summary",
    `**No heartbeat for ${ageHours.toFixed(1)} hours.**\n\n` +
    `Last run finished \`${last.finishedAt}\` with outcome \`${last.outcome}\`.\n\n` +
    "The publishing host has stopped reporting. Most likely the Mac is off or lost power.\n\n" +
    "Checklist:\n" +
    "1. Is the Mac powered on?\n" +
    "2. `pmset -g custom | grep autorestart` — should be `1` so it reboots itself after a power cut.\n" +
    "3. `launchctl list | grep camprally`\n" +
    "4. `tail state/runs/*.json`\n\n" +
    "_This is the exact failure that went unnoticed for 52 days between 2026-06-12 and 2026-08-04._",
  );
  console.log(out.join("\n"));
  process.exit(0);
}

// Fresh heartbeat — but is it making progress?
const { runs: sincePublish, reasons, lastPublishedAt } = sinceLastPublish("state/runs");

if (sincePublish >= STUCK_RUNS) {
  emit("status", "stuck");
  emit(
    "summary",
    `**The pipeline is alive but has not published in ${sincePublish} consecutive runs.**\n\n` +
    `Reason(s): \`${reasons.join(", ") || "none recorded"}\`\n` +
    `Last publish: ${lastPublishedAt ?? "never"}\n\n` +
    `Latest message:\n\n\`\`\`\n${(last.message ?? "(none)").slice(0, 900)}\n\`\`\`\n\n` +
    "The host is healthy — this needs a decision, not a reboot.",
  );
  console.log(out.join("\n"));
  process.exit(0);
}

/* Deploys that never landed.
 *
 * run-cycle records `published-unverified` when it committed and pushed but the
 * origin never served the new article. Individually that is usually just a slow
 * Vercel build finishing after the check gave up. Repeated, it means the site is
 * frozen at an older commit while git history, receipts and Telegram all report
 * a healthy publishing pipeline. */
const recentRuns = receipts("state/runs", DEPLOY_FAIL_RUNS);
const deployFailing =
  recentRuns.length >= DEPLOY_FAIL_RUNS &&
  recentRuns.every((r) => r.outcome === "published-unverified");

if (deployFailing) {
  emit("status", "deploy-failing");
  emit(
    "summary",
    `**${recentRuns.length} consecutive publishes never appeared on the site.**\n\n` +
    `The Mac is committing and pushing normally, so this is Vercel's build, not the agent.\n\n` +
    `Most recent: \`${last.slug}\` — ${last.deploy ?? "(no detail)"}\n\n` +
    "Check the Vercel dashboard for failed deployments on `main`.",
  );
  console.log(out.join("\n"));
  process.exit(0);
}

// The heartbeat only proves the Mac ran. It says nothing about whether the
// site is actually serving — a failed deploy, an expired domain, or a DNS
// change would all leave the heartbeat perfectly healthy.
//
// This check exists because on 2026-08-04 a health check reported "site 200"
// while pointing at camprally.COM, which is a parked HugeDomains listing. The
// real site is camprally.CO. A green check against the wrong host is worse
// than no check, so the URL is asserted here, in one place, from outside.
const SITE = "https://www.camprally.co";
const MIN_PAGES = 20;

let siteStatus = 0, pageCount = 0;
try {
  const res = await fetch(`${SITE}/sitemap.xml`, { signal: AbortSignal.timeout(20_000) });
  siteStatus = res.status;
  if (res.ok) pageCount = ((await res.text()).match(/<loc>/g) ?? []).length;
} catch (err) {
  siteStatus = `unreachable (${err.name})`;
}

if (siteStatus !== 200 || pageCount < MIN_PAGES) {
  emit("status", "site-down");
  emit(
    "summary",
    `**The site is not serving correctly.**\n\n` +
    `\`${SITE}/sitemap.xml\` returned \`${siteStatus}\` with ${pageCount} page(s) ` +
    `(expected 200 and at least ${MIN_PAGES}).\n\n` +
    `The publishing host is fine — last run ${ageDays.toFixed(1)}d ago: \`${last.outcome}\`. ` +
    `So this is a deploy, DNS, or domain problem, not an agent problem.\n\n` +
    "Check:\n" +
    "1. Vercel deployment status for the latest commit\n" +
    `2. Domain registration and DNS for camprally.co\n` +
    "3. That the domain has not lapsed — camprally.com is a different, parked domain",
  );
  console.log(out.join("\n"));
  process.exit(0);
}

emit("status", "ok");
emit(
  "summary",
  `Healthy. Last run ${ageHours.toFixed(1)}h ago: \`${last.outcome}\`` +
  (last.slug ? ` (${last.slug})` : "") +
  ` · ${sincePublish} run(s) since last publish · site serving ${pageCount} pages.`,
);
console.log(out.join("\n"));
