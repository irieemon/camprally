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

import { generateJSON } from "./minimax.mjs";

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
    exclude: (c) => NEGATED.test(c),
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
    exclude: (c) => /\b(bear ?(canister|bag|box)|hang|locker|storage box)\b/i.test(c) || NEGATED.test(c),
    problem: "stores food or scented items in the tent — attracts bears and rodents",
  },
];

export function hazardFlags(spec) {
  const hits = [];
  const seen = new Set();
  for (const { path, text, context } of segments(spec)) {
    for (const h of HAZARDS) {
      if (!h.match(text) || h.exclude(context)) continue;
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
 * Model review for the errors rules cannot enumerate.
 *
 * Deliberately narrow. A reviewer that reported style opinions would make the
 * generation loop unsatisfiable, so it is asked for outright errors only.
 *
 * Returns null when the model could not be reached, which callers must treat
 * as "not reviewed" rather than "clean".
 */
async function reviewOnce(spec) {
  const body = typeof spec.body === "string" ? spec.body : "";
  const out = await generateJSON({
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
  });

  if (!out) return null;
  // Asked for {"issues":[…]}, the model returns a bare [] when it finds nothing.
  const issues = Array.isArray(out) ? out : Array.isArray(out.issues) ? out.issues : [];
  return issues.filter((i) => i?.quote);
}

/** Quotes vary in whitespace and surrounding punctuation between runs. */
const quoteKey = (q) => String(q).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);

/**
 * Review by consensus, because a single pass is a coin flip.
 *
 * Measured on a real queued article: asked the identical question four times,
 * the model flagged the same sentence twice and called the article clean twice.
 * A gate wired to one pass would have quarantined that article on Monday and
 * published it unchanged on Tuesday — worse than no gate, because the outcome
 * carries no information.
 *
 * Independent passes turn that into a usable signal: agreement across runs is
 * evidence the problem is in the text rather than in the sampling. Findings
 * that reach the threshold block; findings only one pass saw are kept as notes,
 * which is the right home for a genuine-but-contested reading.
 *
 * Passes that fail to reach the model are dropped rather than counted as clean
 * — a network error must never be evidence that an article is sound. If fewer
 * than two passes come back at all, the whole review reports null.
 */
export async function reviewContent(spec, { votes = 3, threshold = 2 } = {}) {
  const runs = (await Promise.all(
    Array.from({ length: votes }, () => reviewOnce(spec)),
  )).filter((r) => r !== null);

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
    blocking: agreed.filter((i) => i.severity === "high"),
    notes: all.filter((i) => !agreed.includes(i) || i.severity !== "high"),
  };
}
