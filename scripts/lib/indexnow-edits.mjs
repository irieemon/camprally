/**
 * IndexNow for EDITED articles — the half that indexnow.mjs's only caller never
 * covered.
 *
 * WHY THIS EXISTS. run-cycle announces an article exactly once: the moment the
 * rail publishes it (step 8). A guide rewritten by hand and pushed to main was
 * never announced at all — the nine SEO rewrites of 2026-09-24 (d156249,
 * 1936647) had to be submitted by hand — so Bing learned about an edit only by
 * crawling, and a crawl is precisely what went four months stale in 2026
 * (see the header of indexnow.mjs).
 *
 * THE SIGNAL IS `lastChanged` — `updated ?? date` in articles.ts. Not a content
 * hash, on purpose. It is the same value the sitemap reports as lastmod and the
 * page reports as dateModified, so what this announces and what the site claims
 * cannot disagree. It also inherits that field's doctrine: price refreshes and
 * catalog rebuilds do not bump it, so they are not announced, and an edit that
 * does not bump `updated` is not an editorial update as far as the site is
 * concerned either. Bump the date, and the notice follows.
 *
 * STATE IS A LEDGER OF WHAT WAS ANNOUNCED, not of what was seen. A slug moves
 * to the new version only after the URL was confirmed serving it AND the
 * endpoint accepted the batch. Anything short of that stays different from the
 * ledger, so the next cycle simply tries again — a slow deploy or a 429 costs a
 * day, never the notice.
 *
 * Every export here is never-throw, for the same reason as submitUrls: the
 * caller is a publish cycle, and a notification does not get to stop it.
 */

import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";

/* A flood guard, not a quota. IndexNow accepts 10,000 URLs a call; the concern
 * is a bug upstream — a parser that half-works, a ledger reset — turning into
 * every URL on the site being re-announced at once, which is the one outcome
 * Sean ruled out. A real bulk rewrite larger than this still goes out in full,
 * a day at a time, newest edits first. */
export const MAX_PER_CYCLE = 25;

/* How far back a CORRUPT ledger is presumed to have been hiding edits. See
 * the corrupt branch of announceEdits. */
const RECOVERY_DAYS = 7;

/**
 * slug -> lastChanged, read from articles.ts as TEXT (plain Node cannot import
 * the TypeScript, and every other script here parses it the same way).
 *
 * Fields are matched line-anchored at the object's own indentation, and only
 * in the object's HEAD — the slice from its `{` to its `content:` — because
 * every field precedes the body in all 67 entries and a body is free text: a
 * four-space-indented markdown line reading `updated: "…"` would otherwise be
 * taken for the field. (The first cut sliced to the next `slug:` and the test
 * for exactly that case failed.)
 */
export function articleVersions(src) {
  const out = {};
  try {
    const marks = [...String(src).matchAll(/^ {4}slug: "([^"]+)"/gm)].map((m) => ({ slug: m[1], at: m.index }));
    marks.forEach((mark, i) => {
      const end = marks[i + 1]?.at ?? src.length;
      const body = src.indexOf("\n    content: `", mark.at);
      const chunk = src.slice(src.lastIndexOf("{", mark.at), body > 0 && body < end ? body : end);
      const date = chunk.match(/^ {4}date: "([^"]+)"/m)?.[1];
      const updated = chunk.match(/^ {4}updated: "([^"]+)"/m)?.[1];
      if (updated ?? date) out[mark.slug] = updated ?? date;
    });
  } catch { /* an unreadable source reads as no articles, which the caller refuses */ }
  return out;
}

/**
 * The ledger, or why there isn't one.
 *
 * "missing" and "corrupt" are kept apart deliberately. A missing file is the
 * first run and seeds silently. A corrupt one must NOT read as either "nothing
 * changed" (it would never announce again) or "everything changed" (a flood).
 * Valid JSON of the wrong shape counts as corrupt: `{}` parsed fine and meant
 * nothing is exactly how a ledger goes quietly dead. An EMPTY announced map is
 * valid, though — a recovery can legitimately write one, and calling it corrupt
 * would recover it again every cycle.
 */
export function readLedger(path) {
  if (!existsSync(path)) return { ledger: null, problem: "missing" };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    const a = parsed?.announced;
    if (!a || typeof a !== "object" || Array.isArray(a) ||
        !Object.values(a).every((v) => typeof v === "string")) {
      return { ledger: null, problem: "corrupt: no announced map" };
    }
    return { ledger: parsed, problem: null };
  } catch (err) {
    return { ledger: null, problem: `corrupt: ${err?.message?.slice(0, 80) ?? "unreadable"}` };
  }
}

/** Temp-then-rename, so a cycle killed mid-write cannot leave half a ledger. */
function writeLedger(path, announced, extra = {}) {
  const tmp = `${path}.tmp`;
  const sorted = Object.fromEntries(Object.entries(announced).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(tmp, JSON.stringify({ updatedAt: new Date().toISOString(), ...extra, announced: sorted }, null, 2) + "\n");
  renameSync(tmp, path);
}

/** Slugs whose current version is not the announced one, newest edit first. */
export function changedSlugs(announced, current) {
  return Object.keys(current)
    .filter((slug) => current[slug] !== announced[slug])
    .sort((a, b) => current[b].localeCompare(current[a]) || a.localeCompare(b));
}

/* Per-URL budget for servesVersion. Same 5 s as step 8's deploy verifier. It
 * matters because the checks gate step 3: with 15 s each, run one after another,
 * 25 URLs against an unreachable origin held the cycle for ~375 s before it
 * reached the queue. Checks now run concurrently (see announceEdits), so this is
 * also the whole step's worst case. */
export const CHECK_TIMEOUT_MS = 5_000;

/**
 * Is the origin serving THIS version of the page?
 *
 * 200 alone is not enough for an edit — the old version answered 200 too. The
 * page's article schema carries dateModified from the same lastChanged value,
 * so a mismatch means the deploy has not landed and the notice waits. A page
 * with no dateModified at all falls back to 200 alone: verification getting
 * weaker is survivable, verification getting stuck is not (verify-deploy.mjs).
 * Redirects are not followed — a URL that redirects is not the URL to announce.
 *
 * The timeout is a RACE, not just an abort signal. The signal cancels a real
 * fetch, but it only works if whatever is awaited honours it — a body that
 * stalls after the headers, or an injected fetch that ignores it, would hang the
 * step regardless. The timer settles the answer either way.
 */
export async function servesVersion(url, version, { fetchImpl = fetch, timeoutMs = CHECK_TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      ctrl.abort();
      resolve({ ok: false, why: `timeout after ${timeoutMs} ms` });
    }, timeoutMs);
  });
  const check = (async () => {
    try {
      const res = await fetchImpl(url, { redirect: "manual", signal: ctrl.signal });
      if (res.status !== 200) return { ok: false, why: `http ${res.status}` };
      const body = await res.text();
      const live = body.match(/"dateModified"\s*:\s*"([^"]+)"/)?.[1];
      if (live && !live.startsWith(version)) return { ok: false, why: `serving ${live}, not ${version}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, why: err?.message?.slice(0, 80) ?? "fetch failed" };
    }
  })();
  try {
    return await Promise.race([check, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One cycle's worth of edit announcements. Returns a receipt-sized object and
 * NEVER throws.
 *
 *   { seeded }                     first run: ledger written, nothing sent
 *   { reseeded, seeded, ... }      ledger was corrupt: recovered, see below
 *   { changed: 0 }                 nothing to do
 *   { changed, submitted, pending, deferred, indexNow }
 *   { error }                      refused to act; ledger untouched
 */
export async function announceEdits({
  src, ledgerPath, origin, dry = false, now = new Date(),
  fetchImpl = fetch, submit, max = MAX_PER_CYCLE, checkTimeoutMs = CHECK_TIMEOUT_MS,
}) {
  try {
    const current = articleVersions(src);
    const total = Object.keys(current).length;
    /* A parser returning nothing looks exactly like a site with no articles. The
     * sweep script once reported "0 of 0 flagged" off a regex that matched
     * nothing; here the same bug would seed an empty ledger and announce all ~67
     * guides the next day. Refuse, and leave the ledger alone. */
    if (!total) return { error: "parsed 0 articles from articles.ts — ledger untouched" };

    let { ledger, problem } = readLedger(ledgerPath);
    let recovered = null;

    if (problem === "missing") {
      // First run: everything currently live counts as announced. Silent by
      // design — the alternative is re-sending the whole site on day one.
      if (!dry) writeLedger(ledgerPath, current, { seededAt: now.toISOString() });
      return { seeded: total, ...(dry ? { dry: true } : {}) };
    }

    if (problem) {
      /* Corrupt. Keep the evidence, then rebuild — but NOT as a silent seed. The
       * edits made since the ledger was last good are unknowable, so articles
       * changed in the last RECOVERY_DAYS are left OUT of the rebuilt ledger and
       * fall through to the normal path below: re-sending a handful is harmless,
       * losing a real edit is the failure this file exists to fix. */
      const cutoff = new Date(now.getTime() - RECOVERY_DAYS * 864e5).toISOString().slice(0, 10);
      const seed = Object.fromEntries(Object.entries(current).filter(([, v]) => v < cutoff));
      if (!dry) {
        try { renameSync(ledgerPath, `${ledgerPath}.corrupt-${now.toISOString().replace(/[:.]/g, "-")}`); } catch { /* overwritten below */ }
        // The recovery is reported on this run's receipt (`reseeded`) and the
        // bad file survives as .corrupt-*; the ledger itself does not carry it,
        // or every later rewrite would repeat a one-off event forever.
        writeLedger(ledgerPath, seed, { seededAt: now.toISOString() });
      }
      ledger = { announced: seed };
      recovered = { reseeded: problem, seeded: Object.keys(seed).length };
    }

    const announced = { ...ledger.announced };
    /* A ledger far larger than what parsed is a parse gone partly wrong, not
     * half the site deleted. Same refusal as zero, for the same reason. */
    if (total < Object.keys(announced).length / 2) {
      return { error: `parsed ${total} articles against ${Object.keys(announced).length} announced — ledger untouched` };
    }

    // Unpublished slugs leave the ledger; a republished one is then new again.
    const removed = Object.keys(announced).filter((s) => !(s in current));
    removed.forEach((s) => delete announced[s]);

    const changed = changedSlugs(announced, current);
    if (!changed.length) {
      if (removed.length && !dry) writeLedger(ledgerPath, announced, pick(ledger));
      return { ...recovered, changed: 0 };
    }

    const batch = changed.slice(0, max);
    const deferred = changed.length - batch.length;
    if (dry) return { ...recovered, changed: changed.length, wouldAnnounce: batch, dry: true };

    /* All at once, not one after another. The batch is already capped at `max`
     * (25) by the flood guard, and the origin is our own CDN-fronted site, so 25
     * concurrent GETs are nothing to it — and the step's worst case becomes ONE
     * timeout instead of one per URL. Results are read back in batch order, so
     * the receipt and ledger do not depend on which answer came first. */
    const pending = [];
    const live = [];
    const checks = await Promise.all(batch.map((slug) =>
      servesVersion(`${origin}/blog/${slug}`, current[slug], { fetchImpl, timeoutMs: checkTimeoutMs })));
    batch.forEach((slug, i) => {
      if (checks[i].ok) live.push(slug);
      else pending.push({ slug, why: checks[i].why });
    });

    let indexNow = null;
    if (live.length) {
      try {
        indexNow = await submit(live.map((s) => `${origin}/blog/${s}`), { host: new URL(origin).host });
      } catch (err) {
        indexNow = { ok: false, error: err?.message?.slice(0, 120) ?? "submit threw" };
      }
      // Recorded only on acceptance. A rejected batch stays different from the
      // ledger, which is the whole retry mechanism.
      if (indexNow?.ok) live.forEach((s) => { announced[s] = current[s]; });
      else live.forEach((slug) => pending.push({ slug, why: `indexnow ${indexNow?.status ?? indexNow?.error ?? "failed"}` }));
    }

    if (indexNow?.ok || removed.length || recovered) writeLedger(ledgerPath, announced, pick(ledger));

    return {
      ...recovered,
      changed: changed.length,
      submitted: indexNow?.ok ? live : [],
      ...(pending.length ? { pending } : {}),
      ...(deferred ? { deferred } : {}),
      ...(indexNow ? { indexNow } : {}),
    };
  } catch (err) {
    return { error: err?.message?.slice(0, 160) ?? "announceEdits threw" };
  }
}

/** Ledger metadata worth carrying forward across rewrites. Only seededAt: a
 * one-off event (a recovery) belongs on that run's receipt, not on every ledger
 * write after it. */
const pick = (ledger) => ({
  ...(ledger?.seededAt ? { seededAt: ledger.seededAt } : {}),
});

/**
 * Mark slugs announced by someone else — run-cycle's step 8, which notifies a
 * NEW article itself. Without this the next cycle would see the slug missing
 * from the ledger and announce it a second time.
 *
 * Does nothing when there is no healthy ledger: announceEdits owns seeding and
 * recovery, and a half-built ledger written from here would pre-empt both.
 */
export function recordAnnounced(ledgerPath, versions) {
  try {
    const { ledger, problem } = readLedger(ledgerPath);
    if (problem) return false;
    writeLedger(ledgerPath, { ...ledger.announced, ...versions }, pick(ledger));
    return true;
  } catch {
    return false;
  }
}
