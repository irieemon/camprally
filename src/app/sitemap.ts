import { MetadataRoute } from "next";
import { articles } from "@/data/articles";
import { articlesInGroup, populatedGroups } from "@/data/categories";
import { SITE_URL } from "@/lib/site";

/* Must match the host that actually serves, or every entry here is a redirect
 * for the crawler to follow. See src/lib/site.ts. */
const BASE_URL = SITE_URL;

/* LASTMOD MUST NOT BE BUILD TIME.
 *
 * Every entry here used to be `new Date()`. This site rebuilds up to three
 * times a day — publish cycles, price refreshes, catalog and merch syncs — so
 * the sitemap told Google that all 35 URLs, including a privacy policy
 * untouched since April, had changed within the hour, every time. Google uses
 * lastmod only while it stays consistent with what actually changed and ignores
 * it outright once a site is shown to be unreliable, so the effect was to spend
 * the signal and get nothing: no help for genuinely new articles, and crawl
 * budget spent rechecking thirty unchanged pages.
 *
 * Articles now carry their own publication date. That under-reports the case
 * where a price refresh changes rendered figures inside an old article, which
 * is the right way to be wrong — those edits are not what Google is being asked
 * to recrawl for, and an honest date is worth more than a precise one.
 *
 * The pages with no meaningful modification date simply omit lastmod, which is
 * optional. Inventing one for them is the same lie in a smaller font.
 */
const newest = (() => {
  const dates = articles.map((a) => new Date(a.date).getTime()).filter(Number.isFinite);
  return dates.length ? new Date(Math.max(...dates)) : undefined;
})();

export default function sitemap(): MetadataRoute.Sitemap {
  const articlePages = articles.map((article) => ({
    url: `${BASE_URL}/blog/${article.slug}`,
    lastModified: new Date(article.date),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  /* Category hubs.
   *
   * `articlesInGroup` sorts newest-first, so element 0 is the group's most
   * recent article and its date is honestly when that hub last changed — the
   * same doctrine as the lastmod note above, applied per group rather than
   * sitewide. A hub whose category has had nothing new for months should say so.
   *
   * Only populated groups, which is also exactly what generateStaticParams
   * builds, so the sitemap cannot advertise a URL the build did not produce.
   *
   * The `?category=` form is deliberately absent and must stay absent: it is a
   * query-parameter duplicate of these pages. */
  const categoryPages = populatedGroups().map((group) => {
    const inGroup = articlesInGroup(group.slug);
    return {
      url: `${BASE_URL}/blog/category/${group.slug}`,
      lastModified: inGroup.length ? new Date(inGroup[0].date) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    };
  });

  return [
    {
      // Home and the index both list the latest guides, so the newest article's
      // date is genuinely when each last changed.
      url: BASE_URL,
      lastModified: newest,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: newest,
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...categoryPages,
    { url: `${BASE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    ...articlePages,
  ];
}
