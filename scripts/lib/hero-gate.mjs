/**
 * Does a generated hero belong on the page? Asked of the `vision` role BEFORE
 * the hero is accepted.
 *
 * Why it exists (2026-11-24): first-day-hike-guide shipped a hero of fake
 * brush-script characters joined by plus signs to a watercolour cloud on a
 * white background. image-01 read "New Year" in the quoted title as a
 * calligraphy prompt. Nothing judged the image: describeHero() only wrote alt
 * text, and it described the nonsense accurately ("brushstroke symbols joined
 * by plus signs…"), so the one model that LOOKED at it was never asked whether
 * it made sense. Describing is not judging.
 *
 * Fails closed. A reply that is not a verdict counts as no verdict, and the
 * caller defers rather than publishing an unjudged image.
 *
 * Returns {ok: true}, {ok: false, reason}, or null when no model answered.
 */
import { readFileSync } from "node:fs";
import { callRole } from "./llm.mjs";

export async function judgeHero(imagePath, title) {
  let image;
  try {
    image = { mediaType: "image/jpeg", data: readFileSync(imagePath).toString("base64") };
  } catch {
    return null;
  }
  const r = await callRole("vision", {
    system:
      "You approve hero images for a budget camping website. Reply with JSON only: " +
      '{"ok": true|false, "reason": "<one short sentence>"}.',
    user:
      `This image will be the hero of an article titled "${title}".\n` +
      "Approve it ONLY if ALL of these hold:\n" +
      "1. It is a photorealistic photograph, not an illustration, painting, icon, diagram or abstract graphic.\n" +
      "2. It shows a real outdoor, camping or hiking scene, or camping gear in such a scene.\n" +
      "3. No text, letters, characters or symbols are a prominent element of the image. Small incidental " +
      "printing on an object or garment (a label, a patch, writing on a page someone holds) is fine.\n" +
      "4. It is not mostly blank, washed out or a plain background.\n" +
      "5. A reader would not find it odd beside that title. A generic campsite or trail scene is fine; " +
      "it does not need to depict the title literally.\n" +
      "Reject if any one fails, and name which in the reason.",
    image,
    maxTokens: 2000,
    rounds: 2,
  });
  const v = r?.value;
  if (!v || typeof v.ok !== "boolean") return null;
  return v.ok ? { ok: true } : { ok: false, reason: String(v.reason ?? "rejected").slice(0, 200) };
}
