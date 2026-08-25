import type { Article } from "@/data/articles";
import ArticleCard from "@/components/ArticleCard";
import BlogGrid from "@/components/BlogGrid";
import CategoryChips from "@/components/CategoryChips";

/**
 * The shared shell for /blog and every /blog/category/<slug> hub.
 *
 * Shared rather than duplicated so the two cannot drift: a hub that renders its
 * grid differently from the index is a second layout to maintain and a second
 * place for the crawlability regression to come back.
 *
 * Server Component. The only client boundary in the tree is BlogGrid's search
 * box, and the cards are rendered here — on the server — and handed down as
 * elements. See the long note in BlogGrid for why that distinction matters.
 */
export default function BlogListing({
  title,
  intro,
  articles,
  activeSlug = null,
}: {
  title: string;
  intro: string;
  /** Already sorted by the caller — usually `byNewest`. */
  articles: Article[];
  activeSlug?: string | null;
}) {
  return (
    <div>
      {/* Page header on a bone band, the way a retail listing page separates
          "where am I" from "what's for sale". */}
      <div className="border-b border-camp-stone bg-camp-bone">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
          <p className="eyebrow mb-3 text-camp-green">Gear guides</p>
          <h1 className="max-w-2xl text-h1 text-balance text-foreground">
            {title}
          </h1>
          <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-muted-foreground">
            {intro}
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="mb-8">
          <CategoryChips activeSlug={activeSlug} />
        </div>

        <BlogGrid
          items={articles.map((article, i) => ({
            slug: article.slug,
            title: article.title,
            excerpt: article.excerpt,
            /* `priority` on the first three marks the LCP candidates of the
               unfiltered order. After a search the first visible card may not
               be among them, which is fine: search starts empty, so first paint
               — the only paint LCP measures — always sees these three. */
            node: <ArticleCard article={article} priority={i < 3} />,
          }))}
        />
      </div>
    </div>
  );
}
