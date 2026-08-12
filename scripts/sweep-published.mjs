#!/usr/bin/env node
/**
 * Run the review panel over articles that are ALREADY PUBLISHED.
 *
 *   node scripts/sweep-published.mjs                    # whole corpus
 *   node scripts/sweep-published.mjs <slug> [<slug>...] # re-check after a fix
 *   node scripts/sweep-published.mjs --json             # machine-readable
 *
 * Exit codes:
 *   0  nothing blocking
 *   1  at least one live article has a blocking finding
 *   2  the corpus could not be parsed — see the parse guard below
 *
 * Every other gate in this pipeline looks at a DRAFT. That is the right place
 * to catch a bad article, but it means the published corpus is only ever as
 * good as the gate that was running on the day each piece shipped — and the
 * gate keeps changing. When Meta weights joined the review panel on 2026-08-12
 * the first sweep blocked 5 of 39 live articles, including advice to dry damp
 * clothes inside a sealed tent. None of that was new; the panel that passed
 * them was one vendor voting with itself.
 *
 * So this is the check that runs against what readers can actually see, and it
 * is worth re-running whenever the panel changes rather than only when an
 * article is written.
 *
 * Reports; never edits. Every finding here is a sentence a human should
 * rewrite, and several of them turn on a judgement about the mechanism (is a
 * mylar blanket "rain protection"?) that belongs to whoever owns the byline.
 */

import { readFileSync } from "node:fs";
import { hazardFlags, reviewContent } from "./lib/content-review.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const only = args.filter((a) => !a.startsWith("--"));

/* articles.ts is one long TypeScript file rather than a directory of bodies,
 * so each article is the slice between its slug and the next. The content is a
 * template literal that closes with a BARE BACKTICK on its own line before the
 * object's `}` — not with "`,". Assuming the latter parsed 0 of 39 bodies and
 * printed "0 of 0 flagged", which reads exactly like a clean corpus. */
const src = readFileSync(`${ROOT}src/data/articles.ts`, "utf8");
const marks = [...src.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => ({ slug: m[1], at: m.index }));

const all = [];
for (let i = 0; i < marks.length; i++) {
  const chunk = src.slice(marks[i].at, i + 1 < marks.length ? marks[i + 1].at : src.length);
  const title = chunk.match(/title:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? marks[i].slug;
  const body = chunk.match(/content:\s*`([\s\S]*?)`\s*,?\s*\n\s*\}/)?.[1] ?? "";
  if (body.trim().length > 400) all.push({ slug: marks[i].slug, title, body });
}

/* A sweep that silently matches nothing is the exact failure mode it exists to
 * catch in the articles, so it must not commit it itself. Exit 2 rather than
 * report a clean corpus nobody read. */
if (all.length < marks.length * 0.8) {
  console.error(
    `Parsed ${all.length} bodies from ${marks.length} slugs. The parser is broken, not the corpus — ` +
    `articles.ts has probably changed shape. Refusing to report a result.`,
  );
  process.exit(2);
}

const entries = only.length ? all.filter((e) => only.includes(e.slug)) : all;
if (only.length && entries.length !== only.length) {
  const missing = only.filter((s) => !entries.some((e) => e.slug === s));
  console.error(`No published article for: ${missing.join(", ")}`);
  process.exit(2);
}

if (!JSON_OUT) console.log(`Sweeping ${entries.length} published article${entries.length === 1 ? "" : "s"}.\n`);

const report = [];
let blocked = 0;

for (const [i, a] of entries.entries()) {
  const spec = { title: a.title, body: a.body, products: [] };
  const rules = hazardFlags(spec);
  let model = null;
  let error = null;
  try {
    model = await reviewContent(spec);
  } catch (err) {
    error = String(err?.message ?? err);
  }

  const blocking = model?.blocking ?? [];
  /* Deterministic rules and model consensus both count. The rules have never
   * fired on the published corpus — test-content-review asserts exactly that —
   * so if one ever does here it is the more urgent of the two. */
  const bad = rules.length > 0 || blocking.length > 0;
  if (bad) blocked++;

  report.push({
    slug: a.slug,
    title: a.title,
    rules: rules.map((r) => r.id),
    /* Recorded per article because it is a property of what ANSWERED. A sweep
     * where a vendor was down for the last ten articles is a different result
     * from one where it answered throughout, and the difference is invisible
     * unless it is written down. */
    independent: model?.independent ?? null,
    reviewers: model?.reviewers ?? null,
    blocking,
    notes: model?.notes ?? [],
    error,
  });

  if (JSON_OUT) continue;
  const tag = error ? "ERR " : bad ? "FLAG" : "ok  ";
  const counts = error
    ? error.slice(0, 80)
    : `rules ${rules.length} | blocking ${blocking.length} | notes ${(model?.notes ?? []).length}` +
      (model?.independent === false ? " | NOT-INDEPENDENT" : "");
  console.log(`${String(i + 1).padStart(3)}/${entries.length}  ${tag}  ${a.slug}  [${counts}]`);
  for (const r of rules) console.log(`         ! rule ${r.id}: ${String(r.text ?? "").slice(0, 120)}`);
  for (const b of blocking) {
    console.log(`         ! ${String(b.quote).slice(0, 140)}`);
    console.log(`           -> ${b.problem}`);
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 1));
} else {
  const degraded = report.filter((r) => r.independent === false).length;
  console.log(`\n${blocked} of ${entries.length} flagged.`);
  if (degraded) console.log(`${degraded} reviewed by a single lineage — those verdicts are weaker than the rest.`);
}

process.exit(blocked ? 1 : 0);
