/**
 * The one place the pipeline learns how old a price may be and still render.
 *
 * The authority is `PRICE_MAX_AGE_MS` in src/lib/catalog.ts, because that is
 * the constant the SITE actually consults when deciding whether to print a
 * number or fall back to "Check price". Everything upstream — how often we
 * re-price, when we warn that prices are about to vanish — only matters
 * relative to it.
 *
 * By 2026-08-11 that number existed in three places: catalog.ts, a `10 * 24 *
 * 60 * 60 * 1000` in price-cycle.mjs, and prose in the refresh-prices header.
 * Nothing kept them in step, and every way they could drift ends the same way:
 * the refresh interval creeps past the display cutoff and prices disappear
 * site-wide, which is precisely the failure the two-value split was introduced
 * to prevent. So it is read, not restated.
 *
 * Reading TypeScript from a .mjs script is not elegant. It is still better than
 * a copy, because a copy fails silently and this throws.
 */
import { readFileSync } from "node:fs";

const ROOT = new URL("../..", import.meta.url).pathname;

export function displayMaxAgeMs() {
  const src = readFileSync(`${ROOT}src/lib/catalog.ts`, "utf8");
  const expr = src.match(/PRICE_MAX_AGE_MS\s*=\s*([^;]+);/)?.[1]?.trim();
  /* Arithmetic on literals only. The guard is what makes evaluating source text
   * acceptable here: anything with an identifier, call or template in it is
   * rejected rather than run. */
  if (!expr || !/^[\d\s*+\-/().]+$/.test(expr)) {
    throw new Error(
      "could not read PRICE_MAX_AGE_MS from src/lib/catalog.ts — the refresh " +
      "interval can no longer be checked against the display cutoff",
    );
  }
  const ms = Function(`return (${expr})`)();
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error(`PRICE_MAX_AGE_MS evaluated to ${ms}, which is not a duration`);
  }
  return ms;
}

export const displayMaxAgeHours = () => displayMaxAgeMs() / 3_600_000;
