"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { useSearchIndex } from "@/lib/useSearchIndex";
import { search as matchArticles, tokenizeQuery, highlightSegments } from "@/lib/search";
import type { SearchResult } from "@/lib/search";

/**
 * The interactive half of /search. Reads `?q=` once on mount for the
 * starting query, then owns its own input state — every keystroke updates
 * the results immediately and, after a short debounce, replaces the URL
 * (`router.replace`, never `push`) so the page stays bookmarkable without
 * turning every keystroke into a browser-history entry.
 *
 * `categoryChips` arrives pre-rendered from the Server Component parent
 * rather than being imported here. CategoryChips imports `articles` from
 * `@/data/articles` for the "All 58" count — importing it into a "use
 * client" file would compile it (and articles.ts) into THIS route's client
 * bundle, the exact bug BlogGrid's doc comment already warns about for
 * ArticleCard. Passing the rendered element down keeps it server-only.
 */
export default function SearchResults({ categoryChips }: { categoryChips: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQ);
  const inputRef = useRef<HTMLInputElement>(null);
  const { index, status } = useSearchIndex(true);

  // Sync the URL after the user pauses typing, not on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      const trimmed = query.trim();
      const next = trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search";
      router.replace(next, { scroll: false });
    }, 300);
    return () => clearTimeout(id);
  }, [query, router]);

  const terms = useMemo(() => tokenizeQuery(query), [query]);
  const results = useMemo<SearchResult[]>(
    () => (index ? matchArticles(index, query) : []),
    [index, query],
  );

  return (
    <div>
      <div className="relative mb-8 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          placeholder="Search guides…"
          aria-label="Search guides"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 w-full border border-camp-stone bg-background pl-10 pr-10 text-[0.9375rem] transition-colors focus:border-camp-green focus:outline-none focus:ring-2 focus:ring-camp-green/20"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {!query.trim() ? (
        <EmptyPrompt status={status} categoryChips={categoryChips} />
      ) : !index ? (
        <p className="text-meta text-muted-foreground">Loading search…</p>
      ) : results.length === 0 ? (
        <NoResults query={query.trim()} categoryChips={categoryChips} />
      ) : (
        <>
          <p className="mb-6 text-meta text-muted-foreground" aria-live="polite">
            {results.length} {results.length === 1 ? "guide" : "guides"} matching{" "}
            <span className="font-medium text-foreground">{query.trim()}</span>
          </p>
          <ul className="divide-y divide-camp-stone border-t border-camp-stone">
            {results.map((r) => (
              <li key={r.slug}>
                <Link
                  href={r.href}
                  className="group flex flex-col gap-1.5 py-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-camp-green"
                >
                  <span className="eyebrow text-camp-green">{r.category}</span>
                  <span className="text-h3 text-balance text-foreground group-hover:text-camp-green">
                    <Mark text={r.title} terms={terms} />
                  </span>
                  <span className="max-w-2xl text-[0.9375rem] leading-relaxed text-muted-foreground">
                    <Mark text={r.excerpt} terms={terms} />
                  </span>
                  {r.matchedHeading && (
                    <span className="text-meta text-camp-green/80">
                      Jump to &ldquo;{r.matchedHeading.t}&rdquo;
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Mark({ text, terms }: { text: string; terms: string[] }) {
  const segments = highlightSegments(text, terms);
  return (
    <>
      {segments.map((seg, i) =>
        seg.hit ? (
          <mark key={i} className="bg-camp-green/20 text-foreground">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

function EmptyPrompt({ status, categoryChips }: { status: string; categoryChips: React.ReactNode }) {
  return (
    <div>
      <p className="mb-6 text-meta text-muted-foreground">
        {status === "loading" ? "Loading search…" : "Start typing to search every guide, or browse a category."}
      </p>
      {categoryChips}
    </div>
  );
}

function NoResults({ query, categoryChips }: { query: string; categoryChips: React.ReactNode }) {
  return (
    <div className="border border-camp-stone bg-camp-bone px-6 py-16 text-center">
      <p className="text-[1.0625rem] font-medium text-foreground">
        No guides match &ldquo;{query}&rdquo;.
      </p>
      <p className="mt-2 text-meta text-muted-foreground">
        Try a different term, or browse a category below.
      </p>
      <div className="mt-6 flex justify-center">
        {categoryChips}
      </div>
    </div>
  );
}
