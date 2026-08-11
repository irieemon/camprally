#!/usr/bin/env node
/**
 * Mirror the published Printify merch into this site.
 *
 *   node scripts/sync-merch.mjs
 *   node scripts/sync-merch.mjs --dry-run
 *   node scripts/sync-merch.mjs --refresh-images
 *
 * Third revenue rail, same shape as scripts/sync-printables.mjs: the products
 * live in a sibling repo (~/camprally-merch) and sell through a Printify
 * Pop-Up Store. Vercel builds from git and cannot see that repo, so the product
 * list and the card art must be COMMITTED here rather than read at build time.
 *
 * A missing sibling repo is not an error. It is the normal state on any machine
 * that is not Sean's, including CI — the script says so and leaves the
 * committed copy untouched, so a build never depends on a path outside git.
 *
 * WHY A DESIGN IS THE UNIT, NOT A PRODUCT. There are 25 products but only 5
 * paintings: each design is applied to a tee, hoodie, tote, phone case and mug.
 * Listing all 25 would put the same five images on screen five times each. The
 * storefront has no per-design collection URL to link a design card at either
 * (only /product/<id>, /products and /category/<type> exist — checked), so each
 * card links its own art to the tee and lists the other four products beside
 * it. Every SKU stays reachable and nothing is shown twice.
 *
 * PRICES AND VISIBILITY COME FROM PRINTIFY, NOT FROM THE LEDGER. designs.json
 * records what a product cost at publish time, which is a different claim from
 * what it costs now: edit a price in the Printify UI and the ledger silently
 * describes the past. This site already has the rule that a displayed price
 * must be live or absent — it was written after a sleeping bag showed $39 here
 * and $94 on Amazon — and merch is not exempt just because we set the price
 * ourselves. One shop-products call returns all 25 with current variant prices,
 * their visible flag, and their mockups, so live is no more expensive than
 * stale. With no token or no network the committed copy is left exactly as it
 * is; the site never falls back to numbers nobody checked.
 *
 * THE CARD ART IS A PRINTIFY MOCKUP, NOT designs/<slug>/art.jpg. The raw
 * watercolour is what the printables rail uses, and for a PDF that is right —
 * the file IS the art. Here the thing being sold is a garment, and a painting
 * on a card does not read as one. The mockup is the tee's BACK view, because
 * the front carries only the small chest logo; and Sport Grey by preference,
 * because the white colourway on this site's bone card is a white rectangle on
 * an off-white rectangle.
 */

import {
  readFileSync, writeFileSync, mkdirSync, existsSync,
} from "node:fs";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = process.env.MERCH_REPO ?? `${homedir()}/camprally-merch`;
const OUT_JSON = `${ROOT}src/data/merch.json`;
const OUT_IMG = `${ROOT}public/images/merch`;
const STORE_URL = "https://camprally.printify.me";
const DRY = process.argv.includes("--dry-run");
const REFRESH_IMAGES = process.argv.includes("--refresh-images");

/* Fixed display order, so every card lays out identically regardless of the
 * order the publisher happened to create products in. */
const KINDS = [
  { kind: "tee", label: "T-shirt" },
  { kind: "hoodie", label: "Hoodie" },
  { kind: "tote", label: "Tote bag" },
  { kind: "phone-case", label: "Phone case" },
  { kind: "mug", label: "Mug" },
];

/* Preference order for the mockup colourway. Falls through to whatever the
 * blueprint actually offers — the light-garment rule already filters these, so
 * an unlisted colour is still a light one.
 *
 * Sport Grey led this list until 2026-08-11 and was dropped on Sean's call. It
 * was chosen only for not being near-white on a bone card, which it satisfies
 * and little else: it is the muddiest of the seven enabled colourways and the
 * artwork's pale watercolour washes — mist, water, sky — lose most of their
 * separation against it. Natural is warm, reads as canvas rather than gym kit,
 * and keeps those washes legible. White stays off the list entirely: on this
 * site's #f2f1e5 card it is a white rectangle on an off-white rectangle. */
const COLOUR_PREFERENCE = ["Natural", "Sand", "Light Blue"];

const keep = (msg) => { console.log(`${msg} — keeping the committed copy`); process.exit(0); };

const statePath = `${SRC}/state/designs.json`;
if (!existsSync(statePath)) keep(`merch repo not found at ${SRC}`);

const ledger = Object.values(JSON.parse(readFileSync(statePath, "utf8")).designs ?? {});

const money = (cents) =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;

const prev = existsSync(OUT_JSON)
  ? JSON.parse(readFileSync(OUT_JSON, "utf8"))
  : { designs: [] };
const prevBySlug = new Map((prev.designs ?? []).map((d) => [d.slug, d]));

// ── live shop state ───────────────────────────────────────────────────────
let printify;
try {
  printify = await import(pathToFileURL(`${SRC}/lib/printify.mjs`).href);
  if (!printify.hasToken()) throw new Error("no PRINTIFY_ACCESS_TOKEN");
} catch (err) {
  keep(`cannot reach Printify (${err.message})`);
}

let live;
try {
  const { shop } = await printify.resolveShop();
  const all = await printify.listProducts(shop.id);
  /* An empty list is treated as a failed read rather than as "the shop is
   * empty". Emptying the section is a real outcome — unpublish everything and
   * the site should stop linking it — but it should follow from 25 products
   * reporting visible:false, not from a call that returned nothing. */
  if (!all.length) throw new Error("shop returned no products");
  live = new Map(all.map((p) => [p.id, p]));
} catch (err) {
  keep(`cannot read the shop (${err.message})`);
}

/**
 * Fingerprint of everything that would change what the mockup looks like: the
 * artwork upload, the chest logo, and the last time the tee was republished.
 * The mockup URL is stable across art changes — same product, same camera — so
 * it cannot be used to detect them.
 */
const imageKeyFor = (design, tee) => [
  design.uploads?.art ?? "",
  tee?.logoHash ?? "",
  tee?.republishedAt ?? tee?.publishedAt ?? "",
  /* The SELECTION RULE is part of the fingerprint, not just the inputs it runs
   * on. Everything above describes what Printify would render; this describes
   * which render we asked for. Without it, changing COLOUR_PREFERENCE silently
   * changes nothing — the cache still matches, no image is re-fetched, and the
   * site keeps serving the old colourway while the code claims a new one. That
   * is exactly what happened on the first cut of the Sport Grey -> Natural
   * change. Anything that alters which mockup fetchHero picks belongs here. */
  COLOUR_PREFERENCE.join("|"),
].join(":");

/** The tee's back mockup, preferring a colourway that is not near-white. */
async function fetchHero(product) {
  const colourOf = new Map(
    (product.variants ?? []).map((v) => [v.id, String(v.title).split(" / ")[0]]),
  );
  const backs = (product.images ?? []).filter((i) => i.position === "back");
  const pool = backs.length ? backs : (product.images ?? []).filter((i) => i.is_default);
  if (!pool.length) return null;

  const colourOfImage = (img) => colourOf.get(img.variant_ids?.[0]) ?? "";
  const chosen =
    COLOUR_PREFERENCE.map((c) => pool.find((i) => colourOfImage(i) === c)).find(Boolean) ??
    pool[0];

  const res = await fetch(chosen.src);
  if (!res.ok) throw new Error(`mockup ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const designs = [];
const dropped = [];
for (const design of ledger) {
  if (design.status !== "published") continue;

  const products = [];
  for (const { kind, label } of KINDS) {
    const p = design.products?.[kind];
    // No url means the storefront has never listed it — a normal intermediate
    // state while the publisher works through a design.
    if (!p?.productId || !p.url) continue;

    const now = live.get(p.productId);
    if (!now || now.visible === false) {
      dropped.push(`${design.slug}/${kind} (${now ? "not visible" : "not in shop"})`);
      continue;
    }
    const prices = (now.variants ?? []).filter((v) => v.is_enabled).map((v) => v.price);
    if (!prices.length) {
      dropped.push(`${design.slug}/${kind} (no enabled variants)`);
      continue;
    }
    const min = Math.min(...prices);
    products.push({
      kind,
      label,
      url: p.url,
      priceCents: min,
      price: money(min),
      varies: Math.max(...prices) > min,
      publishedAt: p.publishedAt ?? null,
    });
  }
  if (!products.length) continue;

  // The brief's angle is the one line of human-written copy about the design.
  let subtitle = "";
  try {
    const spec = JSON.parse(readFileSync(`${SRC}/designs/${design.slug}/spec.json`, "utf8"));
    subtitle = spec.angle ?? "";
  } catch { /* a design with no spec still lists, just without copy */ }

  const tee = design.products?.tee;
  const imageKey = imageKeyFor(design, tee);
  const dest = `${OUT_IMG}/${design.slug}.jpg`;
  let image = existsSync(dest) ? `/images/merch/${design.slug}.jpg` : null;

  const stale = !image || REFRESH_IMAGES || prevBySlug.get(design.slug)?.imageKey !== imageKey;
  const teeLive = tee?.productId ? live.get(tee.productId) : null;
  if (stale && teeLive && !DRY) {
    try {
      const buf = await fetchHero(teeLive);
      if (buf) {
        mkdirSync(OUT_IMG, { recursive: true });
        writeFileSync(dest, buf);
        image = `/images/merch/${design.slug}.jpg`;
        console.log(`  art: ${design.slug}.jpg (${Math.round(buf.length / 1024)}kb)`);
      }
    } catch (err) {
      // A card without art still sells; a failed sync that wipes the list does not.
      console.log(`  (mockup failed for ${design.slug}: ${err.message})`);
    }
  }

  const newest = products.map((p) => p.publishedAt ?? "").sort().at(-1);

  designs.push({
    slug: design.slug,
    name: design.name,
    subtitle,
    image,
    /* Recorded so the next run can tell "this art is current" from "this art
     * is whatever we happened to download first", without an extra call. */
    imageKey: image ? imageKey : null,
    fromCents: Math.min(...products.map((p) => p.priceCents)),
    from: money(Math.min(...products.map((p) => p.priceCents))),
    publishedAt: newest || null,
    products: products.map(({ publishedAt, ...rest }) => rest),
  });
}

designs.sort((a, b) => String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")));

if (dropped.length) console.log(`  dropped: ${dropped.join(", ")}`);

/* No generatedAt stamp, deliberately. build-catalog.mjs used to write one on
 * every run, which made the file differ every run: a no-op sync then produced a
 * commit, a push and a full Vercel rebuild, and made "a product changed"
 * indistinguishable from "the script ran". Prices are still verified against
 * the shop on every run — they are just only written down when one moves. */
const next = JSON.stringify({
  note: "Generated by scripts/sync-merch.mjs from the camprally-merch repo. Do not edit by hand.",
  storeUrl: STORE_URL,
  designs,
}, null, 2) + "\n";

const count = designs.reduce((n, d) => n + d.products.length, 0);
const summary = `merch: ${designs.length} designs · ${count} products live`;
const prevRaw = existsSync(OUT_JSON) ? readFileSync(OUT_JSON, "utf8") : "";
if (prevRaw === next) {
  console.log(`${summary} · prices verified · unchanged`);
  process.exit(0);
}
if (DRY) {
  console.log(`${summary} · would rewrite merch.json`);
  process.exit(0);
}
writeFileSync(OUT_JSON, next);
console.log(`${summary} · wrote src/data/merch.json`);
