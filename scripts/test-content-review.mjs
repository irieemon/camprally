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
