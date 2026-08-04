/**
 * MiniMax image generation (image-01).
 *
 * Image generation shares the coding-plan quota with text — a hero costs a
 * sliver of the monthly allowance, so failures here are never worth blocking
 * a publish over. Every export resolves to null on any failure; callers treat
 * a missing hero as "use the site default", same as before heroes existed.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const IMAGE_API = "https://api.minimax.io/v1/image_generation";

/**
 * Generate one image and write it to outPath. Returns outPath, or null.
 * aspectRatio: "16:9" for article heroes (rendered 1200x360-ish), "3:4"/"1:1" also valid.
 */
export async function generateImage({ prompt, outPath, apiKey, aspectRatio = "16:9" }) {
  try {
    const res = await fetch(IMAGE_API, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "image-01", prompt, n: 1, aspect_ratio: aspectRatio }),
    });
    if (!res.ok) {
      console.error(`image generation HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (data.base_resp?.status_code !== 0) {
      console.error(`image generation refused: ${data.base_resp?.status_msg ?? "unknown"}`);
      return null;
    }
    const url = data.data?.image_urls?.[0];
    if (!url) return null;

    const img = await fetch(url);
    if (!img.ok) {
      console.error(`image download HTTP ${img.status}`);
      return null;
    }
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, Buffer.from(await img.arrayBuffer()));
    return outPath;
  } catch (err) {
    console.error(`image generation failed: ${err.message}`);
    return null;
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
