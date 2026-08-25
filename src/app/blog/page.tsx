import type { Metadata } from "next";
import { articles, byNewest } from "@/data/articles";
import BlogListing from "@/components/BlogListing";

/**
 * The guide index.
 *
 * This was a Client Component: `"use client"`, a `useSearchParams` read for the
 * category, `useState` for search and pagination, and a Suspense boundary
 * wrapping the whole listing. Next therefore client-side-rendered everything
 * inside that boundary, and the HTML actually served for /blog contained no
 * article links and no article titles at all — 31 KB of chrome standing in for
 * the hub of a fifty-article site. Google can execute JavaScript and would
 * eventually have found them; most AI answer engines do not, and for them the
 * index was empty.
 *
 * Now a Server Component. All fifty cards are in the static HTML, categories
 * are real links to real pages, and the only client code left is the search
 * box, which hides cards that are already in the document.
 *
 * PAGINATION IS GONE, DELIBERATELY. It sliced to nine per page, so forty-one of
 * fifty guides were absent from the served markup even after this became a
 * server component — the same defect in a smaller font. Fifty cards is an
 * ordinary retail listing length. If the affordance is ever wanted back, the
 * rule is HIDE, NEVER SLICE: every card stays in the DOM and pages toggle
 * visibility, so the anchors survive.
 *
 * The metadata below lived in blog/layout.tsx, which existed only because a
 * Client Component cannot export it. That layout is deleted — and it had become
 * a live trap, because a layout's `alternates.canonical` is inherited by any
 * child route that does not set its own, so the new /blog/category/[slug] pages
 * would each have quietly declared themselves to be /blog.
 */
export const metadata: Metadata = {
  title: "All Guides | CampRally",
  description:
    "Every CampRally guide in one place — budget gear reviews, beginner how-tos and practical camping advice, searchable by category.",
  alternates: { canonical: "/blog" },
  openGraph: {
    /* Restated in full. Setting `openGraph` in a route REPLACES the root
     * layout's object rather than merging into it, so naming only `url` here
     * would silently drop og:title, og:description, og:site_name and og:type.
     * Same trap documented on the homepage and the article route. */
    type: "website",
    siteName: "CampRally",
    locale: "en_US",
    url: "/blog",
    title: "All Guides | CampRally",
    description:
      "Every CampRally guide in one place — budget gear reviews, beginner how-tos and practical camping advice.",
  },
};

export default function BlogPage() {
  return (
    <BlogListing
      title="Budget camping guides"
      intro="Honest, safety-reviewed gear guides to get you outdoors for less."
      activeSlug={null}
      articles={[...articles].sort(byNewest)}
    />
  );
}
