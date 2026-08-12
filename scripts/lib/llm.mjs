/**
 * Model access by ROLE rather than by URL.
 *
 * Every script in this repo used to name `https://api.minimax.io/anthropic/...`
 * directly — eight hardcoded copies across three repos — so "use a different
 * model for this job" was a code change, and "MiniMax is down" was an outage of
 * everything at once.
 *
 * Callers now ask for a role: the reviewer, the writer, the cheap one. This
 * file owns which model answers, and in what order to try the alternatives.
 *
 * Two entry points, and the difference between them is the point of the file:
 *
 *   callRole()  wants ONE answer and tries candidates until something replies.
 *               Fallback. More providers means fewer failed runs.
 *
 *   panel()     wants SEVERAL answers from DIFFERENT models on purpose.
 *               Independence. Used by the content review, where three samples
 *               of one model share its blind spots and agreement between them
 *               measures sampling noise rather than truth.
 *
 * Everything returns null rather than throwing, matching the convention the
 * rest of the pipeline already relies on: a model that cannot be reached must
 * never be the reason publishing stops.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";

/* 529 is MiniMax's "overloaded"; the 5xx and 429 family mean the same thing.
 * Copied from write-article.mjs, which learned the list the hard way when the
 * 2026-08-06 09:00 cycle paged Sean over a capacity dip that had cleared by the
 * time anyone looked.
 *
 * The distinction earns its keep here in a way it could not in a single-provider
 * world: transient means "ask someone else RIGHT NOW", permanent (401, 404, a
 * malformed request) means "this candidate is misconfigured, stop trying it". */
export const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 529]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Model ids move under us — Gemini rotates its Flash generation roughly twice a
 * year and MiniMax has already gone M2.7 -> M3 once. Env overrides mean a
 * rotation is a config change in openclaw.json rather than a commit here. */
const MODELS = {
  minimaxWriter: process.env.MINIMAX_MODEL ?? "MiniMax-M3",
  minimaxAlt: process.env.MINIMAX_ALT_MODEL ?? "MiniMax-M2.7",
  /* Pinned to an explicit version rather than the `gemini-flash-latest` alias.
   * An alias that silently upgrades underneath a safety gate changes what the
   * gate does without a commit, and "the reviewer got stricter last Tuesday"
   * is not something the receipts could ever explain. Preview ids are avoided
   * for the same reason in reverse: they get withdrawn. */
  gemini: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
  /* The largest Gemma 4 this machine can hold. Measured, not estimated: the
   * QAT 12B is 7.2GB on disk and loads to 7.6GB resident at 100% GPU with no
   * CPU spill, alongside Chrome and the gateway. The next size up does NOT
   * fit — `26b-a4b-it-qat` is 16GB, which is the machine's entire RAM, and
   * `31b` is 20GB. Meta's Muse Glimmer was evaluated here too and is out for
   * the same reason: its smallest build is 18GB against Meta's own stated 24GB
   * floor, tested on an M4-*Max*. This is a base M4/16GB. */
  ollama: process.env.OLLAMA_MODEL ?? "gemma4:12b-it-qat",
};

/**
 * Where each provider lives and how to talk to it.
 *
 * `baseUrl` is env-overridable on every provider, which is what makes the
 * fallback path testable: point MINIMAX_BASE_URL at a dead host and a run
 * should still finish on Gemini. A failover nobody has ever exercised is not a
 * failover.
 */
const PROVIDERS = {
  minimax: {
    api: "anthropic-messages",
    baseUrl: () => process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io/anthropic",
    key: () => process.env.MINIMAX_API_KEY ?? fromAuthProfiles("minimax:global") ?? fromOpenclawEnv("MINIMAX_API_KEY"),
  },
  google: {
    api: "google-generative-ai",
    baseUrl: () => process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta",
    // Two names because Google's own docs use both, and a key that is present
    // under the other spelling would otherwise read as "no Gemini configured".
    key: () => process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY
      ?? fromOpenclawEnv("GEMINI_API_KEY") ?? fromOpenclawEnv("GOOGLE_API_KEY"),
  },
  ollama: {
    api: "openai-completions",
    baseUrl: () => process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
    // Local, unauthenticated. A non-null placeholder keeps the "no key means
    // skip this candidate" check from excluding it.
    key: () => "local",
  },
};

/**
 * Role -> ordered candidates. First that answers wins.
 *
 * `writer` deliberately has NO local fallback. llama3.2:3b would happily
 * produce 2,000 words of camping advice and every downstream gate would pass
 * it, because the gates check hazards and links rather than quality. A deferred
 * cycle costs a few hours; a bad article published under our name costs more,
 * and the pipeline already treats deferral as a normal outcome.
 *
 * `cheap` still leads with a cloud model rather than the local one, which is
 * not what the name suggests. The original reason was quality: asked "what is
 * 2+2" through OpenClaw, llama3.2:3b answered 214, and a wrong answer that
 * still parses is worse than no answer. Gemma 4 12B replaced it and settles
 * that objection — on both of this role's real prompts it returns exactly the
 * 2-word phrase asked for — so the reason it stays last is now latency, not
 * trust: ~15s warm against under a second from MiniMax, on a call that runs
 * once per article for a search hint the caller already treats as optional.
 * Last means it answers when both clouds are down, which is the failure this
 * pipeline actually sees.
 *
 * GEMMA 4 THINKS BY DEFAULT, and the two traps that follow from it:
 *   - Keep maxTokens generous. A 10-token probe returned an EMPTY STRING with
 *     finish_reason=stop, having spent the budget thinking — indistinguishable
 *     from a model that had nothing to say. Both callers here pass 8000, which
 *     is the same reason they already pass it for MiniMax.
 *   - Ollama returns the thought in a separate `reasoning` field and leaves
 *     `content` clean, so the openai-completions extractor reads the answer and
 *     drops the musing without special handling. That is a property of Ollama's
 *     response shape, NOT of the model — a different local server may inline
 *     the thought, which would feed a chain of reasoning to a `parse: "text"`
 *     caller. Re-probe the raw response before pointing OLLAMA_BASE_URL
 *     somewhere new. Same class as the Gemini `thought: true` parts.
 *
 * NOT on the reviewer panel, deliberately. Gemma 4 is built from the same
 * research as Gemini 3, which already votes there, so it would add a second
 * Google-lineage opinion — and because `panel()` keys independence on the
 * provider id, `ollama` + `google` would report `independent: true` while
 * being one lineage. That is the M3/M2.7 overstatement moved from vendor to
 * lineage. Adding it there needs a lineage-aware check first.
 */
const ROLES = {
  writer: [["minimax", MODELS.minimaxWriter], ["minimax", MODELS.minimaxAlt], ["google", MODELS.gemini]],
  reviewer: [["minimax", MODELS.minimaxWriter], ["google", MODELS.gemini], ["minimax", MODELS.minimaxAlt]],
  vision: [["google", MODELS.gemini], ["minimax", MODELS.minimaxWriter]],
  cheap: [["minimax", MODELS.minimaxAlt], ["google", MODELS.gemini], ["ollama", MODELS.ollama]],
};

function fromAuthProfiles(profile) {
  try {
    const p = `${homedir()}/.openclaw/agents/main/agent/auth-profiles.json`;
    return JSON.parse(readFileSync(p, "utf8"))?.profiles?.[profile]?.key ?? null;
  } catch {
    return null;
  }
}

/* OpenClaw injects env.vars into cron `command` jobs but not into a manual
 * shell run, so reading the file directly is what makes `node scripts/...` by
 * hand behave the same as the 09:00 cron. Same reasoning as the auth-profiles
 * fallback above, which exists for exactly this reason. */
function fromOpenclawEnv(name) {
  try {
    const p = `${homedir()}/.openclaw/openclaw.json`;
    return JSON.parse(readFileSync(p, "utf8"))?.env?.vars?.[name] ?? null;
  } catch {
    return null;
  }
}

/** Is this provider configured at all? Used to skip candidates without a call. */
export function providerAvailable(id) {
  return Boolean(PROVIDERS[id]?.key());
}

/** The resolved MiniMax key, for scripts that still hold their own HTTP call. */
export function minimaxKey() {
  return PROVIDERS.minimax.key();
}

/** Which of a role's candidates could actually be tried, as {provider, model}. */
export function roleCandidates(role) {
  return (ROLES[role] ?? []).filter(([p]) => providerAvailable(p)).map(([provider, model]) => ({ provider, model }));
}

/* ---------- wire formats ---------- */

/* Each provider gets a request builder and a text extractor. The three shapes
 * already existed, scattered across minimax.mjs, minimax-image.mjs and the
 * inline copies in write-article.mjs and audit-products.mjs; they are simply
 * named here instead of duplicated. */
const ADAPTERS = {
  "anthropic-messages": {
    url: (base) => `${base}/v1/messages`,
    headers: (key) => ({ "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }),
    body: ({ model, system, user, maxTokens }) => ({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
    text: (d) => (d.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join(""),
    // Reasoning is billed against max_tokens on this endpoint, so an overrun
    // arrives as an empty text block rather than an error.
    why: (d) => `stop_reason=${d.stop_reason}, out=${d.usage?.output_tokens}`,
  },

  "google-generative-ai": {
    // Gemini takes the key in the query string, not a header.
    url: (base, model, key) => `${base}/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    headers: () => ({ "content-type": "application/json" }),
    body: ({ system, user, maxTokens }) => ({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 1 },
    }),
    /* Skip reasoning parts. Gemini 3.x thinks by default — a trivial probe spent
     * 152 of its 172 tokens on thought — and when thoughts are surfaced they
     * arrive as parts carrying `thought: true` alongside their own text. Folding
     * those into the answer would put the model's deliberation in front of the
     * JSON extractor, which reads the FIRST brace it finds: a reviewer musing
     * "{"issues":[...]} would be the shape here" before deciding the article is
     * clean would be parsed as its verdict. */
    text: (d) => (d.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => p.thought !== true)
      .map((p) => p.text ?? "")
      .join(""),
    // MAX_TOKENS and SAFETY both yield no parts; naming which one matters,
    // because the second means the reviewer refused rather than ran out.
    why: (d) => `finishReason=${d.candidates?.[0]?.finishReason}, block=${d.promptFeedback?.blockReason}`,
  },

  "openai-completions": {
    url: (base) => `${base}/v1/chat/completions`,
    headers: (key) => ({ "content-type": "application/json", authorization: `Bearer ${key}` }),
    body: ({ model, system, user, maxTokens }) => ({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
    text: (d) => d.choices?.[0]?.message?.content ?? "",
    why: (d) => `finish_reason=${d.choices?.[0]?.finish_reason}`,
  },
};

/**
 * Pull a JSON value out of a reply that may be wrapped in prose or fences.
 *
 * Arrays are accepted as well as objects, and that is not hypothetical
 * tolerance. Asked for {"issues":[...]} and told an empty array is a normal
 * answer, MiniMax replies with a bare `[]` when it finds nothing. Reading only
 * `{` turned every CLEAN review into "model unreachable" — a safety check
 * reporting itself as absent precisely when it had passed. Kept verbatim from
 * lib/minimax.mjs, where that bug was found.
 */
function extractJSON(text) {
  const candidates = [
    [text.indexOf("{"), text.lastIndexOf("}")],
    [text.indexOf("["), text.lastIndexOf("]")],
  ].filter(([s, e]) => s !== -1 && e > s).sort((a, b) => a[0] - b[0]);
  if (!candidates.length) return { error: `no JSON in reply: ${text.slice(0, 160)}` };
  const [start, end] = candidates[0];
  try {
    return { value: JSON.parse(text.slice(start, end + 1)) };
  } catch (err) {
    return { error: `unparseable JSON (${err.message.slice(0, 80)}): ${text.slice(start, start + 160)}` };
  }
}

/**
 * One JSON request to one named model.
 *
 * Returns {value} on success, or {error, transient} — the caller decides
 * whether to move on to the next candidate or give up on this one for good.
 */
async function callOne({ provider, model, system, user, maxTokens, parse = "json" }) {
  const p = PROVIDERS[provider];
  const a = ADAPTERS[p.api];
  const key = p.key();
  if (!key) return { error: `${provider}: no API key`, transient: false };

  try {
    const res = await fetch(a.url(p.baseUrl(), model, key), {
      method: "POST",
      headers: a.headers(key),
      body: JSON.stringify(a.body({ model, system, user, maxTokens })),
    });
    if (!res.ok) {
      return {
        error: `${provider}/${model}: HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
        transient: TRANSIENT_STATUS.has(res.status),
      };
    }
    const data = await res.json();
    const text = a.text(data);
    if (!text.trim()) {
      return { error: `${provider}/${model}: no text emitted (${a.why(data)})`, transient: true };
    }
    // Prose callers (write-article) want the markdown as-is; everything else
    // wants a parsed object. A malformed JSON reply is the model's fault, not
    // the network's, so it is permanent — retrying it just burns the budget.
    if (parse === "text") return { value: text.trim() };
    const got = extractJSON(text);
    if (got.error) return { error: `${provider}/${model}: ${got.error}`, transient: false };
    return { value: got.value };
  } catch (err) {
    // Network-level failures (DNS, refused, timeout) are the same class of
    // problem as a 503 and deserve the same response: try the next provider.
    return { error: `${provider}/${model}: request failed: ${err.message?.slice(0, 200)}`, transient: true };
  }
}

/**
 * Ask a role for one JSON answer, trying its candidates in order.
 *
 * Candidate order first, backoff second, and that ordering is deliberate. When
 * MiniMax returns 529 the useful move is to ask Gemini immediately — waiting 5s
 * to re-ask the same overloaded server is what the 09:00 page was about. Only
 * once EVERY candidate has failed transiently is it worth sleeping and going
 * round again, which preserves the "three attempts over ~25s" behaviour for the
 * single-provider case that still exists before a Gemini key is added.
 *
 * Returns {value, provider, model} or null.
 */
export async function callRole(role, { system, user, maxTokens = 8000, rounds = 3, parse = "json", onAttempt } = {}) {
  const candidates = ROLES[role];
  if (!candidates) return note(`unknown role "${role}"`, false);

  const dead = new Set(); // permanent failures — no point retrying these
  let sawTransient = false;

  for (let round = 1; round <= rounds; round++) {
    if (round > 1) {
      const waitMs = 5000 * (round - 1) ** 2; // 5s, then 20s
      onAttempt?.(`all candidates busy; waiting ${waitMs / 1000}s before round ${round}`);
      await sleep(waitMs);
    }
    sawTransient = false;
    for (const [provider, model] of candidates) {
      const id = `${provider}/${model}`;
      if (dead.has(id)) continue;
      const r = await callOne({ provider, model, system, user, maxTokens, parse });
      if (r.value !== undefined) {
        if (process.env.MINIMAX_DEBUG) console.error(`[llm] ${role} answered by ${id}`);
        return { value: r.value, provider, model };
      }
      note(r.error, r.transient);
      onAttempt?.(r.error);
      if (r.transient) sawTransient = true;
      else dead.add(id);
    }
    // Every remaining candidate is permanently broken; another round changes
    // nothing and would only add 20s to a run that is already going to fail.
    if (!sawTransient) break;
  }
  return note(`${role}: no candidate answered${sawTransient ? " (all transient — likely capacity)" : ""}`, sawTransient);
}

/**
 * Ask a role for SEVERAL answers, preferring different models.
 *
 * The content review needs independence, not redundancy: three samples of one
 * model agree with themselves for reasons that have nothing to do with whether
 * the article is safe. Distinct models fail differently, which is the entire
 * value of a vote.
 *
 * Degrades honestly. With one provider keyed it still returns `size` votes by
 * sampling that model repeatedly — the old behaviour, no worse — but reports
 * `independent: false` so the caller can say so rather than implying a
 * cross-model consensus it did not get.
 *
 * `parse` is threaded through to each voter and defaults to "json", which is
 * what the content review needs. A panel voting on a one-word answer must pass
 * "text", or every vote is discarded as unparseable JSON and the panel reports
 * a unanimous silence — a check that disables itself and says nothing.
 *
 * Returns { results: [{value, provider, model}], independent, members }.
 */
export async function panel(role, { system, user, maxTokens = 8000, parse = "json" } = {}, { size = 3 } = {}) {
  const available = roleCandidates(role);
  if (!available.length) return { results: [], independent: false, members: [] };

  // Distinct models first, then top up by re-sampling from the front of the
  // list, so a two-provider setup votes [A, B, A] rather than [A, A, A].
  const members = Array.from({ length: size }, (_, i) => available[i % available.length]);

  const settled = await Promise.all(members.map(async ({ provider, model }) => {
    const r = await callOne({ provider, model, system, user, maxTokens, parse });
    if (r.value === undefined) {
      note(r.error);
      return null;
    }
    return { value: r.value, provider, model };
  }));

  const results = settled.filter(Boolean);
  /* Independence is measured across PROVIDERS, not model ids.
   *
   * MiniMax-M3 and MiniMax-M2.7 are different entries in the candidate list but
   * the same lineage from one vendor, and they are wrong about the same things.
   * Counting them as two independent opinions is exactly the overstatement this
   * panel exists to remove — it would have reported a cross-model consensus on
   * the strength of two checkpoints of one model.
   *
   * And it is a property of what actually ANSWERED, not what was asked: if
   * Gemini was on the panel but its key had expired, the surviving votes are
   * all MiniMax and the caller must not be told otherwise. */
  const distinct = new Set(results.map((r) => r.provider));
  return { results, independent: distinct.size > 1, members };
}

/**
 * Record why a call produced nothing, and return null.
 *
 * Callers degrade on null by design, which means every failure here is one the
 * pipeline swallows on purpose. Without somewhere to look, "the model found no
 * problems" and "the model was never reached" are the same observation — and
 * the second one silently disables a safety check.
 */
let lastFailure = null;
let lastTransient = false;
function note(reason, transient = false) {
  lastFailure = reason;
  lastTransient = transient;
  if (process.env.MINIMAX_DEBUG) console.error(`[llm] ${reason}`);
  return null;
}

export function lastError() {
  return lastFailure;
}

/**
 * Was the last give-up a capacity problem rather than a broken configuration?
 *
 * write-article turns this into the difference between `deferred` (exit 0, the
 * next cycle retries, nobody is paged) and `blocked` (exit non-zero, someone
 * looks at it). Getting it backwards is what woke Sean at 09:00 on 2026-08-06
 * for a 529 that had already cleared.
 */
export function lastErrorTransient() {
  return lastTransient;
}
