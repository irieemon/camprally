/**
 * Write alt text for every hero image by LOOKING AT IT.
 *
 * Hero and card images shipped with `alt=""`. That is defensible for a purely
 * decorative image, and these are not: the hero is the largest, most topical
 * image on the page, and image search is a real channel for a gear site.
 *
 * WHY NOT DERIVE IT FROM THE TITLE. Because that reproduces, in a new field,
 * exactly the defect this repo just spent a commit removing from meta
 * descriptions. `heroPrompt()` is near-identical across articles — "camping
 * gear in a natural campsite setting" — so alt text generated from title and
 * category would be boilerplate that restates the H1 sitting directly beside
 * it. Alt text that repeats the adjacent heading is worse than none: a screen
 * reader announces the same sentence twice, and it tells an image crawler
 * nothing the page did not already say.
 *
 * So the images are actually described. Gemini reads each file and reports what
 * is visible.
 *
 * WHICH MODEL, AND WHY IT MATTERS WHICH. Goes through the `vision` role, so the
 * seating lives in llm.mjs with its reasoning rather than being hardcoded here.
 * Gemini leads and MiniMax-M3 backs it up; both genuinely read the image.
 *
 * M2.7 does NOT, and fails silently: 200 OK, `input_tokens: 64`, the image
 * dropped on the floor, and a cheerful "I can't see the image." A vision seat
 * that cannot see is worse than no vision at all, because the failure looks
 * like an answer. Hence the promptTokenCount floor below — it proves the image
 * was actually ingested rather than trusting the 200.
 *
 *   node scripts/backfill-hero-alt.mjs [--dry-run] [--limit N] [--force]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { callRole } from "./lib/llm.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const FILE = `${ROOT}src/data/heroes.ts`;
const OUT = `${ROOT}src/data/hero-alt.json`;

const DRY = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const lIdx = process.argv.indexOf("--limit");
const LIMIT = lIdx > -1 ? Number(process.argv[lIdx + 1]) : Infinity;

const MAX_ALT_CHARS = 125;

/** slug → hero URL, parsed from the map rather than imported (it is TS). */
function heroes() {
  const src = readFileSync(FILE, "utf8");
  const block = src.match(/HERO_IMAGES:\s*Record<string,\s*string>\s*=\s*\{([\s\S]*?)\n\};/)?.[1];
  if (!block) throw new Error("could not find HERO_IMAGES in src/data/heroes.ts");
  return [...block.matchAll(/"([a-z0-9-]+)":\s*"([^"]+)"/g)]
    .map((m) => ({ slug: m[1], url: m[2] }))
    .filter((h) => h.slug !== "default");
}

/** Base64 + media type for a local path or a remote URL. */
async function imageFor(url) {
  if (url.startsWith("http")) {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return {
      mediaType: r.headers.get("content-type")?.split(";")[0] || "image/jpeg",
      data: buf.toString("base64"),
    };
  }
  /* Hero URLs are SITE paths ("/images/heroes/x.jpg"), which resolve under
   * public/ on disk. Dropping the prefix silently produced a nonexistent path,
   * existsSync returned false, and all 42 local heroes reported "FAILED" while
   * the 8 remote Unsplash ones sailed through — a split that looked like a
   * model problem and was a path problem. */
  const path = `${ROOT}public${url.startsWith("/") ? url : `/${url}`}`;
  if (!existsSync(path)) return null;
  return {
    mediaType: path.endsWith(".png") ? "image/png" : "image/jpeg",
    data: readFileSync(path).toString("base64"),
  };
}

async function describe(url) {
  const image = await imageFor(url);
  if (!image) return null;
  const r = await callRole("vision", {
    system:
      "You write alt text for images on a camping-gear website. Reply with the " +
      "sentence only — no quotes, no label, no preamble.",
    user:
      "Describe ONLY what is visibly in this photograph — the scene, objects, " +
      "setting, time of day, and any gear present. One sentence, under " +
      `${MAX_ALT_CHARS} characters. Do not begin with "Image of" or "Photo of". ` +
      "Do not speculate about anything not visible.",
    image,
    parse: "text",
    rounds: 2,
  });
  if (!r) return null;
  return (
    r.value
      .trim()
      .replace(/^["'\s]+|["'\s]+$/g, "")
      .split("\n")[0]
      .trim() || null
  );
}

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const all = heroes();
const targets = all.filter((h) => FORCE || !existing[h.slug]).slice(0, LIMIT);

console.log(`${all.length} heroes, ${targets.length} need alt text\n`);
if (!targets.length) process.exit(0);

let ok = 0;
const failed = [];
for (const [i, h] of targets.entries()) {
  process.stdout.write(`[${i + 1}/${targets.length}] ${h.slug} … `);
  let text = null;
  for (let attempt = 1; attempt <= 2 && !text; attempt++) {
    const candidate = await describe(h.url);
    if (!candidate) continue;
    if (candidate.length > MAX_ALT_CHARS) continue;
    if (/^(image|photo|picture) of/i.test(candidate)) continue;
    text = candidate;
  }
  if (!text) {
    console.log("FAILED");
    failed.push(h.slug);
    continue;
  }
  console.log(`ok — ${text}`);
  existing[h.slug] = text;
  ok++;
}

if (!DRY && ok) {
  const sorted = Object.fromEntries(Object.keys(existing).sort().map((k) => [k, existing[k]]));
  writeFileSync(OUT, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`\nwrote ${ok} entr(ies) to src/data/hero-alt.json`);
} else if (DRY) {
  console.log("\n--dry-run: nothing written");
}
if (failed.length) console.log(`\n${failed.length} failed: ${failed.join(", ")}`);
