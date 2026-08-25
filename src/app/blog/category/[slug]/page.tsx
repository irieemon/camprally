import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { articlesInGroup, groupBySlug, populatedGroups } from "@/data/categories";
import BlogListing from "@/components/BlogListing";

/**
 * A category hub.
 *
 * The site had eight browse groups and no pages for them: filtering happened in
 * component state behind `/blog?category=…`, so a category was a rendering of
 * the index rather than a URL. Nothing could link to one, nothing could rank for
 * one, and none were in the sitemap. "budget camping cookware" and "camping
 * sleep systems" are ordinary mid-funnel queries the site had no page to answer.
 *
 * These are that page: one static URL per populated group, each with its own H1,
 * its own hand-written prose, its own canonical and its own ItemList.
 */

/* Only the groups that exist get a URL. Without this, /blog/category/<anything>
 * would be generated on demand and the site would have an unbounded crawlable
 * URL space where a typo returns 200. Note this option is unavailable if
 * `cacheComponents` is ever switched on in next.config.ts. */
export const dynamicParams = false;

export function generateStaticParams() {
  return populatedGroups().map((g) => ({ slug: g.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const group = groupBySlug(slug);
  if (!group) return { title: "Category Not Found" };

  // Brand suffix comes from the root layout's title template.
  const title = `${group.name} — Budget Camping Guides`;
  return {
    title,
    description: group.description,
    alternates: { canonical: `/blog/category/${group.slug}` },
    openGraph: {
      /* Restated in full — a child's `openGraph` replaces the root layout's
       * object rather than merging with it. */
      type: "website",
      siteName: "CampRally",
      locale: "en_US",
      url: `/blog/category/${group.slug}`,
      title,
      description: group.description,
    },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  /* groupBySlug, not matchesCategory: the lookup is deliberately case-sensitive
   * on the slug so /blog/category/Shelter 404s rather than becoming a second
   * URL serving identical content. matchesCategory stays permissive for the
   * article-level test, which is where that flexibility belongs. */
  const group = groupBySlug(slug);
  if (!group) notFound();

  return (
    <BlogListing
      title={group.name}
      intro={group.blurb}
      activeSlug={group.slug}
      path={`/blog/category/${group.slug}`}
      description={group.description}
      breadcrumb={[
        { name: "All Guides", path: "/blog" },
        { name: group.name },
      ]}
      articles={articlesInGroup(group.slug)}
    />
  );
}
