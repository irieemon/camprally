/**
 * MiniMax image generation (image-01).
 *
 * Image generation shares the coding-plan quota with text — a hero costs a
 * sliver of the monthly allowance. Every export resolves to null on any
 * failure, and `lastImageError()` says why.
 *
 * A missing hero is NOT harmless, and callers must not treat it as "use the
 * site default". From 2026-10-09 to 10-26 every request here was refused with
 * "login fail" (the key lived in auth-profiles.json, which the OpenClaw 8.35
 * upgrade removed) and ten articles in a row published with the same stock
 * red-tent photo. Nothing alerted, because this module promised that failure
 * was fine. write-article now refuses to finish without a hero.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const IMAGE_API = "https://api.minimax.io/v1/image_generation";

/* Why the last generateImage() call returned null: { kind, message }, or null
 * after a success. kind is "auth" when the key is missing or refused — a
 * config fault that no retry will fix — and "transient" for everything else. */
let lastErr = null;
export function lastImageError() {
  return lastErr;
}
function fail(kind, message) {
  lastErr = { kind, message };
  console.error(message);
  return null;
}

/**
 * Generate one image and write it to outPath. Returns outPath, or null.
 * aspectRatio: "16:9" for article heroes (rendered 1200x360-ish), "3:4"/"1:1" also valid.
 */
export async function generateImage({ prompt, outPath, apiKey, aspectRatio = "16:9" }) {
  lastErr = null;
  if (!apiKey) return fail("auth", "image generation: no MiniMax key (openclaw.json env.vars.MINIMAX_API_KEY)");
  try {
    const res = await fetch(IMAGE_API, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "image-01", prompt, n: 1, aspect_ratio: aspectRatio }),
    });
    if (!res.ok) {
      return fail(res.status === 401 || res.status === 403 ? "auth" : "transient", `image generation HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.base_resp?.status_code !== 0) {
      const msg = data.base_resp?.status_msg ?? "unknown";
      // MiniMax answers a bad key with HTTP 200 and status 1004 "login fail".
      const auth = data.base_resp?.status_code === 1004 || /login fail|api secret key|invalid api key/i.test(msg);
      return fail(auth ? "auth" : "transient", `image generation refused: ${msg}`);
    }
    const url = data.data?.image_urls?.[0];
    if (!url) return fail("transient", "image generation returned no image url");

    const img = await fetch(url);
    if (!img.ok) return fail("transient", `image download HTTP ${img.status}`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, Buffer.from(await img.arrayBuffer()));
    return outPath;
  } catch (err) {
    return fail("transient", `image generation failed: ${err.message}`);
  }
}

/** Hero prompt for an article. Kept photographic and text-free: overlaid UI
 *  (title, category badge, gradient) supplies all the typography. */
export function heroPrompt(title, category = "camping gear") {
  return (
    `Photorealistic outdoor photography for a budget-camping article titled "${title}". ` +
    `Subject: ${category.toLowerCase()} in a natural campsite setting — forest clearing, ` +
    `lakeside, or mountain meadow. Golden-hour natural light, shallow depth of field, ` +
    `editorial magazine quality. No text, no watermarks, no logos, no human faces.`
  );
}
