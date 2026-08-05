/**
 * Minimal MiniMax text client, shared by scripts that need a model answer.
 *
 * write-article.mjs predates this and carries its own copy of the same fetch;
 * it is left alone deliberately — it is the most load-bearing script in the
 * repo and a refactor there buys nothing. New callers use this.
 *
 * `generateJSON` returns null rather than throwing on any failure. Callers are
 * expected to degrade: a review that cannot reach the model must not become a
 * reason the publisher stops.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const BASE = "https://api.minimax.io/anthropic/v1/messages";
export const MODEL = "MiniMax-M2.7";

export function apiKey() {
  if (process.env.MINIMAX_API_KEY) return process.env.MINIMAX_API_KEY;
  try {
    const p = `${homedir()}/.openclaw/agents/main/agent/auth-profiles.json`;
    return JSON.parse(readFileSync(p, "utf8"))?.profiles?.["minimax:global"]?.key ?? null;
  } catch {
    return null;
  }
}

/**
 * Ask for JSON and get a parsed object back, or null.
 *
 * max_tokens is 8000 because reasoning is billed against the same budget on
 * this endpoint: at 2000 the model spent the entire allowance thinking and
 * returned no text at all, which reads identically to "nothing to report".
 */
export async function generateJSON({ system, user, maxTokens = 8000 }) {
  const key = apiKey();
  if (!key) return note("no API key");
  try {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) return note(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
    // Reasoning is billed against max_tokens on this endpoint, so an overrun
    // shows up as an empty text block rather than an error — a distinction
    // worth naming, because it looks identical to "the model had nothing to say".
    if (!text.trim()) return note(`no text emitted (stop_reason=${data.stop_reason}, out=${data.usage?.output_tokens})`);
    // Models wrap JSON in prose or fences often enough that pulling the outermost
    // delimiters is more reliable than trusting the whole reply to parse.
    //
    // Arrays are accepted as well as objects, and that is not hypothetical
    // tolerance: asked for {"issues":[...]} and told an empty array is a normal
    // answer, this model replies with a bare `[]` when it finds nothing. Reading
    // only `{` turned every CLEAN review into "model unreachable" — a safety
    // check reporting itself as absent precisely when it had passed.
    const candidates = [
      [text.indexOf("{"), text.lastIndexOf("}")],
      [text.indexOf("["), text.lastIndexOf("]")],
    ].filter(([s, e]) => s !== -1 && e > s).sort((a, b) => a[0] - b[0]);
    if (!candidates.length) return note(`no JSON in reply: ${text.slice(0, 160)}`);
    const [start, end] = candidates[0];
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (err) {
      return note(`unparseable JSON (${err.message.slice(0, 80)}): ${text.slice(start, start + 160)}`);
    }
  } catch (err) {
    return note(`request failed: ${err.message?.slice(0, 200)}`);
  }
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
function note(reason) {
  lastFailure = reason;
  if (process.env.MINIMAX_DEBUG) console.error(`[minimax] ${reason}`);
  return null;
}

export function lastError() {
  return lastFailure;
}
