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
const CATEGORY_GROUPS = (() => {
  const src = readFileSync(
    new URL("./src/data/categories.ts", import.meta.url),
    "utf8",
  );
  const groups = [
    ...src.matchAll(
      /\{\s*slug:\s*"([a-z0-9-]+)",\s*\n?\s*name:\s*"([^"]+)",\s*\n?\s*members:\s*\[([^\]]*)\]/g,
    ),
  ].map((m) => ({
    slug: m[1],
    name: m[2],
    members: [...m[3].matchAll(/"([^"]*)"/g)].map((x) => x[1]),
  }));
  if (!groups.length) {
    throw new Error(
      "no category groups found in src/data/categories.ts — the ?category= " +
      "redirect would silently match nothing",
    );
  }
  return groups;
})();

/**
 * Case-insensitive literal, as a regex source string.
 *
 * Next compiles a `has` matcher with `new RegExp("^" + value + "$")` and no
 * flags, so there is nowhere to put an `i`. Character classes are the only way
 * to express it. Non-letters are escaped — "Tips & Tricks" is a real category
 * and both the `&` and the spaces would otherwise be live regex syntax.
 */
const ci = (literal: string) =>
  [...literal]
    .map((ch) =>
      /[a-zA-Z]/.test(ch)
        ? `[${ch.toLowerCase()}${ch.toUpperCase()}]`
        : ch.replace(/[.*+?^${}()|[\]\\\-]/g, "\\$&"),
    )
    .join("");

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
      /* ONE RULE PER GROUP, matching every alias that resolves to it.
       *
       * The first version matched lowercase group SLUGS only and captured the
       * match straight into the destination. Search Console then showed that
       * the single highest-clicking URL on the site was
       * `/blog?category=Tools` — a RAW ARTICLE CATEGORY, capitalised — which
       * matched nothing and fell through to the unfiltered index. Two of the
       * site's two clicks were on that URL.
       *
       * matchesCategory() accepts a group slug, a group NAME, or a raw member
       * category, so all three shapes exist in the wild and all three have to
       * land. Capturing is no longer possible either, because "Tools" would
       * capture as "Tools" and `/blog/category/Tools` 404s under
       * dynamicParams:false — the destination has to be the canonical lowercase
       * slug, fixed per rule. Hence one rule per group rather than one clever
       * one. */
      ...CATEGORY_GROUPS.map((group) => ({
        source: "/blog",
        has: [
          {
            type: "query" as const,
            key: "category",
            value: [group.slug, group.name, ...group.members]
              .filter((v, i, a) => a.indexOf(v) === i)
              .map(ci)
              .join("|"),
          },
        ],
        destination: `/blog/category/${group.slug}`,
        permanent: true,
      })),
    ];
  },
};

export default nextConfig;
