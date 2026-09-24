#!/usr/bin/env node
/**
 * How Bing sees camprally.co — search performance and crawl health.
 *
 *   node scripts/bing-report.mjs          # plain-text report
 *   node scripts/bing-report.mjs --json   # machine-readable
 *
 * Exit codes:
 *   0  healthy
 *   1  needs attention — the sitemap is stale (> 14 days since Bing read it),
 *      its status is not Success, or Bingbot saw 5xx errors
 *   2  the API or the key failed; the report is INCOMPLETE and says so first
 *
 * WHY THIS EXISTS. In August, Bing had stopped reading the sitemap four months
 * earlier and the dashboard still showed a green "Success". The fix was
 * IndexNow (lib/indexnow.mjs), but a push channel only proves we spoke — this
 * is the check that Bing is listening. It uses Bing's own Webmaster JSON API
 * and no third-party code.
 *
 * Reads; never writes. Only the Get* methods in lib/bing-webmaster.mjs's
 * READ_METHODS can be called — no URL submission, no site changes.
 *
 * The key is BING_API_KEY, from the environment or ~/.openclaw/openclaw.json →
 * env.vars (same fallback as lib/llm.mjs: OpenClaw injects env.vars into cron
 * jobs but not into a shell, so a hand run would otherwise differ from a cron
 * run). It is never printed — see redact().
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { buildReport, renderText, redact } from "./lib/bing-webmaster.mjs";

export function resolveKey(env = process.env) {
  if (env.BING_API_KEY) return env.BING_API_KEY;
  try {
    return JSON.parse(readFileSync(`${homedir()}/.openclaw/openclaw.json`, "utf8"))?.env?.vars?.BING_API_KEY ?? null;
  } catch {
    return null;
  }
}

/** Testable entry point: returns {code, output} instead of writing or exiting. */
export async function main({ argv = process.argv.slice(2), key = resolveKey(), fetchImpl = fetch, now = new Date() } = {}) {
  const json = argv.includes("--json");
  let report;
  try {
    report = await buildReport({ key, fetchImpl, now });
  } catch (err) {
    /* buildReport does not throw on API conditions; reaching here is a bug.
     * Still exit 2 and still redact — a crash must not read as healthy. */
    const msg = `bing-report crashed: ${err?.message ?? err}`;
    return { code: 2, output: redact(json ? JSON.stringify({ verdict: { code: 2, problems: [msg] } }) : msg, key) };
  }
  const output = json ? JSON.stringify(report, null, 2) : renderText(report);
  /* Second pass over EVERYTHING leaving the process, not just error strings. */
  return { code: report.verdict.code, output: redact(output, key) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { code, output } = await main();
  console.log(output);
  process.exit(code);
}
