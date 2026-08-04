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
 *   ok             recent run, not stuck
 *   host-silent    no heartbeat in STALE_DAYS — the machine is probably off
 *   stuck          heartbeat is fresh but the last outcomes were blocked
 *   never-started  no heartbeat has ever been committed
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";

const STALE_DAYS = 3;      // heartbeat older than this means the host is gone
const STUCK_RUNS = 3;      // this many consecutive blocked runs means stuck

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
const ageDays = ageMs / 86_400_000;

if (ageDays > STALE_DAYS) {
  emit("status", "host-silent");
  emit(
    "summary",
    `**No heartbeat for ${ageDays.toFixed(1)} days.**\n\n` +
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
let recent = [];
if (existsSync("state/runs")) {
  recent = readdirSync("state/runs")
    .filter((f) => f.endsWith(".json"))
    .sort()
    .slice(-STUCK_RUNS)
    .map((f) => {
      try { return JSON.parse(readFileSync(`state/runs/${f}`, "utf8")); }
      catch { return null; }
    })
    .filter(Boolean);
}

const allBlocked = recent.length >= STUCK_RUNS && recent.every((r) => r.outcome === "blocked");

if (allBlocked) {
  const reasons = [...new Set(recent.map((r) => r.reason))].join(", ");
  emit("status", "stuck");
  emit(
    "summary",
    `**The pipeline is alive but has been blocked for ${recent.length} consecutive runs.**\n\n` +
    `Reason(s): \`${reasons}\`\n\n` +
    `Latest message:\n\n\`\`\`\n${(last.message ?? "(none)").slice(0, 900)}\n\`\`\`\n\n` +
    "The host is healthy — this needs a decision, not a reboot.",
  );
  console.log(out.join("\n"));
  process.exit(0);
}

emit("status", "ok");
emit(
  "summary",
  `Healthy. Last run ${ageDays.toFixed(1)}d ago: \`${last.outcome}\`` +
  (last.slug ? ` (${last.slug})` : ""),
);
console.log(out.join("\n"));
