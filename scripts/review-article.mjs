#!/usr/bin/env node
/**
 * Review an article spec for dangerous or plainly false advice.
 *
 *   node scripts/review-article.mjs specs/how-to-camp-in-rain.json
 *   node scripts/review-article.mjs specs/*.json --rules-only   # no model call
 *   node scripts/review-article.mjs specs/foo.json --json
 *
 * Exit codes:
 *   0  nothing blocking (notes may still have been printed)
 *   1  blocking findings — this spec must not publish
 *
 * There is deliberately no exit code for "the model was unreachable". The
 * deterministic rules are the gate; the model is a second opinion. Letting an
 * API outage stop the publisher would trade a rare bad article for a pipeline
 * that is dead every time MiniMax has a bad afternoon.
 */

import { readFileSync } from "node:fs";
import { hazardFlags, reviewContent } from "./lib/content-review.mjs";

const args = process.argv.slice(2);
const RULES_ONLY = args.includes("--rules-only");
const JSON_OUT = args.includes("--json");
const specPaths = args.filter((a) => !a.startsWith("--"));

if (!specPaths.length) {
  console.error("usage: node scripts/review-article.mjs <spec.json> [...] [--rules-only] [--json]");
  process.exit(1);
}

let blocked = false;
const report = [];

for (const path of specPaths) {
  const spec = JSON.parse(readFileSync(path, "utf8"));
  const hazards = hazardFlags(spec);
  const model = RULES_ONLY ? null : await reviewContent(spec);

  const entry = {
    spec: path,
    slug: spec.slug,
    hazards,
    modelReviewed: model !== null,
    passes: model?.passes ?? 0,
    blocking: model?.blocking ?? [],
    notes: model?.notes ?? [],
  };
  report.push(entry);

  if (hazards.length || entry.blocking.length) blocked = true;

  if (JSON_OUT) continue;

  const label = spec.slug ?? path;
  if (!hazards.length && !entry.blocking.length && !entry.notes.length) {
    console.log(`✓ ${label} — clean${model === null && !RULES_ONLY ? " (rules only; model unreachable)" : ""}`);
    continue;
  }

  console.log(`\n${label}`);
  for (const h of hazards) {
    console.log(`  ✗ [${h.severity}] ${h.id} (${h.path})`);
    console.log(`      ${h.problem}`);
    console.log(`      "${h.text}"`);
  }
  for (const b of entry.blocking) {
    console.log(`  ✗ [model ${b.votes}/${entry.passes}] ${b.problem}`);
    console.log(`      "${String(b.quote).slice(0, 160)}"`);
  }
  for (const n of entry.notes) {
    console.log(`  · note (${n.votes}/${entry.passes}): ${n.problem}`);
  }
  if (model === null && !RULES_ONLY) console.log("  (model review unavailable — deterministic rules only)");
}

if (JSON_OUT) console.log(JSON.stringify(report, null, 2));

process.exit(blocked ? 1 : 0);
