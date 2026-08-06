/**
 * The one canonical origin for this site.
 *
 * WHY IT IS www. Vercel serves the site on www.camprally.co and 307s the bare
 * apex to it. Until this constant existed, the sitemap, the robots.txt sitemap
 * line and every article's canonical tag all pointed at the APEX — so all 35
 * sitemap URLs were a redirect hop, and each article told Google "my real
 * address is over there", pointing at a redirect back to itself. Code and
 * server were asserting different canonical hosts.
 *
 * Aligning on www matches what is actually served, so no dashboard change is
 * needed. The Search Console property is `sc-domain:camprally.co`, which covers
 * both hosts and both protocols either way.
 *
 * If the apex is ever made primary instead, this is the only line to change —
 * but check that the non-canonical host redirects PERMANENTLY (308/301). The
 * apex currently answers 307, which explicitly tells Google not to consolidate
 * ranking signals onto the target.
 */
export const SITE_URL = "https://www.camprally.co";

/** Absolute URL for a site-relative path, for metadata that requires one. */
export const absoluteUrl = (path = "/") =>
  new URL(path, SITE_URL).toString().replace(/\/$/, "") || SITE_URL;
