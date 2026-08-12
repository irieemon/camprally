#!/usr/bin/env node
/**
 * Score review models against defects this pipeline actually shipped.
 *
 *   node scripts/bench-reviewers.mjs                        # the standing field
 *   node scripts/bench-reviewers.mjs --model <openrouter-id> # audition one
 *   node scripts/bench-reviewers.mjs --json
 *
 * Exists because "which model should review our articles" was about to be
 * answered from leaderboards, and leaderboards do not measure this job. The
 * job is: read 5,000 words of plausible camping prose and notice the one
 * sentence that is wrong. On 2026-08-12 that question had a real answer set —
 * five defects the panel found live, in our own corpus, that a previous panel
 * had passed. Those five are the fixtures.
 *
 * The result was not what reputation predicted. A 30B open model caught 5/5
 * including every safety case; GPT-5 caught 3/5 and raised two false alarms on
 * sound articles; Claude Sonnet 4.6 and Mistral Medium caught almost nothing.
 * Re-run this before changing the panel, not a benchmark table.
 *
 * FIXTURES COME FROM GIT, not a snapshot file. The defects were fixed the same
 * day they were found, so the corpus that contains them only exists in history.
 * Pinning the ref is what keeps this test meaningful a year from now.
 *
 * Scoring:
 *   positive case — did any returned quote overlap the known defect sentence?
 *   negative case — how many HIGH findings on an article believed sound?
 * A model earns a seat by scoring on the first without scoring on the second.
 * One that flags everything is as useless as one that flags nothing.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const ONE = args[args.indexOf("--model") + 1];

/* The last commit before the defects were fixed. b793446 corrected the
 * hydration claim and 1791a9a the other four, so this is the final tree that
 * still contains all five. */
const FIXTURE_REF = process.env.BENCH_REF ?? "8c77f8e";

const KEY = process.env.OPENROUTER_API_KEY
  ?? (() => {
    try {
      return JSON.parse(readFileSync(`${process.env.HOME}/.openclaw/openclaw.json`, "utf8"))?.env?.vars?.OPENROUTER_API_KEY;
    } catch { return null; }
  })();
if (!KEY) {
  console.error("No OPENROUTER_API_KEY (env or openclaw.json). Nothing to benchmark against.");
  process.exit(2);
}

const FIELD = ONE ? [[ONE, "audition"]] : [
  ["minimax/minimax-m3", "starter"],
  ["meta/muse-glimmer-30b", "starter"],
  ["deepseek/deepseek-v4-pro", "starter"],
  ["google/gemini-3.6-flash", "bench"],
  ["minimax/minimax-m2.7", "bench"],
];

/* marker = a distinctive fragment of the KNOWN defect sentence. */
const CASES = [
  { slug: "budget-camping-hacks-that-work", kind: "positive", severity: "safety", marker: "damp clothes on a paracord" },
  { slug: "best-budget-sleeping-bags-cold-weather", kind: "positive", severity: "safety", marker: "rate conservatively" },
  { slug: "how-to-camp-in-hot-weather", kind: "positive", severity: "safety", marker: "Two bottles per person per day" },
  { slug: "budget-camping-accessories-under-20", kind: "positive", severity: "accuracy", marker: "waterproof and windproof" },
  { slug: "best-cheap-camping-tables", kind: "positive", severity: "pedantic", marker: "Adjustable height" },
  { slug: "best-camping-tarp-under-30", kind: "negative" },
  { slug: "memorial-day-camping-checklist-2026", kind: "negative" },
  { slug: "fall-camping-gear-essentials", kind: "negative" },
];

let src;
try {
  src = execFileSync("git", ["-C", ROOT, "show", `${FIXTURE_REF}:src/data/articles.ts`], { maxBuffer: 32 * 1024 * 1024 }).toString();
} catch {
  console.error(`Cannot read fixtures at ${FIXTURE_REF} — a shallow clone will not have it. Fetch history or set BENCH_REF.`);
  process.exit(2);
}

const marks = [...src.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => ({ slug: m[1], at: m.index }));
const bodies = {};
for (let i = 0; i < marks.length; i++) {
  const chunk = src.slice(marks[i].at, i + 1 < marks.length ? marks[i + 1].at : src.length);
  const title = chunk.match(/title:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? marks[i].slug;
  const body = chunk.match(/content:\s*`([\s\S]*?)`\s*,?\s*\n\s*\}/)?.[1] ?? "";
  if (body.trim().length > 400) bodies[marks[i].slug] = { title, body };
}

/* Assert the fixtures before spending anything. A marker that has drifted turns
 * every model's score into a silent zero, which reads as "they are all bad"
 * rather than "the test is broken". */
for (const c of CASES) {
  if (!bodies[c.slug]) { console.error(`Fixture missing at ${FIXTURE_REF}: ${c.slug}`); process.exit(2); }
  if (c.marker && !bodies[c.slug].body.includes(c.marker)) {
    console.error(`Defect no longer present in ${c.slug} at ${FIXTURE_REF}: "${c.marker}"`);
    process.exit(2);
  }
}

/* The production review prompt, verbatim. Benchmarking a different prompt would
 * measure something the pipeline never asks for. Keep in sync with
 * lib/content-review.mjs reviewPrompt(). */
const SYSTEM = [
  "You are checking a camping article before it is published. Report only OUTRIGHT ERRORS.",
  "",
  'Return {"issues":[{"quote":"the exact text","problem":"one sentence","severity":"high"|"low"}]}.',
  "Return an empty array if the content is sound. That is a normal, common answer.",
  "",
  "high = would mislead a camper into a dangerous or expensive mistake, or is plainly false.",
  "       Carbon monoxide, hypothermia, water-borne illness and wildlife advice are the ones that matter.",
  "low  = minor inaccuracy, redundancy, or a claim that contradicts another claim in the article.",
  "",
  "Do NOT report: wording you would phrase differently, advice you would have added,",
  "obvious statements, or anything about formatting, length, SEO or tone. Those are not errors.",
].join("\n");

function extractJSON(text) {
  const starts = [text.indexOf("{"), text.indexOf("[")].filter((i) => i >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const open = text[start], close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

/* SEQUENTIAL, with one retry. The first cut of this fired all eight articles at
 * once per model and Claude came back 0/5 with three transport errors — a score
 * that measured the fan-out, not the model. Run sequentially it scores 1/5,
 * which is a real finding. A benchmark that fails a model for its own plumbing
 * is worse than no benchmark, because the number looks authoritative. */
function ask(model, slug) {
  const { title, body } = bodies[slug];
  const payload = JSON.stringify({
    model,
    messages: [
      { role: "system", content: SYSTEM },
      /* maxTokens generous on purpose: every thinking model tested returns
       * EMPTY content when reasoning exhausts the budget, which parses as
       * "found nothing" rather than as a failure. */
      { role: "user", content: JSON.stringify({ title, products: [], body: body.slice(0, 12000) }, null, 1) },
    ],
    max_tokens: 8000,
  });
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = execFileSync("curl", [
        "-s", "--fail-with-body", "-m", "600", "https://openrouter.ai/api/v1/chat/completions",
        "-H", `Authorization: Bearer ${KEY}`, "-H", "content-type: application/json", "--data-binary", "@-",
      ], { input: payload, maxBuffer: 64 * 1024 * 1024 }).toString();
      const d = JSON.parse(raw);
      if (d.error) return { error: String(d.error.message ?? d.error).slice(0, 120) };
      const parsed = extractJSON(d.choices?.[0]?.message?.content ?? "");
      if (parsed === null) return { error: "no JSON in reply (empty content — thinking budget?)" };
      return { issues: (Array.isArray(parsed) ? parsed : parsed.issues ?? []).filter((i) => i?.quote), cost: d.usage?.cost ?? 0 };
    } catch (e) {
      if (attempt === 2) return { error: `transport: ${String(e.message).slice(0, 90)}` };
    }
  }
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const safetyCases = CASES.filter((c) => c.kind === "positive" && c.severity === "safety");
const positives = CASES.filter((c) => c.kind === "positive");
const results = [];

for (const [model, tier] of FIELD) {
  const row = { model, tier, detected: [], missed: [], falsePositives: 0, errors: 0, cost: 0 };
  for (const c of CASES) {
    const r = ask(model, c.slug);
    row.cost += r.cost ?? 0;
    if (r.error) { row.errors++; row.lastError = r.error; continue; }
    if (c.kind === "positive") {
      const hit = r.issues.some((i) =>
        norm(i.quote).includes(norm(c.marker)) || norm(c.marker).includes(norm(i.quote).slice(0, 40)));
      (hit ? row.detected : row.missed).push(c.slug);
    } else {
      row.falsePositives += r.issues.filter((i) => String(i.severity).toLowerCase() === "high").length;
    }
  }
  row.safety = safetyCases.filter((c) => row.detected.includes(c.slug)).length;
  results.push(row);
  if (!JSON_OUT) {
    console.log(
      `${model.padEnd(30)} ${tier.padEnd(9)} safety ${row.safety}/${safetyCases.length}` +
      `  all ${row.detected.length}/${positives.length}  falsePos ${row.falsePositives}` +
      `  err ${row.errors}  $${row.cost.toFixed(4)}` + (row.lastError ? `  (${row.lastError.slice(0, 50)})` : ""),
    );
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ ref: FIXTURE_REF, results }, null, 1));
} else {
  console.log(`\nfixtures @ ${FIXTURE_REF} · total $${results.reduce((a, r) => a + r.cost, 0).toFixed(4)}`);
  const blind = results.filter((r) => r.safety === 0 && r.errors === 0);
  for (const b of blind) console.log(`  ${b.model} missed every safety case while answering cleanly — do not seat it.`);
}
