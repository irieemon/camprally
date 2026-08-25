import Link from "next/link";
import Image from "next/image";
import type { Article } from "@/data/articles";
import { getHeroImage, getHeroAlt } from "@/data/heroes";
import { priceFromFor, pickCountFor } from "@/lib/article-pricing";

/**
 * The product-tile equivalent for a guide.
 *
 * A retail grid leads with a photograph and a price; the previous card led with
 * a date, which is the one fact a shopper never scans for. The photo already
 * existed as the article's hero — it was just never surfaced outside the
 * article route.
 */
export default function ArticleCard({
  article,
  priority = false,
  showDate = false,
}: {
  article: Article;
  priority?: boolean;
  /* Off by default, and that is the point: leading with a date is what this
   * card was redesigned to stop doing, because a shopper does not scan for one
   * and an old date on an evergreen buying guide reads as neglect. In a row
   * explicitly labelled "Latest" the same date is the whole message, so it is
   * opt-in per placement rather than a property of the card. */
  showDate?: boolean;
}) {
  const priceFrom = priceFromFor(article.slug);
  const picks = pickCountFor(article.slug);

  return (
    <Link
      href={`/blog/${article.slug}`}
      className="group flex h-full flex-col overflow-hidden border border-camp-stone bg-card transition-colors duration-200 hover:border-camp-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-camp-green"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-camp-bone-deep">
        <Image
          src={getHeroImage(article.slug)}
          alt={getHeroAlt(article.slug)}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          priority={priority}
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
        {picks > 0 && (
          <span className="absolute left-0 top-0 bg-camp-ink/85 px-2.5 py-1 text-eyebrow uppercase text-white backdrop-blur-sm">
            {picks} picks
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5">
        <span className="eyebrow text-camp-green">
          {article.category}
          {showDate && (
            <>
              {" · "}
              <time dateTime={article.date} className="text-muted-foreground">
                {new Date(`${article.date}T00:00:00Z`).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </time>
            </>
          )}
        </span>

        <h3 className="text-h3 text-balance text-foreground">
          {article.title}
        </h3>

        <p className="line-clamp-2 text-meta text-muted-foreground">
          {article.excerpt}
        </p>

        {/* Pushed to the bottom so the price sits on a consistent baseline
            across a row of cards with different title lengths. */}
        <div className="mt-auto flex items-baseline justify-between gap-3 pt-3">
          {priceFrom ? (
            <span className="text-[0.9375rem] font-semibold text-camp-ember">
              From {priceFrom}
            </span>
          ) : (
            <span className="text-meta text-muted-foreground">
              {article.readTime}
            </span>
          )}
          <span className="text-meta font-medium text-camp-green">
            Read guide
            <span
              aria-hidden="true"
              className="ml-1 inline-block transition-transform duration-200 group-hover:translate-x-1"
            >
              &rarr;
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}
