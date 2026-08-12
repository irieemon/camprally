/**
 * Safety and accuracy review for an article spec, before it can be published.
 *
 * The printables rail has had content guards since its first release; the
 * articles rail has had none, which is backwards — 26 published pages reach far
 * more people than two products do, and the only thing standing between a
 * model-written article and production was whether TypeScript compiled. A
 * generated article can recommend running a propane heater inside a tent and
 * every existing gate passes it: the ASINs are live, the prices are fresh, the
 * build is green.
 *
 * Two layers, and the split is deliberate:
 *
 *   Deterministic rules are free, so they always run, and they BLOCK. They
 *   cover the handful of camping mistakes that are unambiguously dangerous.
 *
 *   The model review catches what rules cannot enumerate, but it needs the
 *   network. It NEVER blocks on its own failure — a review that cannot reach
 *   MiniMax degrades to "no notes", because a publisher wedged by an API
 *   outage is a worse outcome than an unreviewed article, and the
 *   deterministic layer is still standing.
 */

import { panel } from "./llm.mjs";

/**
 * The spec as reviewable units of text.
 *
 * Sentence-level, not field-level, and this is the whole trick. The printables
 * guards test whole strings because a spec string there is one checklist item.
 * An article's `body` is a single 5,000-word markdown string, so the same
 * co-occurrence rules applied to it would fire on any article that mentions
 * cotton in paragraph 2 and warmth in paragraph 40 — every article, always.
 *
 * Each unit carries its neighbours as `context`. Rules match on the sentence
 * but are excluded by the context, because a sentence routinely states the
 * hazard while the negation lives next door: "Avoid cotton base layers. Once
 * damp, cotton stops insulating." — the second sentence, read alone, is an
 * endorsement of exactly what the first one warns against.
 */
export function segments(spec) {
  const fields = [
    ["title", spec.title],
    ["excerpt", spec.excerpt],
    ["body", spec.body],
    ...(spec.products ?? []).flatMap((p, i) => [
      [`products[${i}].label`, p.label],
      [`products[${i}].detail`, p.detail],
      [`products[${i}].note`, p.note],
    ]),
  ].filter(([, v]) => typeof v === "string" && v.trim());

  const out = [];
  for (const [path, raw] of fields) {
    // Markdown link syntax injects URL text into the prose stream, where a slug
    // like /best-tent-heater-in-tent would read as advice. Keep the label, drop
    // the target. Headings and emphasis markers go too — they split sentences
    // in ways that hide co-occurrences.
    const text = raw
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/[*_`>]/g, "");

    // Split on sentence enders only. A colon was in this set briefly and cost
    // a false positive: "Avoid cotton base layers for warmth: once damp, cotton
    // stops insulating" became two units, the second of which reads as advice
    // to use cotton.
    const sentences = text
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

    // Each sentence is a unit, and so is each adjacent pair. Hazardous advice
    // straddles a full stop often enough to matter — "Bring a charcoal grill.
    // Set it up in your vestibule." names the fuel in one sentence and the
    // enclosed space in the next, and neither half is alarming alone.
    sentences.forEach((s, i) => {
      const ctx = (from, to) => sentences.slice(Math.max(0, from), to).join(" ");
      out.push({ path, text: s, context: ctx(i - 1, i + 2) });
      if (i + 1 < sentences.length) {
        out.push({ path, text: `${s} ${sentences[i + 1]}`, context: ctx(i - 1, i + 3) });
      }
    });
  }
  return out;
}

/* High-confidence hazards only.
 *
 * Every rule here blocks a publish, so each targets advice that is
 * unambiguously wrong rather than merely debatable.
 *
 * `match` asserts the hazard and is tested against the sentence alone —
 * widening it to the neighbourhood would let an article that mentions a stove
 * and, two sentences later, a tent, trip a carbon-monoxide rule.
 *
 * `exclude` is tested against the neighbourhood, because the phrasing that
 * makes the same advice correct ("never", "always filter", "use a battery
 * one") is as likely to sit in the next sentence as in this one. Asymmetric on
 * purpose: a missed hazard is caught by the model review behind it, while a
 * false positive quarantines a perfectly good article. */
const NEGATED = /\b(never|do not|don'?t|avoid|not|no|rather than|instead of|except|dangerous|deadly|risk|warning|hazard|keep out|outside)\b/i;

/**
 * Prose can condemn a material purely by COMPARISON, using no negation word
 * and naming no alternative fibre:
 *
 *   "Any of the six options above will out-warm a cotton throw at the same
 *    price, and that is the bar worth clearing before you spend anything."
 *
 * That is the correct recommendation — cotton is the thing being beaten — and
 * it blocked best-camping-blankets-under-40 for five consecutive daily runs.
 * The adjacent-PAIR unit was excluded (its wider context reached "not to a
 * spec sheet"), but the single-sentence unit's three-sentence neighbourhood
 * held no negation, no alternative fibre and no moisture word, so the rule
 * fired anyway. Widening the pair window would not have helped; the signal
 * simply was not in the window.
 *
 * DIRECTION IS THE WHOLE POINT: the material must sit on the LOSING side. Each
 * alternative requires the noun to follow the comparative, so "cotton beats
 * fleece for warmth" — a genuine endorsement — still matches and still flags.
 * And a sentence that praises the material on its own ("cotton is fine for
 * winter camping") carries no comparative, so it is judged on its own terms.
 */
const outclassed = (noun) =>
  new RegExp(
    String.raw`\b(?:` +
      // "out-warm a cotton throw", "outperforms cotton", "beats a cotton blanket"
      String.raw`(?:out-?(?:warm|perform|insulat|last|class)\w*|beat\w*|outstrip\w*)|` +
      // "warmer than cotton", "dries faster than a cotton throw"
      String.raw`(?:warm|dri|light|loft|cosi|cozi|better|faster|quicker|tough)\w*\s+than|` +
      String.raw`more\s+\w+\s+than|` +
      // "choose fleece over cotton", "unlike cotton", "compared to cotton"
      String.raw`over|versus|vs\.?|unlike|compared\s+(?:to|with)|instead\s+of` +
      String.raw`)\s+(?:\w+[\s-]+){0,3}` + noun + String.raw`\b`,
    "i",
  );

const COTTON_OUTCLASSED = outclassed("cotton");

/**
 * The mirror image: the material stated as the WINNER.
 *
 * "Cotton beats fleece for warmth, so choose a cotton base layer" is exactly
 * the advice this rule exists to stop, and it was passing — naming `fleece`
 * tripped the alternative-fibre exclusion, which assumes another fibre means
 * contrasting away from cotton. When cotton is the subject of the comparative,
 * it means the reverse, so this overrides every exclusion rather than joining
 * them.
 */
const COTTON_PREFERRED =
  /\bcotton\b(?:\s+\w+){0,3}\s+(?:beats?|out-?(?:warm|perform|insulat|last)\w*|wins?|is\s+(?:warmer|better|cosier|cozier)\s+than)/i;

const HAZARDS = [
  {
    id: "combustion-in-shelter",
    severity: "critical",
    match: (t) =>
      /\b(stove|grill|charcoal|briquette|propane|butane|kerosene|gas heater|space heater|generator|gas lantern|candle|campfire|fire pit)\b/i.test(t) &&
      /\b(in|inside|within)\s+(the\s+|your\s+|a\s+)?(tent|vestibule|awning|camper|rv|van|car|vehicle|enclosed|shelter)\b/i.test(t),
    // Solar, LED and battery gear burns nothing. Without this, "use a solar
    // lantern inside the tent" — the correct answer — is what gets flagged.
    exclude: (c) => /\b(solar|led|battery|rechargeable|electric|usb|lithium)\b/i.test(c) || NEGATED.test(c),
    problem: "puts a combustion source inside a tent or vehicle — carbon monoxide kills campers every year",
  },
  {
    id: "heater-while-sleeping",
    severity: "critical",
    match: (t) =>
      /\b(propane|butane|kerosene|gas|catalytic|fuel)\b/i.test(t) &&
      /\bheater\b/i.test(t) &&
      /\b(sleep|asleep|overnight|through the night|all night|while you rest)\b/i.test(t),
    exclude: (c) => NEGATED.test(c),
    problem: "runs a fuel-burning heater while asleep — the classic carbon monoxide fatality pattern",
  },
  {
    id: "cotton-for-warmth",
    severity: "high",
    match: (t) =>
      /\bcotton\b/i.test(t) &&
      /\b(warm|insulat|cold|freez|winter|thermal|base ?layer|liner)/i.test(t),
    /* Prose can condemn cotton without one negation word in it, by describing
     * what the fibre DOES: "Base layers in fall should be synthetic or merino.
     * Cotton absorbs sweat, holds it against your skin, and stops insulating
     * the moment it gets damp." That is the correct advice, stated well, and
     * NEGATED alone flagged it as an endorsement — it quarantined
     * fall-camping-gear-essentials twice on 2026-08-11 and best-camping-socks
     * twice on 2026-08-09.
     *
     * Two additional signals, both of which mean "contrasting, not
     * recommending": naming the fibre you should use instead, and naming
     * cotton's moisture failure. An article that genuinely endorses cotton for
     * warmth does neither — it says cotton is soft and cosy and stops there,
     * which still matches.
     *
     * Widening an exclusion weakens a safety rule, so it is worth being
     * explicit that this is the trade this file already chose: a missed hazard
     * is caught by the model panel behind these rules, while a false positive
     * quarantines a good article and, after two attempts, drops the topic. */
    exclude: (c, t) =>
      /* An OVERRIDE, checked first and on the matched text rather than the
       * neighbourhood: cotton stated as the WINNER is an endorsement, and no
       * exclusion below should be allowed to excuse it. Without this,
       * "Cotton beats fleece for warmth, so choose a cotton base layer" was
       * waved through — the word `fleece` alone tripped the alternative-fibre
       * exclusion, which assumes naming another fibre means contrasting AWAY
       * from cotton. Here it means the opposite. */
      !COTTON_PREFERRED.test(t ?? c) &&
      (NEGATED.test(c) ||
      /* "a real layering system without cotton" is advice to avoid it. `without`
       * is deliberately NOT in NEGATED — "run a propane heater without
       * ventilation in your tent" has to keep flagging — so it is bound to the
       * cotton noun here. */
      /\b(without|minus|skip\w*)\s+(?:\w+\s+){0,2}cotton\b/i.test(c) ||
      /* Cotton named as the thing being BEATEN. */
      COTTON_OUTCLASSED.test(c) ||
      /\b(merino|wool|synthetic|polyester|polypro\w*|fleece|nylon|capilene)\b/i.test(c) ||
      /* `sweat\w*` used to sit here and matched SWEATSHIRT, so
       * "a thick cotton sweatshirt is the warmest thing you can bring for
       * winter camping" excused itself: a garment name read as evidence that
       * the prose was discussing moisture. Bounded to sweat the noun/verb. */
      /\b(absorb\w*|soak\w*|damp|wet|clammy|sweat(?:s|y|ed|ing)?\b|perspir\w*|moisture|stops? insulating|loses? (?:its )?insulat\w*)/i.test(c)),
    problem: "recommends cotton for warmth — cotton holds moisture and loses insulation when damp, the classic cold-weather mistake",
  },
  {
    id: "untreated-water",
    severity: "high",
    match: (t) =>
      /\bdrink\w*\b/i.test(t) &&
      /\b(stream|creek|river|lake|pond|spring|snowmelt)\b/i.test(t),
    exclude: (c) => /\b(filter|purif|treat|boil|tablet|iodine|uv)\b/i.test(c) || NEGATED.test(c),
    problem: "suggests drinking from a natural source without treating it",
  },
  {
    id: "food-in-tent",
    severity: "high",
    match: (t) =>
      /\b(food|snack|scented|toiletr)\w*\b/i.test(t) &&
      /\b(in|inside)\s+(the\s+|your\s+)?tent\b/i.test(t),
    /* "keep food OUT of your shelter" is the correct instruction and read as
     * the hazard, because the unit that matched was an adjacent pair whose
     * "inside the tent" came from a different clause entirely: "Skip combustion
     * devices inside the tent, treat your water, keep food out of your
     * shelter." Nothing in NEGATED covers `skip` or `keep … out of`, and both
     * are too useful elsewhere to add there — "skip the vent flaps and run a
     * stove inside" must keep flagging. So the avoidance verb is tied to the
     * food noun instead of loosened globally. */
    exclude: (c) =>
      /\b(bear ?(canister|bag|box)|hang|locker|storage box)\b/i.test(c) ||
      /\b(keep|store|leave|stash)\b[^.!?]{0,40}\b(out of|outside|away from|clear of)\b/i.test(c) ||
      /\b(skip|never|avoid)\b[^.!?]{0,40}\b(food|snack|scented|toiletr)\w*/i.test(c) ||
      NEGATED.test(c),
    problem: "stores food or scented items in the tent — attracts bears and rodents",
  },
];

export function hazardFlags(spec) {
  const hits = [];
  const seen = new Set();
  for (const { path, text, context } of segments(spec)) {
    for (const h of HAZARDS) {
      // The matched text is passed alongside the neighbourhood so a rule can
      // distinguish a signal that must sit in THIS clause (which side of a
      // comparison the material is on) from one that may sit next door.
      if (!h.match(text) || h.exclude(context, text)) continue;
      // One article can restate the same mistake several times. Key on rule +
      // field so a report lists each distinct problem once.
      const key = `${h.id}:${path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ path, id: h.id, severity: h.severity, problem: h.problem, text: text.slice(0, 160) });
    }
  }
  return hits;
}

/**
 * The review question, asked identically of every model on the panel.
 *
 * Deliberately narrow. A reviewer that reported style opinions would make the
 * generation loop unsatisfiable, so it is asked for outright errors only.
 */
function reviewPrompt(spec) {
  const body = typeof spec.body === "string" ? spec.body : "";
  return {
    system: [
      "You are checking a camping article before it is published. Report only OUTRIGHT ERRORS.",
      "",
      'Return {"issues":[{"quote":"the exact text","problem":"one sentence","severity":"high"|"low"}]}.',
      "Return an empty array if the content is sound. That is a normal, common answer.",
      "",
      "high = would mislead a camper into a dangerous or expensive mistake, or is plainly false.",
      "       Carbon monoxide, hypothermia, water-borne illness and wildlife advice are the ones that matter.",
      "low  = minor inaccuracy, redundancy, or a claim that contradicts another claim in the article.",
      "",
      "Do NOT report: wording you would phrase differently, advice you would have added,",
      "obvious statements, or anything about formatting, length, SEO or tone. Those are not errors.",
    ].join("\n"),
    user: JSON.stringify({
      title: spec.title,
      products: (spec.products ?? []).map((p) => p.label).filter(Boolean),
      // Truncated because the endpoint shares its token budget with reasoning
      // and a full-length article plus thinking overruns it, which returns
      // nothing at all — indistinguishable from a clean review.
      body: body.slice(0, 12000),
    }, null, 1),
  };
}

/** One model's reply, as a list of issues. */
function issuesFrom(out) {
  // Asked for {"issues":[…]}, the model returns a bare [] when it finds nothing.
  const issues = Array.isArray(out) ? out : Array.isArray(out?.issues) ? out.issues : [];
  return issues.filter((i) => i?.quote);
}

/** Quotes vary in whitespace and surrounding punctuation between runs. */
const quoteKey = (q) => String(q).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);

/**
 * Review by consensus, across DIFFERENT models where possible.
 *
 * Measured on a real queued article: asked the identical question four times,
 * the model flagged the same sentence twice and called the article clean twice.
 * A gate wired to one pass would have quarantined that article on Monday and
 * published it unchanged on Tuesday — worse than no gate, because the outcome
 * carries no information.
 *
 * Repeated sampling fixed the coin flip but not the blind spot. Three passes of
 * one model still share everything that model is systematically wrong about, so
 * "2 of 3 agreed" measured MiniMax's self-consistency and quietly presented it
 * as corroboration. Routing the panel through llm.mjs gives each vote to a
 * different model where one is configured, and models trained separately fail
 * separately — which is the only reason a vote is worth counting.
 *
 * `independent` reports whether that actually happened. With a single provider
 * keyed this degrades to the old repeated-sampling behaviour, which is no worse
 * than before, but the caller is told so rather than being left to assume a
 * cross-model consensus it did not get.
 *
 * Passes that fail to reach a model are dropped rather than counted as clean —
 * a network error must never be evidence that an article is sound. If fewer
 * than two come back at all, the whole review reports null.
 */
export async function reviewContent(spec, { votes = 3, threshold = 2 } = {}) {
  const { results, independent } = await panel(
    "reviewer",
    reviewPrompt(spec),
    { size: votes },
  );

  const runs = results.map((r) => issuesFrom(r.value));
  if (runs.length < Math.min(2, votes)) return null;

  const tally = new Map();
  for (const run of runs) {
    // One pass listing the same quote twice must not out-vote a second pass.
    const seenThisRun = new Set();
    for (const issue of run) {
      const key = quoteKey(issue.quote);
      if (!key || seenThisRun.has(key)) continue;
      seenThisRun.add(key);
      const prev = tally.get(key) ?? { ...issue, votes: 0 };
      // Keep the strongest severity any pass assigned it.
      if (issue.severity === "high") prev.severity = "high";
      tally.set(key, { ...prev, votes: prev.votes + 1 });
    }
  }

  const all = [...tally.values()];
  const agreed = all.filter((i) => i.votes >= Math.min(threshold, runs.length));
  return {
    passes: runs.length,
    // Which models actually answered, not which were asked. A panel that
    // planned on Gemini but got three MiniMax replies because the Gemini key
    // expired must not be reported as independent.
    reviewers: results.map((r) => `${r.provider}/${r.model}`),
    independent,
    blocking: agreed.filter((i) => i.severity === "high"),
    notes: all.filter((i) => !agreed.includes(i) || i.severity !== "high"),
  };
}
