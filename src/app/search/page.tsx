import type { Metadata } from "next";
import { Suspense } from "react";
import CategoryChips from "@/components/CategoryChips";
import SearchResults from "./SearchResults";

/**
 * /search — the full results page the header search box and BlogGrid's
 * "See all results" link both point at.
 *
 * NOINDEX, DELIBERATELY. Every distinct `?q=` is effectively an infinite,
 * user-generated set of near-duplicate pages over the same 58 guides — the
 * opposite of what the sitemap doctrine in src/app/sitemap.ts is protecting.
 * The guides themselves are already indexable at /blog/<slug> and the nine
 * category hubs; this page exists for a visitor already on the site, not for
 * a search engine to rank. `follow: true` so a crawler that lands here
 * anyway (an inbound link, say) still passes through to the category chips
 * and article links rendered on it.
 *
 * No `alternates.canonical` either — every other route sets one and points
 * it at itself (see the root layout's note on why canonical is per-route,
 * never inherited); a `?q=` page has no single canonical URL to claim, so it
 * stays unset rather than guessing.
 *
 * Client-rendered results (SearchResults, below) inside a Suspense boundary:
 * `useSearchParams()` requires one, and it lets this shell — the h1, the
 * intro copy, the metadata — still prerender statically while only the part
 * that actually needs the index and the URL's `q` value is client-side.
 */
export const metadata: Metadata = {
  title: "Search",
  description: "Search CampRally's budget camping guides.",
  robots: { index: false, follow: true },
};

export default function SearchPage() {
  return (
    <div>
      <div className="border-b border-camp-stone bg-camp-bone">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
          <p className="eyebrow mb-3 text-camp-green">Search</p>
          <h1 className="max-w-2xl text-h1 text-balance text-foreground">
            Search the guides
          </h1>
          <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-muted-foreground">
            Search titles, sections and article text across every budget camping guide.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <Suspense fallback={null}>
          {/* Rendered here, on the server, and handed down as a node — see
              the doc comment on SearchResults for why it can't be imported
              directly into that client component. */}
          <SearchResults categoryChips={<CategoryChips />} />
        </Suspense>
      </div>
    </div>
  );
}
