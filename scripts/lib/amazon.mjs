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
 * The product's main photograph, normalised to one rendering size.
 *
 * Anchored on the `landingImage` element rather than the first image-looking
 * URL in the page: a product page carries dozens of media URLs (related items,
 * brand banners, "customers also bought"), and the first match is frequently
 * an entirely different product.
 *
 * Amazon serves the same photo at any size by swapping the token between the
 * image id and the extension — `61620kFMmvL._AC_SL1500_.jpg` and
 * `61620kFMmvL._AC_SX522_.jpg` are one image. Everything is normalised to
 * SX522 so the catalog holds one canonical URL per product and build-catalog's
 * duplicate-photo check compares like with like.
 */
export function extractImage(html) {
  const tag = html.match(/<img[^>]*id="landingImage"[^>]*>/)?.[0] ?? "";

  const candidate =
    tag.match(/data-old-hires="(https:\/\/[^"]+)"/)?.[1] ||
    // The dynamic set is JSON with HTML-escaped quotes; any entry works because
    // they differ only in the size token we are about to discard.
    tag.match(/data-a-dynamic-image="[^"]*?(https:\/\/m\.media-amazon\.com\/images\/I\/[^&"]+)/)?.[1] ||
    // The ImageBlockATF payload lists the main image first.
    html.match(/"hiRes":"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/)?.[1] ||
    html.match(/"large":"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/)?.[1] ||
    "";

  /* The element's plain `src` is deliberately NOT consulted. On a lazily
   * hydrated page it holds a 1x1 transparent placeholder, and taking it
   * silently assigned the same grey pixel to a Sawyer Squeeze and a LifeStraw
   * — two products that then both lost their photo to the duplicate-image
   * guard. The hi-res attributes are absent rather than fake when the page has
   * not hydrated, so a miss is honest and the ASIN is simply retried. */

  const id = candidate.split("/images/I/")[1]?.split("._")[0]?.replace(/\.(jpg|jpeg|png|gif)$/i, "");
  // Placeholder greys and sprites are served from the same host; a real product
  // image id is a long mixed-case token and never starts with a zero.
  if (!id || id.length < 8 || id.startsWith("0")) return null;
  return `https://m.media-amazon.com/images/I/${id}._AC_SX522_.jpg`;
}

/**
 * Classify a single ASIN.
 * @returns {{verdict:"LIVE"|"DEAD"|"UNKNOWN", title?:string, image?:string|null, reason?:string}}
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
    // The photo rides along on a page we already paid for. A missing image is
    // never a reason to downgrade the verdict — the title is what LIVE means.
    return { verdict: "LIVE", title, image: extractImage(res.body) };
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
