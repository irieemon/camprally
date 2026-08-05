/**
 * Reading the receipt trail.
 *
 * Receipts already prove the host is alive. What they were not being used for
 * is the question that actually matters: is this thing still producing? The
 * outcome vocabulary makes `deferred` and `idle` exit 0, which is right for a
 * single run — Amazon throttled, or the queue is genuinely empty — and wrong
 * for thirty of them in a row. That is precisely how the pipeline died between
 * April and August: every individual run was fine and nothing summed them up.
 */

import { readdirSync, readFileSync } from "node:fs";

/** Receipts newest first. Filenames are ISO timestamps, so they sort lexically. */
export function receipts(runsDir, limit = 60) {
  let names;
  try {
    names = readdirSync(runsDir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, limit);
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    try {
      return [{ name, ...JSON.parse(readFileSync(`${runsDir}/${name}`, "utf8")) }];
    } catch {
      return []; // a half-written receipt is not worth failing over
    }
  });
}

/* `published-unverified` still shipped an article — the commit landed and the
 * push succeeded, only the deploy could not be confirmed in time. It counts as
 * production for stall purposes; treating it as a non-event would report a
 * healthy pipeline as stalled every time Vercel was slow. */
const PUBLISHED = new Set(["published", "published-unverified"]);

/**
 * How many runs since the last one that published, and what they were doing.
 *
 * Paused runs are skipped rather than counted: a deliberate pause is not a
 * stall, and counting it would page someone for doing what they meant to do.
 */
export function sinceLastPublish(runsDir, limit = 60) {
  const all = receipts(runsDir, limit);
  const reasons = [];
  let runs = 0;
  for (const r of all) {
    if (PUBLISHED.has(r.outcome)) break;
    if (r.reason === "paused") continue;
    runs++;
    if (r.reason && !reasons.includes(r.reason)) reasons.push(r.reason);
  }
  return { runs, reasons, lastPublishedAt: all.find((r) => PUBLISHED.has(r.outcome))?.finishedAt ?? null };
}
