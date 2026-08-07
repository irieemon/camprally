"use client";

import { Suspense, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { articles, byNewest } from "@/data/articles";
import { populatedGroups, groupCounts, matchesCategory } from "@/data/categories";
import ArticleCard from "@/components/ArticleCard";
import { Search, X } from "lucide-react";

const ARTICLES_PER_PAGE = 9;

function BlogIndex() {
  const searchParams = useSearchParams();
  /* The nav and the homepage category rail have always linked to
   * `/blog?category=…`, but this page only ever read local state, so every one
   * of those links landed on an unfiltered index. Seed from the URL. */
  const initialCategory = searchParams.get("category");

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(initialCategory);
  const [page, setPage] = useState(1);

  const groups = populatedGroups();
  const counts = groupCounts();

  const filtered = useMemo(() => {
    /* Newest first.
     *
     * There was no sort here at all, so the index rendered `articles` in array
     * order — which is append order, because publish-article adds each new
     * entry at the end. Every newly published guide was therefore born on the
     * LAST page of the index and pushed further away with each publish: the
     * newer the article, the harder it was to find. `camping-fire-starting-guide`
     * went live and landed at index 27 of 28, page 4 of 4, linked from nowhere
     * else on the site. */
    let result = [...articles].sort(byNewest);
    if (activeCategory) {
      result = result.filter((a) => matchesCategory(a.category, activeCategory));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.excerpt.toLowerCase().includes(q)
      );
    }
    return result;
  }, [search, activeCategory]);

  const totalPages = Math.ceil(filtered.length / ARTICLES_PER_PAGE);
  const paginated = filtered.slice(
    (page - 1) * ARTICLES_PER_PAGE,
    page * ARTICLES_PER_PAGE
  );

  function selectCategory(slug: string | null) {
    setActiveCategory(slug);
    setPage(1);
  }

  const activeName =
    groups.find((g) => g.slug === activeCategory)?.name ?? activeCategory;

  return (
    <div>
      {/* Page header on a bone band, the way a retail listing page separates
          "where am I" from "what's for sale". */}
      <div className="border-b border-camp-stone bg-camp-bone">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
          <p className="eyebrow mb-3 text-camp-green">Gear guides</p>
          <h1 className="max-w-2xl text-h1 text-balance text-foreground">
            {activeName ? activeName : "Budget camping guides"}
          </h1>
          <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-muted-foreground">
            Honest reviews and field-tested picks to get you outdoors for less.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        {/* Filter bar */}
        <div className="mb-8 flex flex-col gap-5 border-b border-camp-stone pb-6">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search guides…"
              aria-label="Search guides"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-11 w-full border border-camp-stone bg-background pl-10 pr-4 text-[0.9375rem] transition-colors focus:border-camp-green focus:outline-none focus:ring-2 focus:ring-camp-green/20"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => selectCategory(null)}
              className={`inline-flex h-9 items-center border px-4 text-meta font-medium transition-colors ${
                activeCategory === null
                  ? "border-camp-green bg-camp-green text-white"
                  : "border-camp-stone bg-background text-foreground hover:border-camp-green hover:text-camp-green"
              }`}
            >
              All {articles.length}
            </button>
            {groups.map((g) => (
              <button
                key={g.slug}
                onClick={() => selectCategory(activeCategory === g.slug ? null : g.slug)}
                className={`inline-flex h-9 items-center gap-1.5 border px-4 text-meta font-medium transition-colors ${
                  activeCategory === g.slug
                    ? "border-camp-green bg-camp-green text-white"
                    : "border-camp-stone bg-background text-foreground hover:border-camp-green hover:text-camp-green"
                }`}
              >
                {g.name}
                <span className="opacity-60">{counts.get(g.slug)}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="mb-6 text-meta text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "guide" : "guides"}
          {activeName && (
            <>
              {" in "}
              <span className="font-medium text-foreground">{activeName}</span>
              <button
                onClick={() => selectCategory(null)}
                className="ml-2 inline-flex items-center gap-1 text-camp-green hover:underline"
              >
                <X className="size-3" />
                Clear
              </button>
            </>
          )}
        </p>

        {paginated.length === 0 ? (
          <div className="border border-camp-stone bg-camp-bone px-6 py-16 text-center">
            <p className="text-[1.0625rem] font-medium text-foreground">
              No guides match that search.
            </p>
            <p className="mt-2 text-meta text-muted-foreground">
              Try a different term, or browse every guide.
            </p>
            <button
              onClick={() => {
                setSearch("");
                selectCategory(null);
              }}
              className="mt-6 inline-flex h-11 items-center bg-camp-green px-6 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-camp-green-deep"
            >
              Show all guides
            </button>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {paginated.map((article, i) => (
              <ArticleCard key={article.slug} article={article} priority={i < 3} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-12 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex h-10 items-center border border-camp-stone px-4 text-meta font-medium transition-colors hover:border-camp-green disabled:pointer-events-none disabled:opacity-40"
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                aria-current={p === page ? "page" : undefined}
                className={`inline-flex size-10 items-center justify-center text-meta font-medium transition-colors ${
                  p === page
                    ? "bg-camp-green text-white"
                    : "border border-camp-stone hover:border-camp-green"
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="inline-flex h-10 items-center border border-camp-stone px-4 text-meta font-medium transition-colors hover:border-camp-green disabled:pointer-events-none disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BlogPage() {
  /* useSearchParams needs a Suspense boundary — without one the whole route
   * opts out of static generation. */
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <BlogIndex />
    </Suspense>
  );
}
