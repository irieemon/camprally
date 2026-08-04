/**
 * Persistent ASIN verification cache.
 *
 * Why this exists: Amazon rate-limits a residential IP after a few dozen
 * product requests and the block lasts hours, not minutes. Verifying every
 * ASIN at publish time therefore does not work — the publish would defer all
 * day. Observed 2026-08-04: 7 ASINs could not be confirmed across three
 * attempts spanning 30+ minutes.
 *
 * So verification is decoupled from publishing:
 *
 *   publish       reads the cache — instant, no network
 *   refresh-asins re-verifies the few stalest entries per run, staying under
 *                 the rate limit, run on a slow cron
 *
 * The tradeoff is that a link can rot for up to STALE_AFTER_DAYS before we
 * notice. That is the correct trade: the previous state of the world was
 * 40% dead links undetected for four months.
 *
 * UNKNOWN results are never written as a verdict — a throttled probe tells us
 * nothing, and recording it would let a throttle window quietly erase a known
 * good entry.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname } from "node:path";

const CACHE_PATH = new URL("../../state/asin-cache.json", import.meta.url).pathname;

/** Entries older than this are candidates for re-verification. */
export const STALE_AFTER_DAYS = 14;

export function loadCache() {
  if (!existsSync(CACHE_PATH)) return { version: 1, entries: {} };
  try {
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
    return parsed?.entries ? parsed : { version: 1, entries: {} };
  } catch {
    // A corrupt cache must not wedge the pipeline; rebuild it from scratch.
    return { version: 1, entries: {} };
  }
}

export function saveCache(cache) {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  // Write-then-rename: rename is atomic on the same filesystem, so a crash
  // mid-write leaves the previous cache intact rather than a truncated file.
  const tmp = `${CACHE_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(cache, null, 2) + "\n");
  renameSync(tmp, CACHE_PATH);
}

/**
 * Record a verdict. UNKNOWN is deliberately ignored — see module docstring.
 * @param {string} nowIso caller supplies the timestamp so runs are reproducible
 */
export function record(cache, asin, result, nowIso) {
  if (result.verdict === "UNKNOWN") return false;
  cache.entries[asin] = {
    verdict: result.verdict,
    title: result.title ?? cache.entries[asin]?.title ?? "",
    checkedAt: nowIso,
  };
  return true;
}

export function get(cache, asin) {
  return cache.entries[asin] ?? null;
}

export function ageDays(entry, nowMs) {
  if (!entry?.checkedAt) return Infinity;
  return (nowMs - Date.parse(entry.checkedAt)) / 86_400_000;
}

/**
 * Split ASINs by what the cache can tell us.
 *   live    cached LIVE
 *   dead    cached DEAD — block the publish
 *   unseen  never successfully verified — block the publish (fail closed)
 */
export function classify(cache, asins) {
  const live = [], dead = [], unseen = [];
  for (const asin of asins) {
    const e = get(cache, asin);
    if (!e) unseen.push(asin);
    else if (e.verdict === "LIVE") live.push(asin);
    else dead.push(asin);
  }
  return { live, dead, unseen };
}

/** ASINs most in need of a refresh: never-checked first, then stalest. */
export function stalest(cache, asins, nowMs, limit) {
  return [...asins]
    .map((asin) => ({ asin, age: ageDays(get(cache, asin), nowMs) }))
    .filter(({ age }) => age >= STALE_AFTER_DAYS)
    .sort((a, b) => b.age - a.age)
    .slice(0, limit)
    .map(({ asin }) => asin);
}

export { CACHE_PATH };
