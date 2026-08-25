/**
 * The one place the pipeline learns which article categories actually exist.
 *
 * The authority is `categoryGroups` in src/data/categories.ts, because that is
 * the vocabulary the SITE browses by — the nav, the footer rail and (once the
 * hubs ship) the indexable /blog/category/<slug> pages are all built from it.
 * A category that is not a member of some group is not merely unusual: the
 * article carrying it appears under no filter and on no hub, so it is reachable
 * only from the flat index and from whatever links happen to point at it.
 *
 * That had already happened, silently, nine times. On 2026-08-25 eight of the
 * fifty published articles carried a category no group claimed — `Cooking`
 * (three of them), `Skills`, `Electronics`, `Pets`, `Shelter`, `Family`,
 * `Apparel` — and the pending queue held two more (`Optics`, `Hygiene`). Most
 * are near-synonyms of a real group member: Cooking/Cookware, Shelter/Tents,
 * Apparel/Clothing. Nothing rejected them because write-article.mjs took
 * `brief.category` exactly as typed and defaulted to "Gear" when it was absent.
 *
 * So the vocabulary is read, not restated. Reading TypeScript from a .mjs
 * script is not elegant; it is still better than a copy, because a copy drifts
 * silently and this throws. Same reasoning, and same shape, as
 * scripts/lib/display-window.mjs.
 */
import { readFileSync } from "node:fs";

const ROOT = new URL("../..", import.meta.url).pathname;

/**
 * Every declared member name, in source spelling and source order.
 *
 * Parsed from the `members: [...]` arrays rather than by evaluating the file,
 * so nothing in categories.ts is ever executed. String literals only — a
 * members array containing anything else is treated as unreadable and throws,
 * rather than being silently under-reported (which would reject valid
 * categories and block the queue).
 */
function declaredMembers() {
  const src = readFileSync(`${ROOT}src/data/categories.ts`, "utf8");
  const block = src.match(/categoryGroups\s*:\s*CategoryGroup\[\]\s*=\s*\[([\s\S]*?)\n\];/)?.[1];
  if (!block) {
    throw new Error(
      "could not find `categoryGroups` in src/data/categories.ts — the article " +
      "category vocabulary can no longer be checked",
    );
  }

  const out = [];
  const memberArrays = [...block.matchAll(/members\s*:\s*\[([^\]]*)\]/g)];
  if (!memberArrays.length) {
    throw new Error("`categoryGroups` in src/data/categories.ts declared no `members` arrays");
  }

  for (const [, inner] of memberArrays) {
    const trimmed = inner.trim();
    if (!trimmed) continue;
    // Every element must be a plain quoted string. A computed member (a spread,
    // an identifier, a template) means this parser no longer sees the whole
    // vocabulary, and under-reporting it would reject good briefs.
    if (!/^(\s*"[^"]*"\s*,?)+$/.test(trimmed)) {
      throw new Error(
        `unparseable members array in src/data/categories.ts: [${trimmed}] — ` +
        "expected string literals only",
      );
    }
    for (const [, name] of trimmed.matchAll(/"([^"]*)"/g)) out.push(name);
  }
  return out;
}

/**
 * Every raw article category that some group claims, as a lowercase Set.
 *
 * Parsed from the `members: [...]` arrays rather than by evaluating the file,
 * so nothing in categories.ts is ever executed.
 */
export function knownCategories() {
  return new Set(declaredMembers().map((n) => n.toLowerCase()));
}

/**
 * Resolve a brief's category to the exact casing categories.ts uses, or return
 * null if no group claims it.
 *
 * Case-insensitive on the way in because briefs are hand-written, exact on the
 * way out because `matchesCategory` compares against `members` directly.
 */
export function canonicalCategory(value) {
  if (!value) return null;
  const wanted = String(value).trim().toLowerCase();
  /* Recover the declared spelling from `members` ONLY. Scanning the whole file
   * for a matching string literal looks equivalent and is not: every group also
   * has a lowercase `slug`, and several slugs collide with a member name
   * ("clothing" the slug vs "Clothing" the member). The slug is declared first,
   * so a whole-file scan returns it and the article ends up carrying a category
   * spelled differently from anything `matchesCategory` compares against. */
  for (const name of declaredMembers()) {
    if (name.toLowerCase() === wanted) return name;
  }
  return null;
}
