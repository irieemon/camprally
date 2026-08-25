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

export const SITE_NAME = "CampRally";

export const SITE_DESCRIPTION =
  "Honest reviews and practical guides to help you get outdoors without breaking the bank. Budget camping gear, tips, and beginner-friendly advice.";

/**
 * Verified profile URLs for the Organization's `sameAs`, and nothing else.
 *
 * `sameAs` is the claim "these accounts are the same entity as this site", made
 * in machine-readable form to a search engine, in the one node whose whole job
 * is establishing identity. A guessed URL is a false claim of exactly the kind
 * that node exists to prevent, so this list stayed EMPTY until each entry could
 * be confirmed — organizationNode() omits the property entirely rather than
 * emitting an empty array.
 *
 * Pinterest, confirmed 2026-08-25 via the v5 API: account `camprally`, a
 * BUSINESS account with 121 pins whose own `website_url` points back at
 * camprally.co, and https://www.pinterest.com/camprally/ answers 200. The
 * reciprocal link is the part that matters — an account claiming this site and
 * this site claiming that account is what makes the assertion checkable rather
 * than merely asserted.
 *
 * Anything added here needs the same treatment: confirm the profile resolves
 * AND that it points back. Do not add a handle because it looks right.
 */
export const SOCIAL_PROFILES: string[] = [
  "https://www.pinterest.com/camprally/",
];
