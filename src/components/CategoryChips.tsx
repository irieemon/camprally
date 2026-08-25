import Link from "next/link";
import { articles } from "@/data/articles";
import { populatedGroups, groupCounts } from "@/data/categories";

/**
 * The category rail.
 *
 * These were `<button onClick={setActiveCategory}>`. That is the whole reason
 * the site had eight browse categories and no category pages: the filter was
 * component state, so each category existed only as a rendering of /blog and
 * there was nothing for a crawler to follow or for a search engine to rank.
 * "budget camping cookware" is a real query with real intent and the site had
 * no page that could answer it.
 *
 * As <Link>s they are nine crawlable anchors in the static HTML of every
 * listing page, each pointing at an indexable hub. That is also what makes the
 * hubs discoverable without waiting on the sitemap.
 *
 * A Server Component on purpose — it holds no state, and keeping it off the
 * client boundary is what keeps ArticleCard (and the catalog it imports) on the
 * server. See the note in BlogGrid.
 */
export default function CategoryChips({
  activeSlug = null,
}: {
  /** Group slug of the hub being viewed, or null on the full index. */
  activeSlug?: string | null;
}) {
  const groups = populatedGroups();
  const counts = groupCounts();

  const base =
    "inline-flex h-9 items-center gap-1.5 border px-4 text-meta font-medium transition-colors";
  const on = "border-camp-green bg-camp-green text-white";
  const off =
    "border-camp-stone bg-background text-foreground hover:border-camp-green hover:text-camp-green";

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/blog"
        aria-current={activeSlug === null ? "page" : undefined}
        className={`${base} ${activeSlug === null ? on : off}`}
      >
        All {articles.length}
      </Link>
      {groups.map((g) => (
        <Link
          key={g.slug}
          href={`/blog/category/${g.slug}`}
          aria-current={activeSlug === g.slug ? "page" : undefined}
          className={`${base} ${activeSlug === g.slug ? on : off}`}
        >
          {g.name}
          <span className="opacity-60">{counts.get(g.slug)}</span>
        </Link>
      ))}
    </div>
  );
}
