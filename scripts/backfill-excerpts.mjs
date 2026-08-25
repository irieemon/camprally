/**
 * Rewrite the meta descriptions that are just the article's own title.
 *
 * WHY THIS EXISTS. `write-article.mjs` fell back to `${brief.title}.` whenever
 * a brief carried no `excerpt` — and `excerpt` was never in the brief schema,
 * so the fallback was the behaviour rather than a fallback. 27 of the 30
 * pipeline-written articles shipped a description that restates their own
 * title, wasting the search snippet on every one of them. The generator is
 * fixed and gated; this is the backfill for what already published.
 *
 * The gate the generator uses is the gate this uses — same import, so a
 * description this script accepts is exactly one write-article would accept.
 *
 * Safe to re-run. It only touches articles that currently fail the gate, so a
 * second run after a partial failure picks up the remainder and leaves good
 * descriptions alone.
 *
 *   node scripts/backfill-excerpts.mjs [--dry-run] [--limit N] [--slug <slug>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { callRole } from "./lib/llm.mjs";
import { excerptIsDegenerate, MIN_EXCERPT_CHARS, MAX_EXCERPT_CHARS } from "./lib/meta.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const FILE = `${ROOT}src/data/articles.ts`;

const DRY = process.argv.includes("--dry-run");
const limitIdx = process.argv.indexOf("--limit");
const LIMIT = limitIdx > -1 ? Number(process.argv[limitIdx + 1]) : Infinity;
const slugIdx = process.argv.indexOf("--slug");
const ONLY = slugIdx > -1 ? process.argv[slugIdx + 1] : null;

/* Parse by splitting on the slug key rather than with one big regex over a
 * 324 KB file: the bodies are template literals full of backticks, quotes and
 * markdown, and a regex that tries to span them is the kind that works on the
 * corpus it was written against and silently mismatches on the next article. */
function parseArticles(src) {
  const parts = src.split(/\n    slug: "/).slice(1);
  return parts.map((p) => {
    const slug = p.slice(0, p.indexOf('"'));
    const title = p.match(/\n    title: "((?:[^"\\]|\\.)*)"/)?.[1] ?? "";
    const excerptMatch = p.match(/\n    excerpt: "((?:[^"\\]|\\.)*)"/);
    const bodyStart = p.indexOf("content: `");
    const body =
      bodyStart > -1 ? p.slice(bodyStart + 10, p.indexOf("`,", bodyStart + 10)) : "";
    return {
      slug,
      title,
      excerpt: excerptMatch?.[1] ?? "",
      // The exact source text to swap out, so the write-back is unambiguous.
      excerptLiteral: excerptMatch?.[0] ?? null,
      body,
    };
  });
}

async function writeDescription(article) {
  const r = await callRole("cheap", {
    system:
      "You write meta descriptions for search results. Reply with ONE sentence " +
      "of 140-160 characters. No quotes, no markdown, no label. It must NOT " +
      "restate the article's title — it must tell the reader what they will " +
      "learn or be able to decide after reading.",
    user: [
      `Article title: "${article.title}"`,
      "",
      "Opening of the article:",
      article.body.slice(0, 1200),
    ].join("\n"),
    maxTokens: 8000,
    parse: "text",
    rounds: 2,
  });
  if (!r) return null;
  return r.value.trim().replace(/^["'\s]+|["'\s]+$/g, "").split(/\n/)[0].trim();
}

const src = readFileSync(FILE, "utf8");
const all = parseArticles(src);

let targets = all.filter((a) => excerptIsDegenerate(a.excerpt, a.title));
if (ONLY) targets = targets.filter((a) => a.slug === ONLY);
targets = targets.slice(0, LIMIT);

console.log(`${all.length} articles parsed, ${targets.length} need a description\n`);
if (!targets.length) process.exit(0);

let out = src;
const done = [];
const failed = [];

for (const [i, article] of targets.entries()) {
  process.stdout.write(`[${i + 1}/${targets.length}] ${article.slug} … `);

  if (!article.excerptLiteral) {
    console.log("SKIP (no excerpt field found)");
    failed.push({ slug: article.slug, why: "no excerpt field" });
    continue;
  }

  let text = null;
  for (let attempt = 1; attempt <= 2 && !text; attempt++) {
    const candidate = await writeDescription(article);
    if (!candidate) continue;
    // The generator's gate, not a second opinion about it.
    if (excerptIsDegenerate(candidate, article.title)) continue;
    if (candidate.length < MIN_EXCERPT_CHARS) continue;
    if (candidate.length > MAX_EXCERPT_CHARS) continue;
    if (candidate.includes('"')) continue; // would break the string literal
    text = candidate;
  }

  if (!text) {
    console.log("FAILED (no usable description after 2 tries)");
    failed.push({ slug: article.slug, why: "model produced nothing usable" });
    continue;
  }

  console.log(`ok (${text.length} chars)`);
  console.log(`      ${text}`);
  done.push({ slug: article.slug, text });

  if (!DRY) {
    const replacement = `\n    excerpt: "${text}"`;
    /* Replace the one literal belonging to this article. `out.replace` with a
     * string pattern swaps the FIRST occurrence, which is correct here only
     * because every excerpt literal in the file is distinct — two articles with
     * byte-identical excerpts would collide. Guarded rather than assumed. */
    const occurrences = out.split(article.excerptLiteral).length - 1;
    if (occurrences !== 1) {
      console.log(`      !! ${occurrences} matches for this excerpt — skipped to avoid clobbering`);
      failed.push({ slug: article.slug, why: `${occurrences} ambiguous matches` });
      done.pop();
      continue;
    }
    out = out.replace(article.excerptLiteral, replacement);
  }
}

if (!DRY && done.length) {
  writeFileSync(FILE, out);
  console.log(`\nwrote ${done.length} description(s) to src/data/articles.ts`);
} else if (DRY) {
  console.log(`\n--dry-run: nothing written`);
}

if (failed.length) {
  console.log(`\n${failed.length} not updated:`);
  for (const f of failed) console.log(`  ${f.slug} — ${f.why}`);
}

/* Non-zero only if nothing at all succeeded. A partial run is a normal outcome
 * — the models occasionally return something that fails the gate — and re-running
 * picks up the remainder, so a partial success must not read as a failure. */
process.exit(done.length ? 0 : 1);
