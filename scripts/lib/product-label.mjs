/**
 * Turn an Amazon product title into a card label.
 *
 * WHY THIS EXISTS. write-article.mjs built the label as
 * `p.title.split(",")[0].slice(0, 34)`. A hard character slice cuts wherever it
 * lands, so 125 of the 235 labels in the corpus end mid-word and 26 end in a
 * bare space:
 *
 *   "JEAREY Folding Camping Cot for Adu"
 *   "Sea to Summit Reactor Insulated Sl"
 *   "Outsunny 2 Person Cot Tent 4-in-1 "
 *
 * Those are the product names a reader sees on every buying guide, and since
 * the ItemList schema mirrors the visible text, they are now also what an
 * answer engine reads back. "Sea to Summit Reactor Insulated Sl" is not a
 * product.
 *
 * 34 was also tighter than the layout ever needed: the label renders in a
 * `min-w-0 flex-1` column with no line clamp, so it wraps freely and a
 * two-line label costs nothing. The cap here is 60.
 *
 * The shortening is structural rather than statistical. Amazon titles are
 * "<name><delimiter><spec dump>", and cutting at the first delimiter usually
 * yields exactly the name — which is why the original `split(",")` was the
 * right instinct applied to too few delimiters.
 */

/** Delimiters that, in an Amazon title, almost always begin the spec dump. */
const SPLIT_ON = /\s*[|(]|\s+[–—]\s+|\s+-\s+|,\s*/;

/* Words a truncation must not end on: cutting after them leaves a dangling
 * clause that reads as an error rather than an abbreviation. */
const DANGLING = new Set([
  "with", "for", "and", "or", "the", "a", "an", "in", "on", "to", "by", "of",
  "plus", "up", "w", "&",
]);

export const MAX_LABEL_CHARS = 60;

export function productLabel(title, max = MAX_LABEL_CHARS) {
  if (!title) return "";

  // Collapse whitespace first so the length test measures what renders.
  let s = String(title).replace(/\s+/g, " ").trim();

  // Take the part before the first spec-dump delimiter, but only if what is
  // left still names the product. "Coleman, " style titles that split down to
  // almost nothing keep the fuller form instead.
  const head = s.split(SPLIT_ON)[0]?.trim();
  if (head && head.length >= 12) s = head;

  if (s.length <= max) return trimEdges(s);

  // Word-boundary cut: keep whole words only.
  const words = s.slice(0, max + 1).split(" ");
  words.pop(); // the word straddling the cap
  while (words.length > 1 && DANGLING.has(strip(words[words.length - 1]))) {
    words.pop();
  }
  const out = trimEdges(words.join(" "));
  /* A single word longer than the cap is the only case a word-boundary cut
   * cannot handle. Hard-slice it rather than return an empty label. */
  return out || trimEdges(s.slice(0, max));
}

const strip = (w) => w.toLowerCase().replace(/[^a-z&]/g, "");

/** Drop trailing punctuation and whitespace a cut can leave behind. */
const trimEdges = (s) => s.replace(/\s+/g, " ").replace(/[\s,;:|/\-–—&(]+$/, "").trim();
