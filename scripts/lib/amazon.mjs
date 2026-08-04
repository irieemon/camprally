/**
 * Amazon ASIN verification, shared by verify-asins.mjs and publish-article.mjs.
 *
 * Three outcomes, never two. The distinction between DEAD and UNKNOWN is the
 * whole point of this module:
 *
 *   LIVE     product page fetched and a real product title was found
 *   DEAD     confirmed 404 — the link is broken, fail the run
 *   UNKNOWN  throttled/blocked — we do NOT know. Defer, do not fail.
 *
 * Collapsing UNKNOWN into either bucket causes a specific bug in each
 * direction: treat it as LIVE and dead links ship (this happened — an earlier
 * version trusted HTTP 200 and reported "all 54 resolve" while six were dead);
 * treat it as DEAD and a rate-limit window looks like catastrophic link rot.
 *
 * Amazon rate-limits hard. It answers a throttled client with an identical
 * ~3.8KB stub carrying HTTP 200, so status codes alone are not trustworthy and
 * we require positive evidence of a product page before returning LIVE.
 * Node's fetch() gets throttled far more aggressively than curl, hence curl.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120 Safari/537.36";

/** Throttle stubs are tiny. A real product page is never this small. */
const STUB_MAX_BYTES = 6000;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOnce(asin, timeoutSec) {
  const { stdout } = await run(
    "curl",
    [
      "-s", "-L",
      "--max-time", String(timeoutSec),
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

export function extractTitle(html) {
  const raw =
    html.match(/id="productTitle"[^>]*>([^<]*)/)?.[1] ??
    html.match(/<title>([^<]*)<\/title>/)?.[1] ??
    "";
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .replace(/^Amazon\.com\s*:?\s*/, "")
    .trim();
}

/**
 * Classify a single ASIN.
 * @returns {{verdict:"LIVE"|"DEAD"|"UNKNOWN", title?:string, reason?:string}}
 */
export async function verifyAsin(asin, { retries = 3, baseDelayMs = 1500, timeoutSec = 25 } = {}) {
  let last = { verdict: "UNKNOWN", reason: "no attempt made" };
  for (let attempt = 1; attempt <= retries; attempt++) {
    if (attempt > 1) await sleep(baseDelayMs * 2 ** (attempt - 1));
    let res;
    try {
      res = await fetchOnce(asin, timeoutSec);
    } catch (err) {
      last = { verdict: "UNKNOWN", reason: `curl failed: ${err.code ?? err.message}` };
      continue;
    }
    // A true 404 is the one signal Amazon gives honestly even while throttling.
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
    return { verdict: "LIVE", title };
  }
  return last;
}

/**
 * Verify many ASINs, pacing between them so we do not induce the throttling
 * we are trying to detect.
 * @returns {Promise<Map<string, {verdict:string, title?:string, reason?:string}>>}
 */
export async function verifyMany(asins, { onResult, gapMs = 600, ...opts } = {}) {
  const results = new Map();
  for (const asin of asins) {
    const r = await verifyAsin(asin, opts);
    results.set(asin, r);
    onResult?.(asin, r);
    await sleep(gapMs);
  }
  return results;
}

/** Bucket a results Map into the three verdicts. */
export function summarize(results) {
  const live = [], dead = [], unknown = [];
  for (const [asin, r] of results) {
    (r.verdict === "LIVE" ? live : r.verdict === "DEAD" ? dead : unknown).push([asin, r]);
  }
  return { live, dead, unknown };
}

/**
 * Exit codes shared across the pipeline. Tier 3 branches on these:
 *   0 OK      proceed
 *   1 FAIL    real problem, write a blocker and stop
 *   2 DEFER   transient (throttled) — retry later, do not treat as failure
 */
export const EXIT = { OK: 0, FAIL: 1, DEFER: 2 };
