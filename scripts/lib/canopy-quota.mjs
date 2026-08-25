/**
 * Canopy quota memory.
 *
 * When Canopy answers PLAN_LIMIT_EXCEEDED, every further request this month
 * is a guaranteed failure — but before this ledger existed the pipeline kept
 * asking anyway, three cycles a day, and each price refresh burned its whole
 * retry budget rediscovering the same 402. Worse, the answer arrives slowly:
 * a cycle spent minutes timing out against an API that had already said no.
 *
 * The ledger records the first refusal and answers "is Canopy worth calling?"
 * locally until the plan resets. Canopy's free tier resets monthly; we assume
 * the 1st of the month UTC. If that guess is early the first call of the new
 * month gets refused again and simply re-arms the ledger — one wasted request
 * a month, self-correcting.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const LEDGER = new URL("../../state/canopy-quota.json", import.meta.url).pathname;

function firstOfNextMonthUtc(from = new Date()) {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1)).toISOString();
}

/**
 * How long a single refusal silences Canopy for.
 *
 * THIS USED TO BE "UNTIL THE 1ST", which on a metered plan is the wrong shape
 * by an order of magnitude. The month-long latch assumes the only reason for a
 * 402 is a free tier running out, so waiting for the reset is the only cure. On
 * pay-as-you-go a 402 means something else — a spend cap, a lapsed card, a
 * transient biller error — all of which are fixed in minutes. Latching for up
 * to 31 days turns a five-minute billing problem into weeks of silently
 * degraded output: discovery never runs, every article quietly falls back to
 * cached products, and no receipt says why.
 *
 * Six hours keeps the property the ledger was built for — a refusing API is not
 * re-asked three times a day, and a cycle does not spend minutes timing out
 * against a definite no — while making the failure self-correcting on any plan.
 * The month boundary is still honoured as a ceiling, because if the free-tier
 * reading IS right, the reset is when it genuinely comes back.
 */
const RETRY_AFTER_MS = Number(process.env.CANOPY_RETRY_AFTER_MS ?? 6 * 60 * 60 * 1000);

export function quotaExhausted(now = new Date()) {
  if (!existsSync(LEDGER)) return false;
  try {
    const { resetsAt, exhaustedAt } = JSON.parse(readFileSync(LEDGER, "utf8"));
    if (!resetsAt) return false;
    /* Whichever comes SOONER: the short retry window, or the monthly reset.
     * A ledger written before this field existed has no exhaustedAt, in which
     * case fall back to the old behaviour rather than treating it as expired. */
    const retryAt = exhaustedAt
      ? new Date(new Date(exhaustedAt).getTime() + RETRY_AFTER_MS)
      : new Date(resetsAt);
    const clearAt = retryAt < new Date(resetsAt) ? retryAt : new Date(resetsAt);
    return now < clearAt;
  } catch {
    return false;
  }
}

export function markQuotaExhausted(now = new Date()) {
  mkdirSync(new URL("../../state/", import.meta.url).pathname, { recursive: true });
  writeFileSync(
    LEDGER,
    JSON.stringify(
      { exhaustedAt: now.toISOString(), resetsAt: firstOfNextMonthUtc(now) },
      null,
      2,
    ) + "\n",
  );
}
