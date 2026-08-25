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
 * EMPTY IS THE CORRECT VALUE UNTIL SOMEONE PASTES A REAL URL IN. There is a
 * Pinterest `p:domain_verify` token in the root layout and a public/assets
 * /pinterest directory, so an account of some kind plainly exists, but its
 * profile URL is written down nowhere in this repo and a guessed one is a
 * false claim about which accounts belong to this business — asserted in
 * machine-readable form, to the search engine, in the one node whose whole job
 * is establishing identity.
 *
 * organizationNode() omits `sameAs` entirely while this is empty rather than
 * emitting an empty array, so filling it in later is a one-line edit and never
 * a guess.
 */
export const SOCIAL_PROFILES: string[] = [];
