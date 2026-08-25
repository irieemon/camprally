/**
 * Replace the article pins with correct ones.
 *
 * THREE DEFECTS, ALL FROM THE SAME CAUSE. The article pins were made by CSV
 * bulk upload, and Pinterest's CSV format has no alt-text column:
 *
 *   - 66 of 66 have NO alt_text at all. (The 38 merch pins do — they were made
 *     another way, which is what made the gap visible.)
 *   - 61 of 66 have a description that is the title plus the boilerplate
 *     "Budget camping gear that actually works." — the same restates-the-title
 *     defect this repo removed from meta descriptions.
 *   - 66 of 66 link to the APEX, which 308s to www, so every click through
 *     from Pinterest pays a redirect.
 *
 * WHY REPLACE RATHER THAN EDIT. PATCH /v5/pins/{id} returns 401 "your
 * application does not have access to this restricted feature: pin_edit",
 * verified with two independent tokens both carrying pins:write, so it is an
 * app-level entitlement rather than a scope problem. Creation is not
 * restricted. Replacing is the only route the API allows.
 *
 * That is only acceptable because there is nothing to lose: across all 66 pins,
 * lifetime engagement is 0 saves, 42 impressions and 1 click. On an account
 * with real traction this script would be the wrong answer and pin_edit
 * approval would be worth the wait.
 *
 * ORDER IS THE SAFETY PROPERTY. Create the replacement, read it back, and only
 * then delete the original. A failure at any step leaves the original pin
 * standing — the corpus can end up with a duplicate, which is recoverable, but
 * never with a hole, which is not.
 *
 *   node scripts/fix-pinterest-pins.mjs --dry-run
 *   node scripts/fix-pinterest-pins.mjs [--limit N] [--skip-slug <slug>]
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";

const ROOT = new URL("..", import.meta.url).pathname;
const DRY = process.argv.includes("--dry-run");
const lIdx = process.argv.indexOf("--limit");
const LIMIT = lIdx > -1 ? Number(process.argv[lIdx + 1]) : Infinity;
const sIdx = process.argv.indexOf("--skip-slug");
const SKIP = sIdx > -1 ? process.argv[sIdx + 1] : null;
const LOG = `${ROOT}state/pinterest-migration.jsonl`;

const SITE = "https://www.camprally.co";

function token() {
  if (process.env.PINTEREST_ACCESS_TOKEN) return process.env.PINTEREST_ACCESS_TOKEN;
  const cfg = JSON.parse(readFileSync(`${homedir()}/.openclaw/openclaw.json`, "utf8"));
  const find = (o, k) => {
    if (!o || typeof o !== "object") return null;
    for (const [a, b] of Object.entries(o)) {
      if (a === k) return b;
      if (typeof b === "object") { const r = find(b, k); if (r) return r; }
    }
    return null;
  };
  return find(cfg, "PINTEREST_ACCESS_TOKEN");
}

const TOKEN = token();
if (!TOKEN) { console.error("no Pinterest access token"); process.exit(1); }
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Article metadata: the good excerpt, the described hero alt, and the hero's
 * REAL url.
 *
 * The hero url is read from heroes.ts rather than assumed to be
 * /images/heroes/<slug>.jpg. Assuming it cost 10 of the first 64 replacements:
 * six slugs still point at images.unsplash.com, the guessed local path 404s for
 * those, and Pinterest answers "Sorry we could not fetch the image" — which
 * reads like a Pinterest problem and is entirely ours. Relative paths are
 * absolutised against the live site; absolute ones are passed through, since
 * Pinterest fetches the image itself and does not care who hosts it.
 */
function articleData() {
  const alt = JSON.parse(readFileSync(`${ROOT}src/data/hero-alt.json`, "utf8"));
  const heroesSrc = readFileSync(`${ROOT}src/data/heroes.ts`, "utf8");
  const heroes = Object.fromEntries(
    [...heroesSrc.matchAll(/"([a-z0-9-]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );
  const src = readFileSync(`${ROOT}src/data/articles.ts`, "utf8");
  const meta = {};
  for (const m of src.matchAll(
    /slug: "([^"]+)"[\s\S]{0,700}?title: "((?:[^"\\]|\\.)*)"[\s\S]{0,700}?excerpt: "((?:[^"\\]|\\.)*)"/g,
  )) {
    const hero = heroes[m[1]];
    meta[m[1]] = {
      title: m[2],
      excerpt: m[3],
      alt: alt[m[1]] ?? null,
      image: hero ? (hero.startsWith("http") ? hero : `${SITE}${hero}`) : null,
    };
  }
  return meta;
}

async function allPins() {
  let bookmark = "", out = [], pages = 0;
  do {
    const r = await fetch(
      `https://api.pinterest.com/v5/pins?page_size=100${bookmark ? `&bookmark=${bookmark}` : ""}`,
      { headers: H },
    );
    const j = await r.json();
    if (j.code) throw new Error(`list pins: ${JSON.stringify(j).slice(0, 200)}`);
    out = out.concat(j.items ?? []);
    bookmark = j.bookmark ?? "";
    pages++;
  } while (bookmark && pages < 6);
  return out;
}

const meta = articleData();
const pins = await allPins();

/* An article pin that still needs work. A pin already carrying alt_text and a
 * www link is left alone, so this is safe to re-run after a partial pass. */
const targets = pins
  .map((p) => {
    const m = (p.link ?? "").match(/camprally\.co\/blog\/([a-z0-9-]+)/);
    return m ? { pin: p, slug: m[1] } : null;
  })
  .filter(Boolean)
  .filter(({ pin, slug }) => {
    // Needs both a description of the image and an image to point at.
    if (!meta[slug]?.alt || !meta[slug]?.image) return false;
    if (SKIP && slug === SKIP) return false;
    const needsAlt = !pin.alt_text?.trim();
    const apex = /^https:\/\/camprally\.co/.test(pin.link ?? "");
    const boiler = (pin.description ?? "").includes("Budget camping gear that actually works");
    return needsAlt || apex || boiler;
  })
  .slice(0, LIMIT);

console.log(`${pins.length} pins total, ${targets.length} article pins to replace\n`);
if (!targets.length) process.exit(0);
if (DRY) {
  targets.forEach((t) => console.log(`  ${t.slug}  (pin ${t.pin.id})`));
  console.log("\n--dry-run: nothing created or deleted");
  process.exit(0);
}

let replaced = 0;
const failed = [];

for (const [i, { pin, slug }] of targets.entries()) {
  const m = meta[slug];
  process.stdout.write(`[${i + 1}/${targets.length}] ${slug} … `);

  // 1. CREATE the replacement.
  let created;
  try {
    const r = await fetch("https://api.pinterest.com/v5/pins", {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        board_id: pin.board_id,
        ...(pin.board_section_id ? { board_section_id: pin.board_section_id } : {}),
        title: m.title.slice(0, 100),
        description: m.excerpt.slice(0, 800),
        alt_text: m.alt.slice(0, 500),
        link: `${SITE}/blog/${slug}`,
        media_source: { source_type: "image_url", url: m.image },
      }),
    });
    const j = await r.json();
    if (r.status >= 400) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 160)}`);
    created = j.id;
  } catch (err) {
    console.log(`CREATE FAILED — original left intact (${err.message.slice(0, 90)})`);
    failed.push({ slug, stage: "create", error: err.message.slice(0, 160) });
    await sleep(1500);
    continue;
  }

  // 2. READ IT BACK. A 201 is not proof the fields landed.
  await sleep(2000);
  let verified = false;
  try {
    const v = await (await fetch(`https://api.pinterest.com/v5/pins/${created}`, { headers: H })).json();
    verified = Boolean(v.alt_text?.trim()) && v.link === `${SITE}/blog/${slug}`;
  } catch { verified = false; }
  if (!verified) {
    console.log(`created ${created} but VERIFY FAILED — original left intact, duplicate exists`);
    failed.push({ slug, stage: "verify", created });
    await sleep(1500);
    continue;
  }

  // 3. Only now remove the original.
  try {
    const d = await fetch(`https://api.pinterest.com/v5/pins/${pin.id}`, { method: "DELETE", headers: H });
    if (d.status >= 400 && d.status !== 404) {
      throw new Error(`${d.status} ${(await d.text()).slice(0, 120)}`);
    }
  } catch (err) {
    console.log(`replacement ${created} ok but DELETE FAILED — duplicate exists (${err.message.slice(0, 80)})`);
    failed.push({ slug, stage: "delete", created, old: pin.id });
    await sleep(1500);
    continue;
  }

  replaced++;
  console.log(`ok — new ${created}, removed ${pin.id}`);
  appendFileSync(LOG, JSON.stringify({ slug, old: pin.id, new: created, at: new Date().toISOString() }) + "\n");
  // Pinterest rate-limits writes; pacing beats being throttled mid-run.
  await sleep(1500);
}

console.log(`\nreplaced ${replaced}, failed ${failed.length}`);
for (const f of failed) console.log(`  ${f.slug} — ${f.stage}${f.created ? ` (created ${f.created})` : ""}`);
if (failed.length) console.log("\nRe-run to retry; pins already fixed are skipped.");
