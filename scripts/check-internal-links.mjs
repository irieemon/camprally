#!/usr/bin/env node
/**
 * Internal-link check: every /blog/<slug> an article points at must be a slug
 * that actually exists in src/data/articles.ts.
 *
 * The dead-link gate in run-cycle resolves affiliate ASINs, and nothing checked
 * the site's links to itself. That gap shipped for months: the writer prompt
 * asked for a closing "related guides" line "using relative paths like
 * /blog/some-slug" without saying which slugs existed, so the model invented
 * them — confidently, in the house voice, and 21 times out of 21. Every article
 * on the site ended with two or three links to 404s, plus one set pointing at
 * example.com. An internal 404 leaves no trace in any log, costs the reader the
 * click and Google the crawl, and looks exactly like a working site to us.
 *
 * Usage:
 *   node scripts/check-internal-links.mjs                 # audit published articles
 *   node scripts/check-internal-links.mjs specs/foo.json  # audit a draft pre-publish
 *
 * Exit 0 clean, 1 if any link is dead.
 */
import { readFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const arts = readFileSync(`${ROOT}src/data/articles.ts`, "utf8");

/* Slugs are read from the source text rather than imported: articles.ts is
 * TypeScript, and adding a build step to a gate is a way for the gate to stop
 * running. */
const slugs = new Set([...arts.matchAll(/^\s*slug: "([^"]+)"/gm)].map((m) => m[1]));
if (slugs.size === 0) {
  console.error("check-internal-links: found no slugs in articles.ts — refusing to pass.");
  process.exit(1);
}

const specPath = process.argv[2];
const targets = specPath
  ? (() => {
      const spec = JSON.parse(readFileSync(specPath, "utf8"));
      /* The draft's own slug is not in articles.ts until publish-article writes
       * it, so allow it explicitly — otherwise a self-reference reads as dead. */
      if (spec.slug) slugs.add(spec.slug);
      return [{ label: specPath, text: spec.body ?? "" }];
    })()
  : [{ label: "src/data/articles.ts", text: arts }];

const dead = [];
for (const { label, text } of targets) {
  text.split("\n").forEach((line, i) => {
    /* `(?!category/)` keeps the category hubs out of this test.
     *
     * /blog/category/<group> is a real page, but it does not look like one to a
     * pattern that assumes the segment after /blog/ is an article slug: the
     * capture is "category", which is in no slug set, so the first article that
     * linked to a hub would have failed this gate and blocked the publish cycle
     * for a link that was perfectly correct. The hubs are validated at build
     * time instead — generateStaticParams builds exactly the populated groups
     * and `dynamicParams = false` 404s anything else, so a bad hub link cannot
     * reach production regardless. */
    for (const m of line.matchAll(/\/blog\/(?!category\/)([a-z0-9-]+)/g)) {
      if (!slugs.has(m[1])) dead.push({ label, line: i + 1, slug: m[1] });
    }
    /* example.com is what the writer reaches for when it wants an internal link
     * and has no slug to use. It is never correct here. */
    if (/example\.com/.test(line)) dead.push({ label, line: i + 1, slug: "example.com placeholder" });
  });
}

if (dead.length) {
  console.error(`check-internal-links: ${dead.length} dead internal link(s)`);
  for (const d of dead) console.error(`  ${d.label}:${d.line}  /blog/${d.slug}`);
  console.error("\nValid slugs:\n" + [...slugs].sort().map((s) => `  /blog/${s}`).join("\n"));
  process.exit(1);
}

console.log(`check-internal-links: ok — all internal links resolve (${slugs.size} slugs known)`);
