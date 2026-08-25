import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

/* The category slugs, read out of src/data/categories.ts as text.
 *
 * Importing the module would be nicer and does not work: categories.ts imports
 * "@/data/articles", and tsconfig path aliases are not resolved when Next loads
 * this config, so the import fails at build time with "Cannot find module".
 *
 * Reading rather than hardcoding is what stops a newly added group from
 * silently losing its redirect. Same trade, and the same justification, as
 * scripts/lib/taxonomy.mjs: parsing source text is inelegant, but a copy drifts
 * in silence and this throws. */
const CATEGORY_SLUGS = (() => {
  const src = readFileSync(
    new URL("./src/data/categories.ts", import.meta.url),
    "utf8",
  );
  const slugs = [...src.matchAll(/^\s*slug:\s*"([a-z0-9-]+)",/gm)].map((m) => m[1]);
  if (!slugs.length) {
    throw new Error(
      "no category slugs found in src/data/categories.ts — the ?category= " +
      "redirect would silently match nothing",
    );
  }
  return [...new Set(slugs)].join("|");
})();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },

  async redirects() {
    return [
      /* /blog?category=<slug> → /blog/category/<slug>
       *
       * Categories used to be a query parameter read by a client component.
       * Those URLs are in the wild — the nav, the footer and the homepage rail
       * all pointed at them for months, and anything external that linked to a
       * category used that shape.
       *
       * A permanent redirect rather than a canonical tag, because a redirect
       * takes the URL out of the crawl set instead of asking Google to make a
       * judgement about two live pages. Note the incoming query is merged into
       * the destination by design, so this lands on
       * /blog/category/shelter?category=shelter — harmless, since the
       * destination self-canonicalises to the clean path.
       *
       * Do NOT "tidy" this by adding `Disallow: /blog?category=` to robots.ts.
       * Blocking the URL stops Googlebot from ever seeing this redirect, which
       * is the opposite of consolidating the signal. */
      {
        source: "/blog",
        has: [
          {
            type: "query" as const,
            key: "category",
            value: `(?<cat>${CATEGORY_SLUGS})`,
          },
        ],
        destination: "/blog/category/:cat",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
