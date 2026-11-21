#!/usr/bin/env node
/**
 * The review-panel gate (2026-11-20): run-cycle refuses to publish when fewer
 * than two model reviewers answered, and announces a publish reviewed by fewer
 * than all of them. Offline — no model is called.
 *
 *   node scripts/test-review-gate.mjs
 *
 * Exists because the panel's failure was invisible for three weeks: OpenRouter
 * credits ran out, two seats returned 402, and review-article printed
 * "clean (rules only; model unreachable)" and exited 0 on every article.
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const ROOT = new URL("..", import.meta.url).pathname;
let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "ok" : "✗ "}  ${name}${ok ? "" : ` — ${detail}`}`);
  if (!ok) failed++;
};

// The line format is a contract between review-article (writer) and run-cycle (reader).
const RE_SRC = String.raw`/^review panel: (\d+)\/(\d+) answered(?: \(([^)]*)\))?/m`;
const cycle = readFileSync(`${ROOT}scripts/run-cycle.mjs`, "utf8");
const review = readFileSync(`${ROOT}scripts/review-article.mjs`, "utf8");
check("run-cycle parses the panel line with the contract regex", cycle.includes(RE_SRC));
check("review-article prints the panel line", review.includes("console.log(`review panel: ${answered}/${seats.length} answered"));
check("run-cycle blocks with EXIT.FAIL below two answers", /answered < 2\)[\s\S]{0,80}finish\("blocked", \{\s*reason: "review-unavailable"/.test(cycle) && /review-unavailable[\s\S]{0,900}EXIT\.FAIL\)/.test(cycle));

const re = /^review panel: (\d+)\/(\d+) answered(?: \(([^)]*)\))?/m;
const decide = (out) => {
  const m = out.match(re); const a = m ? +m[1] : 0, k = m ? +m[2] : 0;
  return a < 2 ? "block" : a < k ? "degraded" : "publish";
};
check("3/3 publishes", decide("x\nreview panel: 3/3 answered (MiniMax-M3 pass, claude-opus-5-5 flag-low, gemini-3.6-flash pass) — s\n") === "publish");
check("2/3 publishes, flagged", decide("review panel: 2/3 answered (MiniMax-M3 pass, claude-opus-5-5 no-answer, gemini-3.6-flash pass) — s") === "degraded");
check("1/3 blocks", decide("✓ s — clean (rules only; model unreachable)\nreview panel: 1/3 answered (a pass, b no-answer, c no-answer) — s") === "block");
check("no panel line at all blocks", decide("✓ s — clean") === "block");

const dir = mkdtempSync(`${tmpdir()}/review-gate-`);
const announce = (r) => {
  const now = new Date().toISOString();
  writeFileSync(`${dir}/r.json`, JSON.stringify({ startedAt: now, finishedAt: now, ...r }));
  return execFileSync("node", [`${ROOT}scripts/announce-run.mjs`, `${dir}/r.json`]).toString().trim();
};
const short = announce({ outcome: "published", slug: "s", remaining: 3, reviewDegraded: { answered: 2, asked: 3, seats: "a pass, b no-answer, c pass" } });
check("degraded publish is announced as short", /^✅ DONE: published "s".*⚠️ Review ran short: 2\/3/.test(short), short);
const blocked = announce({ outcome: "blocked", reason: "review-unavailable", slug: "s", panel: "1/3 answered (a pass, b no-answer, c no-answer)" });
check("review-unavailable announces as ERROR, not published", /^⚠️ ERROR: cycle blocked — too few model reviewers.*NOT published/.test(blocked), blocked);
const clean = announce({ outcome: "published", slug: "s", remaining: 3 });
check("full panel publish carries no warning", !/Review ran short/.test(clean), clean);

console.log(failed ? `\n${failed} review-gate control(s) FAILED` : "\nall review-gate controls passed");
process.exit(failed ? 1 : 0);
