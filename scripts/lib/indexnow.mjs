/**
 * IndexNow — tell search engines a URL changed, instead of waiting to be crawled.
 *
 * WHY THIS EXISTS. On 2026-08-25 Bing Webmaster Tools reported the sitemap's
 * last crawl as 11 APRIL — four months earlier — with 27 URLs discovered
 * against 50 published. Every article from April to August was invisible to
 * Bing through the sitemap, and nothing surfaced that: the sitemap was valid,
 * status "Success", zero errors. The failure mode of relying on a crawl is
 * silence, and silence looks exactly like working.
 *
 * A push notification does not have that shape. Either the endpoint accepts it
 * or it returns a status we can log.
 *
 * ONE KEY, PUBLISHED ON PURPOSE. The key is not a secret — the protocol proves
 * domain ownership by requiring it be readable at
 * https://<host>/<key>.txt, so anyone can fetch it. Committing it is correct;
 * do not treat it like a credential or rotate it defensively. If it ever needs
 * changing, both this constant and public/<key>.txt move together or the
 * endpoint rejects every submission.
 *
 * ONE ENDPOINT, MANY ENGINES. api.indexnow.org forwards to every participating
 * engine — Bing, Yandex, Seznam, Naver — so this is not Bing-specific even
 * though Bing is why it was built. Google does not participate.
 */

/** Public by design. Must match the filename in public/. */
export const IN_KEY = "9ab35fcdba56ad008e83e6dd7b2f32c8";

const ENDPOINT = "https://api.indexnow.org/IndexNow";

/**
 * Submit changed URLs.
 *
 * Returns a small result object rather than throwing, and NEVER throws, because
 * the only caller is a publish cycle that must not fail over a notification.
 * The same reasoning as the hero image: best-effort work does not get to stop
 * the thing it decorates.
 *
 * Callers should invoke this only AFTER the deploy is verified live. Announcing
 * a URL that is not being served yet invites a crawl that 404s, which is worse
 * than not announcing: it teaches the engine the URL is broken.
 */
export async function submitUrls(urls, { host, key = IN_KEY, endpoint = ENDPOINT } = {}) {
  const list = [...new Set((urls ?? []).filter(Boolean))];
  if (!list.length) return { ok: true, skipped: "no urls" };
  if (!host) return { ok: false, error: "no host given" };

  /* Every URL must be on the declared host or the whole batch is rejected with
   * 422. Filtering here rather than letting the endpoint refuse means one stray
   * absolute URL cannot silently discard the rest of the batch. */
  const onHost = list.filter((u) => {
    try {
      return new URL(u).host === host;
    } catch {
      return false;
    }
  });
  const dropped = list.length - onHost.length;
  if (!onHost.length) return { ok: false, error: `no urls on ${host}`, dropped };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList: onHost }),
      signal: AbortSignal.timeout(15_000),
    });
    /* 200 accepted, 202 accepted-pending-key-validation. Both are success.
     * 400 bad request, 403 key not valid, 422 url/host mismatch, 429 too many.
     * Reported rather than retried: a same-day retry of a rejected key would
     * fail identically, and the receipt is what makes the problem visible. */
    return {
      ok: res.status === 200 || res.status === 202,
      status: res.status,
      submitted: onHost.length,
      ...(dropped ? { dropped } : {}),
    };
  } catch (err) {
    return { ok: false, error: err?.message?.slice(0, 120) ?? "request failed", submitted: 0 };
  }
}
