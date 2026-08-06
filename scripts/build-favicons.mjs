#!/usr/bin/env node
/**
 * Generate the site's icon set from the brand mark.
 *
 *   node scripts/build-favicons.mjs
 *
 * Replaces the stock Next.js/Vercel favicon (black circle, white triangle) that
 * shipped with `create-next-app` and was never changed.
 *
 * Writes three files, because one icon cannot serve every surface:
 *
 *   src/app/icon.svg        modern browsers. Vector, and the ONLY one that can
 *                           adapt to the tab strip's colour scheme.
 *   src/app/favicon.ico     16/32/48 fallback for anything without SVG favicon
 *                           support.
 *   src/app/apple-icon.png  180x180 opaque, for iOS home screens.
 *
 * WHY THE SVG CARRIES A MEDIA QUERY. camp-green on Chrome's dark tab strip
 * measures 1.33:1 — not "low contrast", invisible. The mark is pine on light
 * chrome and bone on dark, switched by prefers-color-scheme inside the SVG.
 *
 * WHY apple-icon IS OPAQUE. iOS composites transparency onto black, so a
 * transparent pine mark becomes a dark-green mark on a black tile. It gets a
 * bone background baked in.
 *
 * Next.js App Router picks all three up by filename and emits the link tags.
 */

import { writeFileSync, readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import sharp from "sharp";

const ROOT = new URL("..", import.meta.url).pathname;
const APP = `${ROOT}src/app`;

// lucide-react `Mountain` — the same glyph Navigation.tsx renders in the header.
const PATH = "m8 3 4 8 5-5 5 15H2L8 3z";
const BOUNDS = { x0: 2, y0: 3, x1: 22, y1: 21 };
const PINE = "#1f513f";
const BONE = "#f4f2ed";

/* Stroke 2.25 is tuned for a 24px header icon and goes to a pale smear at 16px;
 * 3.2 holds. Past ~4.0 the peak notch closes up and it reads as a blob.
 * The viewBox is DERIVED: a stroke is centred on its path and overhangs by half
 * its width, and round linejoins bulge past even that at the peaks and base
 * corners — so bounds + stroke + a 6% margin, squared about the centre. */
const STROKE = 3.2;
const MARGIN = 0.06;

function viewBox() {
  const w = BOUNDS.x1 - BOUNDS.x0 + STROKE;
  const h = BOUNDS.y1 - BOUNDS.y0 + STROKE;
  const side = Math.max(w, h) * (1 + MARGIN * 2);
  const cx = (BOUNDS.x0 + BOUNDS.x1) / 2;
  const cy = (BOUNDS.y0 + BOUNDS.y1) / 2;
  return { v: `${cx - side / 2} ${cy - side / 2} ${side} ${side}`, side };
}

const { v } = viewBox();

const adaptiveSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${v}">
  <style>
    path { stroke: ${PINE}; }
    @media (prefers-color-scheme: dark) { path { stroke: ${BONE}; } }
  </style>
  <path d="${PATH}" fill="none" stroke-width="${STROKE}"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
writeFileSync(`${APP}/icon.svg`, adaptiveSVG);

const flatSVG = (ink) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${v}">
    <path d="${PATH}" fill="none" stroke="${ink}" stroke-width="${STROKE}"
          stroke-linecap="round" stroke-linejoin="round"/></svg>`
);

/** Minimal ICO writer. PNG-compressed entries — supported by every browser
 *  that is still shipping, and a fraction of the size of BMP entries. */
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  let offset = 6 + pngs.length * 16;
  const dir = [];
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    dir.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...dir, ...pngs.map((p) => p.data)]);
}

/* The .ico carries its own bone background; the .svg does not.
 *
 * Only the SVG can respond to prefers-color-scheme, so the .ico is a single
 * fixed colour for both light and dark tab strips — and no single colour serves
 * both. Measured against Chrome's chromes: pine is 6.94:1 on light and 1.33:1
 * on dark (invisible); the best-balanced mid-green manages only 2.91:1, which
 * is merely mediocre everywhere instead of good anywhere.
 *
 * Giving the fallback its own background sidesteps the choice entirely — pine
 * on bone is 8.14:1 whatever the browser paints behind it. The .svg stays a
 * floating glyph for the ~97% of browsers that take it; nobody sees both. */
const TILE_RADIUS = 0.18; // of the tile side — soft square, not a circle

const sizes = [16, 32, 48];
const pngs = [];
for (const size of sizes) {
  const inset = Math.max(1, Math.round(size * 0.12));
  const mark = await sharp(flatSVG(PINE), { density: 512 })
    .resize(size - inset * 2, size - inset * 2)
    .png()
    .toBuffer();
  const r = Math.round(size * TILE_RADIUS);
  const tile = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${BONE}"/></svg>`
  );
  const data = await sharp(tile)
    .composite([{ input: mark, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  pngs.push({ size, data });
}
writeFileSync(`${APP}/favicon.ico`, buildIco(pngs));

// iOS tile: opaque bone, mark inset so it survives the OS corner mask.
const appleMark = await sharp(flatSVG(PINE), { density: 512 }).resize(132, 132).png().toBuffer();
await sharp({ create: { width: 180, height: 180, channels: 3, background: BONE } })
  .composite([{ input: appleMark, gravity: "center" }])
  .png({ compressionLevel: 9 })
  .toFile(`${APP}/apple-icon.png`);

// ── verify, rather than assume ────────────────────────────────────────────
const report = [];
for (const size of sizes) {
  const { data, info } = await sharp(pngs.find((p) => p.size === size).data)
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let ink = 0, edge = 0;
  const at = (x, y) => data[(y * info.width + x) * info.channels + 3] > 8;
  for (let i = 3; i < data.length; i += info.channels) if (data[i] > 8) ink++;
  for (let x = 0; x < info.width; x++) if (at(x, 0) || at(x, info.height - 1)) edge++;
  for (let y = 0; y < info.height; y++) if (at(0, y) || at(info.width - 1, y)) edge++;
  const pct = (ink / (info.width * info.height)) * 100;
  // The tile is opaque by design, so "ink" here is the tile, not the mark —
  // check the MARK's own coverage by sampling only pine-coloured pixels.
  let pine = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] < 90 && data[i + 1] > 50 && data[i + 1] < 130 && data[i + 2] < 110) pine++;
  }
  const markPct = (pine / (info.width * info.height)) * 100;
  if (markPct < 8) throw new Error(`favicon ${size}px: mark is only ${markPct.toFixed(1)}% of the tile — too faint to read`);
  void pct; void edge;
  report.push(`${size}px mark ${markPct.toFixed(1)}%`);
}

const ico = readFileSync(`${APP}/favicon.ico`);
console.log("wrote src/app/icon.svg        (adaptive: pine on light chrome, bone on dark)");
console.log(`wrote src/app/favicon.ico     (${sizes.join("/")} — ${(ico.length / 1024).toFixed(1)}KB — ${report.join(", ")})`);
console.log("wrote src/app/apple-icon.png  (180x180, opaque bone)");
