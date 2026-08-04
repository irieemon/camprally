/**
 * The set of ASINs the site actually references.
 *
 * Deliberately excludes the generated data files. src/data/catalog.json lists
 * every product we know about, so scanning it to decide what to track is
 * circular: once an ASIN entered the catalog it stayed tracked forever, was
 * re-priced forever, and could never drop out when the article referencing it
 * was retired. That loop is how an Echo Dot — a probe ASIN nothing links —
 * ended up billing a price lookup on every run.
 *
 * Truth is what the articles, the article template, and the pending specs
 * point at. Everything else is derived from that.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";

const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".json"]);
const GENERATED = new Set(["catalog.json", "product-images.json", "prices.json"]);

function walk(dir) {
  return readdirSync(dir).flatMap((e) => {
    const f = join(dir, e);
    return statSync(f).isDirectory() ? walk(f) : EXT.has(extname(f)) ? [f] : [];
  });
}

/** @returns {Set<string>} ASINs referenced by hand-authored site content. */
export function referencedAsins(root) {
  const asins = new Set();
  for (const dir of [`${root}src`, `${root}specs`]) {
    if (!existsSync(dir)) continue;
    for (const f of walk(dir)) {
      if (GENERATED.has(basename(f))) continue;
      const t = readFileSync(f, "utf8");
      for (const [, a] of t.matchAll(/\/dp\/(B[0-9A-Z]{9})/g)) asins.add(a);
      for (const [, a] of t.matchAll(/"asin"\s*:\s*"(B[0-9A-Z]{9})"/g)) asins.add(a);
      for (const [, a] of t.matchAll(/asin: "(B[0-9A-Z]{9})"/g)) asins.add(a);
    }
  }
  return asins;
}
