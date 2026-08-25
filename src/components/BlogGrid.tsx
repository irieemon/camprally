"use client";

import { useMemo, useState, Fragment } from "react";
import { Search, X } from "lucide-react";

export interface BlogGridItem {
  slug: string;
  /** Searched against. */
  title: string;
  /** Also searched against. */
  excerpt: string;
  /** The card, already rendered on the server. See the note below. */
  node: React.ReactNode;
}

/**
 * The guide grid, with free-text search.
 *
 * WHY THIS TAKES PRE-RENDERED NODES RATHER THAN ARTICLES.
 *
 * The obvious signature is `{ articles: Article[] }` with this component
 * rendering `<ArticleCard>` itself. That is what the previous version did, and
 * it cost two things at once.
 *
 * React elements serialize across the RSC boundary; component functions do not.
 * So rendering ArticleCard from inside a Client Component compiles ArticleCard
 * as a client component too — and it imports `@/lib/article-pricing`, which
 * imports the catalog. The whole product catalog and the custom-section data
 * shipped to the browser as a result, ~460 KB of JavaScript on a page whose job
 * is to list fifty links. Passing `node: <ArticleCard … />` keeps ArticleCard on
 * the server and the catalog out of the bundle entirely.
 *
 * The bigger cost was that the page could not be crawled. Search state lived
 * here, category state came from `useSearchParams`, and the Suspense boundary
 * that needs wrapped the entire listing — so Next client-side-rendered all of
 * it and the served HTML of /blog contained zero article links and zero article
 * titles. The index page of a fifty-article site was, to anything that does not
 * execute JavaScript, empty. That includes most AI answer engines.
 *
 * Now every card is in the static HTML and this component only hides some of
 * them. Initial state is an empty query, so the first render matches the server
 * output exactly and hydration is clean.
 *
 * Category filtering deliberately does NOT live here — it is real navigation to
 * /blog/category/<slug>, so each category is a URL that can rank rather than a
 * setState that cannot.
 */
export default function BlogGrid({
  items,
  emptyHref = "/blog",
}: {
  items: BlogGridItem[];
  /** Where "show all guides" points when a search matches nothing. */
  emptyHref?: string;
}) {
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) || i.excerpt.toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <>
      <div className="mb-8 flex flex-col gap-5 border-b border-camp-stone pb-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search guides…"
            aria-label="Search guides"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full border border-camp-stone bg-background pl-10 pr-4 text-[0.9375rem] transition-colors focus:border-camp-green focus:outline-none focus:ring-2 focus:ring-camp-green/20"
          />
        </div>
      </div>

      <p className="mb-6 text-meta text-muted-foreground" aria-live="polite">
        {visible.length} {visible.length === 1 ? "guide" : "guides"}
        {search.trim() ? (
          <>
            {" matching "}
            <span className="font-medium text-foreground">{search.trim()}</span>
            <button
              onClick={() => setSearch("")}
              className="ml-2 inline-flex items-center gap-1 text-camp-green hover:underline"
            >
              <X className="size-3" />
              Clear
            </button>
          </>
        ) : null}
      </p>

      {visible.length === 0 ? (
        <div className="border border-camp-stone bg-camp-bone px-6 py-16 text-center">
          <p className="text-[1.0625rem] font-medium text-foreground">
            No guides match that search.
          </p>
          <p className="mt-2 text-meta text-muted-foreground">
            Try a different term, or browse every guide.
          </p>
          <a
            href={emptyHref}
            className="mt-6 inline-flex h-11 items-center bg-camp-green px-6 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-camp-green-deep"
          >
            Show all guides
          </a>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((i) => (
            <Fragment key={i.slug}>{i.node}</Fragment>
          ))}
        </div>
      )}
    </>
  );
}
