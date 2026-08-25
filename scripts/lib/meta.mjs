/**
 * Meta-description rules, as pure functions.
 *
 * Extracted rather than left inline in write-article.mjs for the same reason
 * `classifyTransition` was pulled out of the power watcher: a decision buried in
 * a CLI script with top-level awaits and process.exit calls cannot be imported,
 * so it cannot be covered directly, so the only way to exercise it is to run the
 * whole pipeline and spend a paid generation to find out.
 */

/** Comparison form: case, punctuation and spacing all stop mattering. */
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Is this excerpt just the title wearing a full stop?
 *
 * The prefix tests, not merely equality, are what catch the real shapes. The
 * regression this exists to stop produced `${title}.` exactly — equality would
 * have caught that one — but a model told not to restate the title will happily
 * return the title plus a trailing clause, or the title truncated. Both read as
 * a duplicate snippet in a search result, so both are refused.
 *
 * An empty or missing excerpt counts as degenerate. It is the same defect from
 * the reader's side (no useful snippet) and collapsing the two means the caller
 * has one gate to pass rather than two to remember.
 */
export function excerptIsDegenerate(excerpt, title) {
  const e = norm(excerpt);
  const t = norm(title);
  if (!e) return true;
  if (!t) return false;
  return e === t || e.startsWith(t) || t.startsWith(e);
}

/**
 * Google renders roughly 155 characters. Below this the snippet is mostly
 * empty space, which is a wasted result even when the sentence is honest.
 */
export const MIN_EXCERPT_CHARS = 100;
