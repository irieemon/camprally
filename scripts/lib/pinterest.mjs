/**
 * Pinterest API client — enough of it to publish a pin per article.
 *
 * WHY THIS REPLACES THE CSV. Article pins were made by Pinterest's bulk CSV
 * upload, whose columns are board_name, title, description, link, image_url and
 * published_at. There is NO alt-text column, so every pin created that way
 * ships without alt text — 66 of 66 did — and there is no way to add it in the
 * format. The apex links and the title-plus-boilerplate descriptions were the
 * same class of problem: a human filling a spreadsheet, with nothing checking
 * the result.
 *
 * The API takes alt_text on creation, so the defect stops being possible rather
 * than being something to remember.
 *
 * TOKENS ARE NEVER WRITTEN ANYWHERE. The access token expires in 30 days; the
 * refresh token outlives it. Rather than persist a rotating secret, this asks
 * for a fresh access token whenever the stored one is refused, holds it in
 * memory for the process, and forgets it on exit. A cycle runs for a couple of
 * minutes, so the cost is one extra request at most and there is no new place
 * for a credential to leak from.
 *
 * Everything returns a result object and NOTHING THROWS to the caller. Same
 * contract as llm.mjs and indexnow.mjs, and for the same reason: a social post
 * that failed must never be the thing that stops an article publishing.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const API = "https://api.pinterest.com/v5";

/** Read a key out of the OpenClaw config, wherever it is nested. */
function fromOpenclaw(key) {
  try {
    const cfg = JSON.parse(readFileSync(`${homedir()}/.openclaw/openclaw.json`, "utf8"));
    const find = (o, k) => {
      if (!o || typeof o !== "object") return null;
      for (const [a, b] of Object.entries(o)) {
        if (a === k) return b;
        if (typeof b === "object") {
          const r = find(b, k);
          if (r) return r;
        }
      }
      return null;
    };
    return find(cfg, key);
  } catch {
    return null;
  }
}

const conf = (k) => process.env[k] ?? fromOpenclaw(k);

/** The board article pins live on. Overridable without touching code. */
export const ARTICLE_BOARD_ID =
  process.env.PINTEREST_ARTICLE_BOARD_ID ?? "1152569798327061469";

let cachedToken = null;

/** Mint a new access token from the refresh token. In memory only. */
async function refreshToken() {
  const id = conf("PINTEREST_CLIENT_ID");
  const secret = conf("PINTEREST_CLIENT_SECRET");
  const refresh = conf("PINTEREST_REFRESH_TOKEN");
  if (!id || !secret || !refresh) return null;
  try {
    const r = await fetch(`${API}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * A request that survives an expired access token.
 *
 * The stored token is tried first because it usually works; a 401 triggers one
 * refresh and one retry. Only one retry — a second 401 after a fresh token
 * means the problem is the app or the scope, and hammering it turns a clear
 * failure into a slow one.
 */
async function call(path, init = {}, { allowRefresh = true } = {}) {
  if (!cachedToken) cachedToken = conf("PINTEREST_ACCESS_TOKEN");
  if (!cachedToken) return { ok: false, error: "no Pinterest access token configured" };

  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cachedToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (res.status === 401 && allowRefresh) {
    const fresh = await refreshToken();
    if (fresh) {
      cachedToken = fresh;
      return call(path, init, { allowRefresh: false });
    }
  }

  let body = null;
  try {
    body = res.status === 204 ? {} : await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

/** Does a pin for this article already exist? Keeps the cycle idempotent. */
export async function pinExistsFor(slug, { pages = 3 } = {}) {
  let bookmark = "";
  for (let i = 0; i < pages; i++) {
    const r = await call(`/pins?page_size=100${bookmark ? `&bookmark=${bookmark}` : ""}`);
    if (!r.ok) return { ok: false, error: `list failed (${r.status})` };
    const items = r.body?.items ?? [];
    if (items.some((p) => (p.link ?? "").includes(`/blog/${slug}`))) {
      return { ok: true, exists: true };
    }
    bookmark = r.body?.bookmark ?? "";
    if (!bookmark) break;
  }
  return { ok: true, exists: false };
}

/**
 * Create one pin.
 *
 * `altText` is required rather than optional, on purpose. Making it optional is
 * how the CSV path produced 66 pins without it — the field was simply never
 * filled in, and nothing noticed for months. A caller with no description of
 * the image should fix that first.
 */
export async function createPin({ boardId, title, description, altText, link, imageUrl }) {
  if (!altText?.trim()) return { ok: false, error: "refusing to create a pin with no alt text" };
  if (!imageUrl) return { ok: false, error: "no image url" };

  const r = await call("/pins", {
    method: "POST",
    body: JSON.stringify({
      board_id: boardId ?? ARTICLE_BOARD_ID,
      title: String(title).slice(0, 100),
      description: String(description).slice(0, 800),
      alt_text: String(altText).slice(0, 500),
      link,
      media_source: { source_type: "image_url", url: imageUrl },
    }),
  });

  if (!r.ok) {
    return {
      ok: false,
      status: r.status,
      error: JSON.stringify(r.body ?? {}).slice(0, 200),
    };
  }
  return { ok: true, id: r.body?.id };
}
