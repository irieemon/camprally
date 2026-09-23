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
  /* The Windows PC's Ollama, not this Mac's. gemma4:12b-it-qat used to live
   * here and was moved off-box on 2026-09-23 to give the Mac its 7.6GB of RAM
   * back. What replaced it is deliberately SMALL: Qwen 3.5 4B (Q4_K_M), CPU-only,
   * served with a 16k context. It is suited ONLY to short prompts — under ~4k
   * tokens is the comfortable range — which is every `cheap` caller today (a
   * search phrase, a meta description over 1,200 chars of body, an ASIN pick
   * over a ~2k-token inventory). Do not put it on a role with long prompts.
   * Muse Glimmer (below) was evaluated for this machine and does not fit: its
   * smallest build is 18GB against Meta's own stated 24GB floor. */
  ollama: process.env.OLLAMA_MODEL ?? "qwen3.5:4b",
  /* The panel's third LINEAGE, which is the whole reason it is here — Meta
   * weights, reached through a router because 30B does not fit on this machine
   * (see the ollama note above — this Mac is a base M4/16GB). Apache 2.0 and served by several hosts, so if
   * OpenRouter is ever the wrong door the weights are not locked behind it. */
  museGlimmer: process.env.OPENROUTER_MODEL ?? "meta/muse-glimmer-30b",
  /* Replaced Gemini on the panel on measurement, not reputation — see the
   * reviewer note below. Distinct lineage, and the cheapest per detection of
   * everything benchmarked. It DOES hit the empty-content thinking trap
   * occasionally, which is survivable only because callers pass a generous
   * maxTokens; do not lower it for this candidate. Reviews get 16000
   * (content-review REVIEW_MAX_TOKENS) and panel() retries an empty reply once;
   * even so it ran past 8000 on 1 of 3 publish-review samples on 2026-09-23. */
  deepseek: process.env.DEEPSEEK_MODEL ?? "deepseek/deepseek-v4-pro",
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
  openrouter: {
    api: "openai-completions",
    baseUrl: () => process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api",
    key: () => process.env.OPENROUTER_API_KEY ?? fromOpenclawEnv("OPENROUTER_API_KEY"),
  },
  ollama: {
    api: "openai-completions",
    /* The Windows PC over Tailscale (MagicDNS name), not localhost — this Mac no
     * longer holds a local model. If the PC is asleep or off the tailnet the
     * fetch fails at the network layer, which callOne already reads as
     * transient, so the role simply ends without an answer, same as before. */
    baseUrl: () => process.env.OLLAMA_BASE_URL ?? "http://desktop-32gfflo:11434",
    // Unauthenticated. A non-null placeholder keeps the "no key means skip this
    // candidate" check from excluding it.
    key: () => "local",
    /* THINKING OFF, and this is not a tuning knob. Qwen 3.5 thinks by default
     * and on this CPU-only box a two-word probe through /v1/chat/completions did
     * not finish within 120s; with `reasoning_effort: "none"` the same probe
     * answered in ~1s. Ollama's OpenAI-compatible endpoint honours
     * reasoning_effort and IGNORES a top-level `think: false` (measured: it
     * still thought, and ran out of max_tokens with empty content). */
    extraBody: { reasoning_effort: "none" },
  },
};

/**
 * Which vendor actually TRAINED the model behind a candidate.
 *
 * This exists because `provider` is where a request is SENT, and the panel
 * needs to know whose opinion came back. The two stopped being the same thing
 * the moment a router joined the list: OpenRouter serves Gemini, MiniMax and
 * Llama alike, so `openrouter` + `google` can be two providers and one lineage.
 * Keying independence on the provider id would call that a cross-vendor
 * consensus, which is the failure this panel exists to prevent.
 *
 * Read off the MODEL, not the provider, for exactly that reason. Unknown model
 * ids fall back to the provider id, which is the conservative direction: a new
 * candidate reads as its own lineage until someone teaches this function
 * otherwise, so it can never silently merge two vendors into one.
 */
export function lineageOf({ provider, model }) {
  const m = String(model ?? "").toLowerCase();
  if (/(^|\/)(gemini|gemma)/.test(m)) return "google";
  if (/(^|\/)qwen/.test(m)) return "alibaba";
  if (m.includes("minimax")) return "minimax";
  if (/(^|\/)(muse|llama)/.test(m)) return "meta";
  if (m.includes("deepseek")) return "deepseek";
  /* Anything routed and unrecognised collapses to the ROUTER id, which would
   * make two unknown OpenRouter models look like one lineage. That is the safe
   * direction — it under-reports independence rather than inventing it — but it
   * means a new router candidate needs a line here to be counted properly. */
  return provider;
}

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
 * still parses is worse than no answer. Gemma 4 12B later held this seat on
 * this Mac; since 2026-09-23 it is Qwen 3.5 4B on the Windows PC's CPU (see
 * MODELS.ollama). It stays LAST for latency and size: it is a 4B model on a
 * CPU, fine for a short prompt with thinking off (~1s for a two-word probe),
 * but not a peer of the cloud seats. Last means it answers when both clouds
 * are down, which is the failure this pipeline actually sees.
 *
 * QWEN 3.5 THINKS BY DEFAULT, which is why PROVIDERS.ollama sends
 * `reasoning_effort: "none"`. With thinking ON, a two-word probe on the CPU
 * did not finish in 120s — callers here have no fetch timeout, so that would
 * stall a cycle, not just fail a hint. If thinking is ever re-enabled: Ollama
 * returns the thought in a separate `reasoning` field and leaves `content`
 * clean, which is a property of Ollama's response shape, NOT of the model — a
 * different local server may inline the thought and feed a chain of reasoning
 * to a `parse: "text"` caller. Re-probe the raw response before pointing
 * OLLAMA_BASE_URL somewhere new. Same class as the Gemini `thought: true` parts.
 *
 * NOT on the reviewer panel. A 4B CPU model is not a reviewer, and review
 * prompts (a full article) are far outside its comfortable context. If it ever
 * were seated, lineageOf reports it as `alibaba`, a distinct lineage.
 */
const ROLES = {
  /* M3, then GEMINI, then M2.7 last.
   *
   * The failover used to go M3 -> M2.7, so a MiniMax capacity dip quietly
   * downgraded the article to the previous generation with nothing in the
   * receipt to say so. Falling through to a current model from another vendor
   * is both better output and a more honest failure: it also breaks the
   * single-vendor dependency, since an M3 outage is usually an M2.7 outage too
   * — same provider, same door. M2.7 stays as a last resort rather than being
   * removed, because a deferred cycle is still worse than an older draft. */
  writer: [["minimax", MODELS.minimaxWriter], ["google", MODELS.gemini], ["minimax", MODELS.minimaxAlt]],
  /* Order is the seating plan, and the two consumers read it DIFFERENTLY —
   * worth knowing before reordering anything:
   *   panel()    takes the first `size` entries, calls them once, and drops
   *              whatever fails. It does NOT substitute. A flaky starter costs
   *              a vote outright; entries below `size` are unreachable to it
   *              except when a provider has no key at all.
   *   callRole() walks the whole list until something answers, so the later
   *              entries are a real fallback chain for single-answer callers.
   * So position 1-3 is who reviews articles, and 4-5 only ever helps
   * generateJSON and audit-products.
   *
   * The seats were assigned by measurement, not reputation. Eleven models were
   * run against the five real defects this panel found in the live corpus on
   * 2026-08-12, plus clean articles as false-positive controls
   * (scripts/bench-reviewers.mjs). Muse Glimmer caught 5/5 including all three
   * safety cases at the second-lowest cost — better than GPT-5, Sonnet 4.6,
   * Grok and Qwen, which is not the result anyone would have guessed from
   * parameter counts. DeepSeek matched MiniMax at 3/5 for less money.
   *
   * GEMINI WAS DEMOTED, NOT DROPPED. It scored lowest of the three incumbents
   * (2/5), cost 5x MiniMax because "flash" still bills thinking tokens, and
   * dropped out of three separate runs on the day it was measured. But it is a
   * lineage nothing else here covers, so it stays in the list for callRole. Be
   * clear about what that does and does not buy: it will never step into a
   * panel seat when DeepSeek has a bad minute, because panel() does not
   * substitute. It only helps the single-answer callers.
   *
   * Two of the three starters route through OpenRouter. That is a shared
   * availability risk the lineage check cannot see — an OpenRouter outage takes
   * two votes at once and leaves MiniMax voting with the bench. Accepted
   * because the bench is two more distinct lineages deep, but it is the reason
   * the fourth and fifth seats are NOT both MiniMax. */
  reviewer: [
    ["minimax", MODELS.minimaxWriter],
    ["openrouter", MODELS.museGlimmer],
    ["openrouter", MODELS.deepseek],
    ["google", MODELS.gemini],
    ["minimax", MODELS.minimaxAlt],
  ],
  /* Gemini leads on measurement, not preference. Asked to describe the hero on
   * the camping-cots guide, Gemini and an independent vision tool both returned
   * "camping cot and small side table"; M3 returned "a hammock and small
   * table". Both models genuinely SEE the image — M3's request reports 1,256
   * input tokens — but alt text that misnames the product is worse than none,
   * so the more accurate reader goes first and M3 is the fallback.
   *
   * M2.7 is deliberately absent: it accepts an image request, returns 200, and
   * silently drops the image (input_tokens 64, "I can't see the image"). A
   * vision seat that cannot see would produce confident invented descriptions. */
  vision: [["google", MODELS.gemini], ["minimax", MODELS.minimaxWriter]],
  /* M3, not M2.7. This role writes the meta description on every article and
   * picks the Amazon search term, so it is not a throwaway despite the name —
   * "cheap" describes the SIZE of the job, not a licence to use the older
   * model. M2.7 stays only as the second MiniMax seat on the reviewer panel,
   * where a distinct sample is the point. */
  cheap: [["minimax", MODELS.minimaxWriter], ["google", MODELS.gemini], ["ollama", MODELS.ollama]],
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
    body: ({ model, system, user, maxTokens, image }) => ({
      model,
      max_tokens: maxTokens,
      system,
      messages: [
        {
          role: "user",
          content: image
            ? [
                { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
                { type: "text", text: user },
              ]
            : user,
        },
      ],
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
    body: ({ system, user, maxTokens, image }) => ({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        {
          role: "user",
          parts: image
            ? [{ inline_data: { mime_type: image.mediaType, data: image.data } }, { text: user }]
            : [{ text: user }],
        },
      ],
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
async function callOne({ provider, model, system, user, maxTokens, parse = "json", image, validate }) {
  const p = PROVIDERS[provider];
  const a = ADAPTERS[p.api];
  const key = p.key();
  if (!key) return { error: `${provider}: no API key`, transient: false };

  try {
    const res = await fetch(a.url(p.baseUrl(), model, key), {
      method: "POST",
      headers: a.headers(key),
      body: JSON.stringify({ ...a.body({ model, system, user, maxTokens, image }), ...(p.extraBody ?? {}) }),
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
      return { error: `${provider}/${model}: no text emitted (${a.why(data)})`, transient: true, empty: true };
    }
    // Prose callers (write-article) want the markdown as-is; everything else
    // wants a parsed object. A malformed JSON reply is the model's fault, not
    // the network's, so it is permanent — retrying it just burns the budget.
    if (parse === "text") return { value: text.trim() };
    const got = extractJSON(text);
    if (got.error) return { error: `${provider}/${model}: ${got.error}`, transient: false, malformed: true };
    /* Parsing is not answering. extractJSON pulls the first {…} out of ANY
     * text, so a host that returns another request's output (SiliconFlow
     * serving DeepSeek via OpenRouter did, twice, 2026-09-23: a config file,
     * and a `<status>{…}</status>` blob) parses fine. The caller's `validate`
     * says whether the value is an answer to THIS question; a reply that is
     * not is malformed, exactly like broken JSON. */
    const invalid = validate?.(got.value);
    if (invalid) return { error: `${provider}/${model}: wrong shape (${invalid}): ${text.slice(0, 160)}`, transient: false, malformed: true };
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
export async function callRole(role, { system, user, maxTokens = 8000, rounds = 3, parse = "json", onAttempt, image } = {}) {
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
      const r = await callOne({ provider, model, system, user, maxTokens, parse, image });
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
 * `validate(value)` (optional, json only) returns an error string when a
 * parsed reply is not an answer of the caller's schema. It is per caller on
 * purpose: roles share panel() with different schemas (audit-products asks
 * the reviewer role a different question), so the shape check cannot live
 * here. An invalid reply takes the malformed path: logged, retried once, then
 * no answer.
 *
 * Returns { results: [{value, provider, model, tries}], failures:
 * [{provider, model, error, malformed, tries}], independent, members }.
 */
export async function panel(role, { system, user, maxTokens = 8000, parse = "json", image, validate } = {}, { size = 3 } = {}) {
  const available = roleCandidates(role);
  if (!available.length) return { results: [], independent: false, members: [] };

  // Distinct models first, then top up by re-sampling from the front of the
  // list, so a two-provider setup votes [A, B, A] rather than [A, A, A].
  const members = Array.from({ length: size }, (_, i) => available[i % available.length]);

  /* A dropped seat is LOGGED ALWAYS, not only under MINIMAX_DEBUG. panel()
   * does not substitute, so a seat that answers with broken JSON silently
   * turns a 3-seat vote into a 2-seat one — and on 2026-09-22 Muse Glimmer did
   * exactly that twice in one dry run with nothing on screen to say so.
   *
   * Malformed JSON gets ONE retry, and only malformed JSON. For callRole a bad
   * reply is permanent because the next candidate is the better move; here
   * there is no next candidate, and a second sample from the same model
   * usually closes its braces. After that it counts as no answer — never as a
   * clean review. Transport failures are not retried here: they are what the
   * callers' own defer paths exist for.
   *
   * An EMPTY reply (200, no text) gets the same single retry. It is not a
   * transport failure: it is a thinking model that spent its whole max_tokens
   * reasoning (finish_reason=length) — DeepSeek did it in 3 of 6 dead-link dry
   * runs and on a publish review, 2026-09-22/23. It is a tail event, so a
   * second sample (often from a different OpenRouter host) usually answers;
   * the cost is one extra call only when the seat would otherwise be lost. */
  const settled = await Promise.all(members.map(async ({ provider, model }) => {
    let r = await callOne({ provider, model, system, user, maxTokens, parse, image, validate });
    let tries = 1;
    if (r.value === undefined && (r.malformed || r.empty)) {
      console.error(`[llm] panel seat ${provider}/${model} returned ${r.malformed ? "malformed JSON" : "no text"} — retrying once: ${r.error.slice(0, 200)}`);
      r = await callOne({ provider, model, system, user, maxTokens, parse, image, validate });
      tries = 2;
    }
    if (r.value === undefined) {
      console.error(`[llm] panel seat ${provider}/${model} gave NO ANSWER after ${tries} tr${tries === 1 ? "y" : "ies"}: ${String(r.error).slice(0, 200)}`);
      note(r.error, r.transient);
      return { failed: true, provider, model, error: String(r.error).slice(0, 300), malformed: !!r.malformed, tries };
    }
    return { value: r.value, provider, model, tries };
  }));

  const results = settled.filter((s) => !s.failed);
  const failures = settled.filter((s) => s.failed);
  /* Independence is measured across LINEAGES, not model ids and not providers.
   *
   * Not model ids: MiniMax-M3 and MiniMax-M2.7 are different entries in the
   * candidate list but the same lineage from one vendor, and they are wrong
   * about the same things. Counting them as two independent opinions is exactly
   * the overstatement this panel exists to remove — it would have reported a
   * cross-model consensus on the strength of two checkpoints of one model.
   *
   * Not providers either, which was the rule until OpenRouter joined the list.
   * A router is a door, not a vendor: ask it for Gemini and `openrouter` +
   * `google` look like two providers while being one opinion. The same trap is
   * a local one away — Gemma 4 is built from the same research as Gemini 3, so
   * an `ollama` vote would have read as independent of a `google` vote too.
   *
   * And it is a property of what actually ANSWERED, not what was asked: if
   * Gemini was on the panel but its key had expired, the surviving votes are
   * all MiniMax and the caller must not be told otherwise. */
  const distinct = new Set(results.map(lineageOf));
  return { results, failures, independent: distinct.size > 1, members };
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
