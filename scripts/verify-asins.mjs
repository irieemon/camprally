#!/usr/bin/env node
/**
 * Verify every Amazon ASIN referenced in src/ actually resolves.
 *
 * Exists because of the art-022 incident (2026-04-11): five affiliate links
 * shipped pointing at B00NPLUG9C, a dead ASIN. Broken links convert at zero
 * and nothing in the pipeline caught it.
 *
 *   node scripts/verify-asins.mjs            # audit every ASIN in src/
 *   node scripts/verify-asins.mjs B014LSDUA8 # check specific ASINs
 *
 * Exits non-zero if any ASIN is DEAD or could not be confirmed.
 *
 * Why curl and not fetch(): Amazon rate-limits Node's fetch aggressively and
 * then answers every request — live ASIN or not — with an identical ~3.8KB
 * stub carrying HTTP 200. Trusting the status code alone silently reports dead
 * links as healthy. curl with a browser UA still gets true 404s, and we
 * additionally require positive evidence of a product page before calling
 * anything OK. Three outcomes, never two:
 *
 *   LIVE     404 not returned AND a real product title was found
 *   DEAD     404 (confirmed across retries)
 *   UNKNOWN  blocked, stubbed, or throttled — treated as failure, not success
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120 Safari/537.36";

const SRC = new URL("../src", import.meta.url).pathname;
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx"]);

// Amazon's throttle stub is a tiny body with no product markup. Anything at or
// under this size cannot be a real product page.
const STUB_MAX_BYTES = 6000;

const RETRIES = 3;
const BASE_DELAY_MS = 1500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory()
      ? walk(full)
      : CODE_EXT.has(extname(full))
        ? [full]
        : [];
  });
}

function collectAsins() {
  const found = new Map(); // asin -> Set of files
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const [, asin] of text.matchAll(/\/dp\/(B[0-9A-Z]{9})/g)) {
      if (!found.has(asin)) found.set(asin, new Set());
      found.get(asin).add(file.replace(SRC, "src"));
    }
  }
  return found;
}

/** One curl attempt. Returns {status, body}. */
async function fetchOnce(asin) {
  const { stdout } = await run(
    "curl",
    [
      "-s",
      "-L",
      "--max-time", "25",
      "-A", UA,
      "-H", "Accept-Language: en-US,en;q=0.9",
      "-w", "\n__STATUS__%{http_code}",
      `https://www.amazon.com/dp/${asin}`,
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  const cut = stdout.lastIndexOf("\n__STATUS__");
  return {
    status: cut === -1 ? 0 : Number(stdout.slice(cut + 11).trim()),
    body: cut === -1 ? stdout : stdout.slice(0, cut),
  };
}

function extractTitle(html) {
  const raw =
    html.match(/id="productTitle"[^>]*>([^<]*)/)?.[1] ??
    html.match(/<title>([^<]*)<\/title>/)?.[1] ??
    "";
  return raw.replace(/&amp;/g, "&").replace(/\s+/g, " ").replace(/^Amazon\.com\s*:?\s*/, "").trim();
}

/** Classify an ASIN, retrying through throttle stubs with backoff. */
async function check(asin) {
  let last = { verdict: "UNKNOWN", reason: "no attempt" };
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    if (attempt > 1) await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    let res;
    try {
      res = await fetchOnce(asin);
    } catch (err) {
      last = { verdict: "UNKNOWN", reason: `curl failed: ${err.code ?? err.message}` };
      continue;
    }
    if (res.status === 404) return { verdict: "DEAD", reason: "HTTP 404" };
    if (res.body.length <= STUB_MAX_BYTES) {
      last = { verdict: "UNKNOWN", reason: `throttle stub (${res.body.length}B, HTTP ${res.status})` };
      continue;
    }
    const title = extractTitle(res.body);
    if (!title) {
      last = { verdict: "UNKNOWN", reason: `no product title (HTTP ${res.status})` };
      continue;
    }
    return { verdict: "LIVE", title: title.slice(0, 68) };
  }
  return last;
}

const explicit = process.argv.slice(2);
const targets = explicit.length
  ? new Map(explicit.map((a) => [a, new Set(["(cli)"])]))
  : collectAsins();

if (targets.size === 0) {
  console.log("No ASINs found in src/.");
  process.exit(0);
}

console.log(`Verifying ${targets.size} ASIN(s) against Amazon...\n`);

const dead = [];
const unknown = [];

for (const [asin, files] of targets) {
  const r = await check(asin);
  if (r.verdict === "LIVE") {
    console.log(`LIVE     ${asin}  ${r.title}`);
  } else if (r.verdict === "DEAD") {
    dead.push([asin, files, r.reason]);
    console.log(`DEAD     ${asin}  ${r.reason}`);
  } else {
    unknown.push([asin, files, r.reason]);
    console.log(`UNKNOWN  ${asin}  ${r.reason}`);
  }
  await sleep(600);
}

const live = targets.size - dead.length - unknown.length;
console.log(`\nLIVE ${live}   DEAD ${dead.length}   UNKNOWN ${unknown.length}`);

for (const [label, rows] of [["DEAD", dead], ["UNKNOWN", unknown]]) {
  if (!rows.length) continue;
  console.log(`\n${label}:`);
  for (const [asin, files, reason] of rows) {
    console.log(`  ${asin} — ${reason}`);
    for (const f of files) console.log(`    ${f}`);
  }
}

if (dead.length || unknown.length) {
  console.log(
    `\nFAILED. UNKNOWN is not a pass — re-run when Amazon stops throttling.`,
  );
  process.exit(1);
}
console.log(`\nAll ${live} ASIN(s) confirmed live.`);
