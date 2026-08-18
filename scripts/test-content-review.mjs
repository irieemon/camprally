#!/usr/bin/env node
/**
 * Tests for the deterministic half of the content review.
 *
 *   node scripts/test-content-review.mjs
 *
 * These rules block publishing, which makes both directions expensive: a rule
 * that never fires is decoration, and a rule that fires on good writing
 * quarantines articles that were fine. So the fixtures assert both, and the
 * whole published corpus is swept as a negative case — 26 articles a human
 * already approved are the best available proof that the rules are not
 * trigger-happy.
 *
 * Every case below is a real phrasing the rules got wrong at some point during
 * their development, kept so the fix stays fixed.
 */

import { readFileSync } from "node:fs";
import { hazardFlags } from "./lib/content-review.mjs";

const ROOT = new URL("..", import.meta.url).pathname;

const SHOULD_FLAG = [
  ["combustion-in-shelter", "A small propane stove works well inside the tent when it rains."],
  // Names the fuel in one sentence and the enclosed space in the next; neither
  // half is alarming alone, which is why units include adjacent pairs.
  ["combustion-in-shelter", "Bring a charcoal grill. Set it up in your vestibule to stay dry while cooking."],
  ["combustion-in-shelter", "Run the generator in the camper so the noise stays down."],
  ["heater-while-sleeping", "A propane heater will keep you toasty while you sleep through the night."],
  ["cotton-for-warmth", "Pack a cotton base layer for warmth on cold mornings."],
  /* The exclusion widened on 2026-08-11 to stop condemnations reading as
   * endorsements. These are the endorsements it must still catch: cosy,
   * approving, and mentioning neither an alternative fibre nor moisture. */
  ["cotton-for-warmth", "A cotton hoodie is all the insulation you need for a freezing night."],
  ["cotton-for-warmth", "Cotton thermals are the cosiest choice for winter camping."],
  /* Both slipped through the ORIGINAL rule and were found while fixing the
   * comparative false positive below — misses of genuinely dangerous advice,
   * which is the direction that matters most.
   *
   * The first excused itself on the word SWEATSHIRT: the moisture exclusion
   * used `sweat\w*`, so a garment name read as evidence the prose was
   * discussing moisture. The second names `fleece`, which tripped the
   * alternative-fibre exclusion — that exclusion assumes naming another fibre
   * means contrasting AWAY from cotton, and here it means the opposite,
   * because cotton is the subject of the comparison rather than its object. */
  ["cotton-for-warmth", "A thick cotton sweatshirt is the warmest thing you can bring for winter camping."],
  ["cotton-for-warmth", "Cotton beats fleece for warmth, so choose a cotton base layer."],
  ["cotton-for-warmth", "Cotton is warmer than merino, so pack cotton for the cold nights."],
  ["cotton-for-warmth", "Bring cotton sweatpants as your thermal layer."],
  /* Guards the sogg\w* exclusion added 2026-08-18: an endorsement that merely
   * MENTIONS sogginess as the thing cotton avoids must still flag — the word
   * alone is not a licence, the prose has to be condemning cotton. */
  ["cotton-for-warmth", "Cotton socks keep your feet warm and never soggy, so pack cotton for winter hikes."],
  /* `without` and `skip` are excluded only when bound to their own hazard noun,
   * never globally. These two prove it: both use the word and both are real
   * hazards that must still flag. */
  ["combustion-in-shelter", "Run the propane heater without ventilation inside your tent."],
  ["combustion-in-shelter", "Skip the vent flaps and run a gas stove inside the tent."],
  ["untreated-water", "You can drink straight from the stream on this trail."],
  ["food-in-tent", "Keep your snacks in the tent so raccoons cannot reach them."],
];

const SHOULD_NOT_FLAG = [
  "Never run a propane stove inside the tent — carbon monoxide is odourless and deadly.",
  "Use a battery lantern inside the tent; anything that burns fuel stays outside.",
  // The colon used to split this into a fragment that read as an endorsement of
  // cotton, because the negation stayed behind in the first half.
  "Avoid cotton base layers for warmth: once damp, cotton stops insulating.",
  "Do not drink from the stream without filtering or boiling it first.",
  "Filter water from any creek or lake before you drink it.",
  "Store food in a bear canister, never in the tent.",
  "A solar lantern is the safest light to use inside the tent.",
  "Cotton is comfortable in hot weather when staying warm is not the concern.",
  /* Both of these are real drafts the rule quarantined, and both give exactly
   * the right advice. Neither contains a negation word — they condemn cotton by
   * describing what it does, which is how a good writer actually writes it. */
  "Base layers in fall should be synthetic or merino. Cotton absorbs sweat, holds it against your skin, and stops insulating the moment it gets damp.",
  "Merino wool keeps insulating when wet. Cotton soaks through and stays cold against the skin all night.",
  "A higher R-value pad, a real layering system without cotton, and a full rainfly get you most of the way to a warm night.",
  "Skip combustion devices inside the tent, treat your water, keep food out of your shelter, and October becomes the best month on the calendar.",
  "Keep the campfire well outside the tent, at least fifteen feet away.",
  /* THE COMPARATIVE FALSE POSITIVE. This exact sentence blocked
   * best-camping-blankets-under-40 on five consecutive daily runs
   * (2026-08-08 to 08-12) — cotton is the thing being BEATEN, which is the
   * correct recommendation. It carries no negation, names no alternative
   * fibre and mentions no moisture, so every existing exclusion missed it.
   *
   * Note the adjacent-PAIR unit was already excluded, because its wider
   * context reached "not to a spec sheet" in the preceding sentence. Only the
   * single-sentence unit fired, so widening the pair window would not have
   * helped — the signal was never in the window. */
  "Match the blanket to your actual trip, not to a spec sheet. Any of the six options above will out-warm a cotton throw at the same price, and that is the bar worth clearing before you spend anything.",
  "It stays warmer than cotton once the temperature drops below freezing.",
  "This blanket dries faster than a cotton throw after a wet morning.",
  "Choose it over cotton when the forecast turns cold.",
  "Unlike cotton, it keeps insulating in freezing conditions.",
  "Merino outperforms cotton in cold weather.",
  /* THE SOGGY FALSE POSITIVE. This is the verbatim intro that quarantined
   * best-camping-socks a THIRD time (2026-08-18) — it describes the cotton
   * mistake and names the moisture failure, but with a word ("soggy") the
   * moisture exclusion did not list. The wider article says "skip cotton"
   * twice; only this unit fired. */
  "Most new campers obsess over tents, sleeping pads, and stoves, then grab whatever cotton socks are clean on the way out the door. That single choice decides whether your feet are warm, dry, and blister-free or a miserable, soggy mess by mile three.",
];

let pass = 0;
const failures = [];

for (const [id, text] of SHOULD_FLAG) {
  if (hazardFlags({ body: text }).some((h) => h.id === id)) pass++;
  else failures.push(`MISSED ${id}: "${text}"`);
}

for (const text of SHOULD_NOT_FLAG) {
  const hits = hazardFlags({ body: text });
  if (!hits.length) pass++;
  else failures.push(`FALSE POSITIVE (${hits.map((h) => h.id).join(", ")}): "${text}"`);
}

/* The published corpus. articles.ts is one long TypeScript file rather than a
 * list of bodies, so each article is taken as the slice between its slug and
 * the next — imprecise, but it errs toward feeding the rules MORE text than a
 * real article contains, which only makes the negative test harder to pass. */
const src = readFileSync(`${ROOT}src/data/articles.ts`, "utf8");
const slugs = [...src.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
for (let i = 0; i < slugs.length; i++) {
  const start = src.indexOf(`slug: "${slugs[i]}"`);
  const end = i + 1 < slugs.length ? src.indexOf(`slug: "${slugs[i + 1]}"`) : src.length;
  const hits = hazardFlags({ body: src.slice(start, end) });
  if (!hits.length) pass++;
  else failures.push(`FALSE POSITIVE in published ${slugs[i]}: ${hits.map((h) => `${h.id} — "${h.text}"`).join(" | ")}`);
}

console.log(`${pass} passed, ${failures.length} failed  (${slugs.length} published articles swept)`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
