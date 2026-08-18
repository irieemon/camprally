#!/usr/bin/env node
/**
 * Control for run-cycle's backfillPhotos: a throttled PHOTO scrape must never
 * block the catalog rebuild. When both sat in one try-block,
 * best-camping-socks shipped 2026-08-18 with its products absent from
 * catalog.json entirely — no prices AND no images.
 *
 * run-cycle.mjs executes on import (locks, git, publishing), so it cannot be
 * imported here. Instead the function's SOURCE is extracted from the real file
 * at run time and evaluated with a recording `sh` stub — if the function is
 * edited, this test re-extracts the current text, so it cannot drift into
 * testing a stale copy.
 *
 * Run: node scripts/test-cycle-backfill.mjs
 */

import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./run-cycle.mjs", import.meta.url), "utf8");
const m = /function backfillPhotos\(when\) \{[\s\S]*?\n\}/.exec(src);
if (!m) {
  console.error("FAIL: could not extract backfillPhotos from run-cycle.mjs");
  process.exit(1);
}

let failures = 0;
function scenario(name, backfillBehaviour, expectCatalogRun) {
  const calls = [];
  const sh = (_cmd, args) => {
    const script = args.find((a) => a.endsWith(".mjs")) ?? args.join(" ");
    calls.push(script);
    if (script.includes("backfill-product-images") && backfillBehaviour === "throw") {
      const err = new Error("exit 2: nothing resolved");
      err.stdout = "  B074QY3KF1  throttle stub";
      throw err;
    }
    return "";
  };
  const fn = new Function("sh", "console", `${m[0]}; return backfillPhotos;`)(
    sh, { log: () => {} });
  let threw = false;
  try {
    fn("publish");
  } catch {
    threw = true;
  }
  const catalogRan = calls.some((c) => c.includes("build-catalog"));
  const ok = catalogRan === expectCatalogRun && !threw;
  console.log(`${ok ? "  ok " : "FAIL "} ${name} — build-catalog ${catalogRan ? "ran" : "did NOT run"}${threw ? " (and backfillPhotos threw, which must not happen)" : ""}`);
  if (!ok) failures++;
}

scenario("backfill throttled (throws) -> catalog still rebuilds", "throw", true);
scenario("backfill healthy -> catalog rebuilds", "ok", true);

if (failures) {
  console.error(`\n${failures} control(s) failed`);
  process.exit(1);
}
console.log("\nall backfill controls passed");
