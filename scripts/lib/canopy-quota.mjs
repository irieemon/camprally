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

export function quotaExhausted(now = new Date()) {
  if (!existsSync(LEDGER)) return false;
  try {
    const { resetsAt } = JSON.parse(readFileSync(LEDGER, "utf8"));
    return Boolean(resetsAt) && now < new Date(resetsAt);
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
