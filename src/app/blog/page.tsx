"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { articles } from "@/data/articles";
import { Search } from "lucide-react";

const ARTICLES_PER_PAGE = 9;

export default function BlogPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const categories = useMemo(
    () => Array.from(new Set(articles.map((a) => a.category))).sort(),
    []
  );

  const filtered = useMemo(() => {
    let result = articles;
    if (activeCategory) {
      result = result.filter((a) => a.category === activeCategory);
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

  function handleCategoryClick(cat: string) {
    setActiveCategory(activeCategory === cat ? null : cat);
    setPage(1);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-3xl font-bold md:text-4xl">
        Budget Camping Guides
      </h1>
      <p className="mb-8 text-muted-foreground">
        Honest reviews and tips to get you outdoors for less
      </p>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search articles..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="h-10 w-full rounded-lg border bg-card pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Category Filters */}
      <div className="mb-8 flex flex-wrap gap-2">
        <button
          onClick={() => {
            setActiveCategory(null);
            setPage(1);
          }}
          className={`inline-flex h-7 items-center rounded-full px-3 text-xs font-medium transition ${
            activeCategory === null
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => handleCategoryClick(cat)}
            className={`inline-flex h-7 items-center rounded-full px-3 text-xs font-medium transition ${
              activeCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Article Grid */}
      {paginated.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          No articles found. Try a different search or category.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {paginated.map((article) => (
            <Link key={article.slug} href={`/blog/${article.slug}`}>
              <Card className="h-full transition hover:shadow-md hover:-translate-y-0.5">
                <CardHeader>
                  <div className="mb-1">
                    <Badge variant="secondary">{article.category}</Badge>
                  </div>
                  <CardTitle className="line-clamp-2 text-lg">
                    {article.title}
                  </CardTitle>
                  <CardDescription className="line-clamp-3">
                    {article.excerpt}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="text-sm text-muted-foreground">
                    {new Date(article.date).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition hover:bg-secondary disabled:opacity-40"
          >
            Previous
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`inline-flex size-9 items-center justify-center rounded-lg text-sm font-medium transition ${
                p === page
                  ? "bg-primary text-primary-foreground"
                  : "border hover:bg-secondary"
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium transition hover:bg-secondary disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
