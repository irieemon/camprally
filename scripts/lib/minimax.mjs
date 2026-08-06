/**
 * MiniMax-shaped front door onto lib/llm.mjs.
 *
 * This file used to own the HTTP call. It now owns nothing: llm.mjs routes by
 * role across MiniMax, Gemini and the local Ollama, and the JSON extraction and
 * failure-reason logic that lived here moved there intact.
 *
 * Kept because `generateJSON` is a reasonable thing for a script to want and
 * renaming every caller buys nothing. New code should prefer callRole/panel
 * directly, which can report WHICH model answered.
 */

import { callRole } from "./llm.mjs";

/* Retained for callers that log which model they used. The role may answer from
 * any of its candidates, so this is now a default rather than a guarantee. */
export const MODEL = process.env.MINIMAX_MODEL ?? "MiniMax-M3";

export { lastError, providerAvailable, callRole, panel } from "./llm.mjs";

/**
 * Ask for JSON and get a parsed object back, or null.
 *
 * Defaults to the `reviewer` role, not `cheap`. Every historical caller of this
 * function was doing judgement work against a real cloud model, and `cheap`
 * leads with a 3B local model — quietly answering a safety question with
 * llama3.2 would be a downgrade disguised as a refactor. Callers that genuinely
 * want the cheap tier now have to say so.
 *
 * maxTokens stays at 8000 because reasoning is billed against the same budget
 * on the Anthropic-protocol endpoint: at 2000 the model spent the entire
 * allowance thinking and returned no text at all, which reads identically to
 * "nothing to report".
 */
export async function generateJSON({ system, user, maxTokens = 8000, role = "reviewer" }) {
  const r = await callRole(role, { system, user, maxTokens });
  return r ? r.value : null;
}

/**
 * The MiniMax key, or null.
 *
 * Kept resolving through the auth-profiles file as well as the environment:
 * OpenClaw injects env.vars into cron `command` jobs but not into a manual
 * shell run, and dropping the file lookup would have made `node scripts/...`
 * behave differently from the 09:00 cron.
 */
export { minimaxKey as apiKey } from "./llm.mjs";
