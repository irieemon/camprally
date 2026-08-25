/**
 * Rebuild the product labels in src/data/article-sections.ts from the real
 * Amazon titles.
 *
 * Backfill for the hard `slice(0, 34)` that write-article.mjs used to apply.
 * 125 of 235 labels end mid-word and 26 end in a bare space — "Sea to Summit
 * Reactor Insulated Sl" — and since the ItemList schema mirrors visible text,
 * those are now machine-readable too.
 *
 * The full titles were never lost: state/asin-cache.json keeps them (up to 237
 * characters), and src/data/catalog.json carries them for everything currently
 * referenced. So this reads the real title per ASIN and re-derives the label
 * through the same productLabel() the generator now uses — one rule, not a
 * second implementation that drifts.
 *
 * Only rewrites a label when the new one differs, and never when the ASIN
 * cannot be resolved, so it is safe to re-run and leaves hand-edited labels
 * that already match alone.
 *
 *   node scripts/backfill-labels.mjs [--dry-run]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { productLabel } from "./lib/product-label.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const FILE = `${ROOT}src/data/article-sections.ts`;

const DRY = process.argv.includes("--dry-run");

/** asin → full title, catalog first, then the pipeline's own cache. */
function titleIndex() {
  const out = new Map();
  const cache = JSON.parse(readFileSync(`${ROOT}state/asin-cache.json`, "utf8"));
  for (const [asin, e] of Object.entries(cache.entries ?? {})) {
    if (e?.title) out.set(asin, e.title);
  }
  const catalog = JSON.parse(readFileSync(`${ROOT}src/data/catalog.json`, "utf8"));
  const products = catalog.products ?? [];
  for (const p of Array.isArray(products) ? products : Object.values(products)) {
    // Catalog wins: it is what the site renders from.
    if (p?.asin && p?.title) out.set(p.asin, p.title);
  }
  return out;
}

const titles = titleIndex();
const src = readFileSync(FILE, "utf8");

let changed = 0;
let unresolved = 0;
let same = 0;
const samples = [];

/* Rewrite in place with a replace callback over each `{ label: … asin: … }`
 * item. Matching the pair together is what keeps a label bound to its own ASIN;
 * matching them separately and zipping by index would silently mis-pair the
 * moment one item lacks an asin.
 *
 * `(?:[^"\\]|\\.)*` rather than `[^"]*`, because a label may contain an ESCAPED
 * quote — one in this corpus does: "Fire Starter - 3/8\" Thick Ferro Ro", a
 * product measured in inches. The naive class stops at the backslash, captures
 * a half label, and the replacement emits a broken string literal that takes
 * the whole module out. Caught by tsc on the first run; guarded here so it
 * cannot come back. */
const out = src.replace(
  /label: "((?:[^"\\]|\\.)*)"([^}]*?)(?:asin: "([^"]*)"|link: "([^"]*)")/g,
  (full, label, middle, asin, link) => {
    /* Some items carry no `asin` field and keep the ASIN inside `link` — the
     * render path already handles that with `productFor(item.asin ?? item.link)`
     * and this must match it, or those items keep their truncated labels while
     * their neighbours are fixed. Four labels sat in exactly that state. */
    const key = asin || link?.match(/\/dp\/(B[0-9A-Z]{9})/)?.[1];
    const real = key && titles.get(key);
    if (!real) {
      unresolved++;
      return full;
    }
    const next = productLabel(real);
    if (!next || next === label) {
      same++;
      return full;
    }
    changed++;
    if (samples.length < 10) samples.push([label, next]);
    /* Escaped, not rejected: inch marks are common in gear names ("3/8\" Ferro
     * Rod") and a product measured in inches should keep its real label rather
     * than be skipped for containing the character that names the unit. */
    const escaped = next.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    /* Rebuild whichever tail this match actually had. Hardcoding `asin:` here
     * would rewrite a link-only item's `link:` key into an `asin:` holding an
     * undefined, quietly destroying the only pointer to the product. */
    const tail = asin ? `asin: "${asin}"` : `link: "${link}"`;
    return `label: "${escaped}"${middle}${tail}`;
  },
);

console.log(`labels rewritten : ${changed}`);
console.log(`already correct  : ${same}`);
console.log(`unresolved asin  : ${unresolved}`);
if (samples.length) {
  console.log("\n--- sample ---");
  for (const [before, after] of samples) {
    console.log(`  ${JSON.stringify(before)}\n  → ${JSON.stringify(after)}\n`);
  }
}

if (DRY) {
  console.log("--dry-run: nothing written");
} else if (changed) {
  writeFileSync(FILE, out);
  console.log(`wrote ${changed} label(s) to src/data/article-sections.ts`);
}
