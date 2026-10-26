import type { Article } from "@/data/articles";
import { getCustomSections } from "@/data/article-sections";
import { productFor } from "@/lib/catalog";
import {
  SITE_URL,
  SITE_NAME,
  SITE_DESCRIPTION,
  SOCIAL_PROFILES,
} from "@/lib/site";

/**
 * JSON-LD node builders.
 *
 * One module rather than an object literal per route, so the identity of the
 * site is asserted the same way everywhere and there is a single place to
 * change it. Pure data — no JSX; `<JsonLd>` does the rendering.
 *
 * The governing rule, inherited from the article page's original comment and
 * worth restating because every addition here is tempted to break it:
 * STRUCTURED DATA MUST NOT ASSERT ANYTHING THE PAGE DOES NOT. Markup that
 * disagrees with the rendered page is a manual-action risk, not a ranking
 * trick, and it is the specific failure mode affiliate sites get penalised for.
 */

export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

/**
 * The publisher entity. Emitted once, on the homepage.
 *
 * The logo is apple-icon.png (180×180, served from a stable route) rather than
 * public/logo.svg: Google's organization-logo guidance wants a raster above
 * 112×112, and an SVG is liable to be ignored.
 */
export function organizationNode() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    logo: {
      "@type": "ImageObject",
      url: `${SITE_URL}/apple-icon.png`,
      width: 180,
      height: 180,
    },
    // Only when there is something real to point at. See SOCIAL_PROFILES.
    ...(SOCIAL_PROFILES.length ? { sameAs: SOCIAL_PROFILES } : {}),
  };
}

/**
 * The site entity.
 *
 * NO `potentialAction` / SearchAction, for two independent reasons. There is no
 * /search route — the guide index filters in memory and never writes the query
 * to the URL — so there is no template a crawler could follow that resolves to
 * anything. And Google retired the sitelinks searchbox result in November 2024,
 * so even a real endpoint would earn no feature. It would be a false claim with
 * no upside.
 */
export function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE_URL,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    inLanguage: "en-US",
    publisher: { "@id": ORG_ID },
  };
}

/** Home → … trail. The last entry is the current page and carries no `item`. */
export function breadcrumbNode(trail: Array<{ name: string; path?: string }>) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: step.name,
      ...(step.path ? { item: `${SITE_URL}${step.path}`.replace(/\/$/, "") || SITE_URL } : {}),
    })),
  };
}

/**
 * FAQPage from the article's own "Questions People Ask" section.
 *
 * Built FROM the rendered body rather than from a parallel data file, so the
 * markup can never say something the page does not: every question is an
 * `### ` heading under that section and every answer is the prose beneath it,
 * with markdown stripped. Same rule as the Article node — structured data
 * that disagrees with the visible page is a manual-action risk.
 *
 * Google has shown FAQ rich results only for authoritative government and
 * health sites since 2023, so this is not for a SERP feature. It is for the
 * answer engines (ChatGPT, Perplexity, AI Overviews), which read explicit
 * question/answer pairs more reliably than they infer them from headings.
 *
 * Returns null for fewer than two questions: one Q&A is not an FAQ page.
 */
export function faqPageNode(markdown: string, pageUrl: string) {
  const section = markdown.match(
    /^## (?:Questions People Ask|Frequently Asked Questions|FAQs?)\s*$([\s\S]*?)(?=^## |(?![\s\S]))/im,
  )?.[1];
  if (!section) return null;
  const plain = (s: string) =>
    s
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\*\*|__/g, "")
      .replace(/(^|\s)\*(\S[^*]*?)\*/g, "$1$2")
      .replace(/\s+/g, " ")
      .trim();
  const qa = section
    .split(/^### /m)
    .slice(1)
    .map((chunk) => {
      const [q, ...rest] = chunk.split("\n");
      return { q: plain(q), a: plain(rest.join("\n")) };
    })
    .filter((x) => x.q && x.a);
  if (qa.length < 2) return null;
  return {
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    mainEntity: qa.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

/**
 * A listing page and the articles on it.
 *
 * `isPartOf` restates the WebSite inline instead of using a bare `@id`
 * reference: the WebSite node only exists in the homepage's document, and
 * Google does not resolve `@id` across documents. Same reason the article page
 * keeps its author and publisher as inline objects.
 *
 * `url` on each ListItem is right here — they point at real same-site detail
 * pages, which is exactly the summary-page pattern ItemList describes. That is
 * the opposite of the product case below; the distinction is whether the site
 * actually owns a page for the item.
 */
export function collectionPageNodes({
  path,
  name,
  description,
  articles,
}: {
  path: string;
  name: string;
  description: string;
  articles: Article[];
}) {
  const base = `${SITE_URL}${path}`;
  return [
    {
      "@type": "CollectionPage",
      "@id": `${base}#page`,
      url: base,
      name,
      description,
      isPartOf: {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        url: SITE_URL,
        name: SITE_NAME,
      },
      mainEntity: { "@id": `${base}#list` },
    },
    {
      "@type": "ItemList",
      "@id": `${base}#list`,
      numberOfItems: articles.length,
      // True: every listing on this site is sorted byNewest.
      itemListOrder: "https://schema.org/ItemListOrderDescending",
      itemListElement: articles.map((a, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}/blog/${a.slug}`,
        name: a.title,
      })),
    },
  ];
}

/**
 * The products a guide covers, as a plain ItemList.
 *
 * WHAT THIS IS FOR, so nobody expects a rich result: it will not produce one.
 * Nothing on these pages is eligible. It exists so a crawler or an answer
 * engine can read which products a guide actually covers, which is currently
 * only inferable from anchor text.
 *
 * NO `Product`, NO `offers`, NO PRICE — four independent reasons, any one
 * sufficient:
 *
 *  1. There is no compliant price source. The Associates agreement forbids
 *     presenting non-API prices as current, and per src/lib/catalog.ts the
 *     PA-API access this account had is gone.
 *  2. PRICE_MAX_AGE_MS means a price is legitimately ABSENT at render time —
 *     the visible grid falls back to "Check price". An offers.price on a page
 *     whose visible price says "Check price" is markup contradicting the page.
 *  3. CampRally is not the seller. `seller`, `availability` and `priceCurrency`
 *     would all be assertions about Amazon's inventory this site cannot verify.
 *  4. It would buy nothing: a Product without a valid offer, review or rating
 *     is ineligible for a product rich result. All risk, no feature.
 *
 * NO `url` ON THE ITEMS either. The only URL these products have is an
 * off-site, nofollow, affiliate-tagged Amazon link, and ListItem.url means "the
 * detail page for this item" — which this site does not have. The containing
 * Article already carries the URL that matters.
 *
 * `name` comes from the item's own label rather than the fuller catalog title,
 * because the label is what the page renders. Visible-text parity is the rule
 * everywhere else here and it holds here too.
 *
 * And do NOT reach for catalog `rating`/`ratingsTotal` to build an
 * aggregateRating. Those are AMAZON's ratings; publishing them under a node
 * CampRally emits presents them as CampRally's own aggregation. That is the
 * same mistake the no-review rule above exists to prevent.
 */
export function articleProductListNode(slug: string, listName?: string) {
  const items =
    getCustomSections(slug).find((s) => s.type === "product-grid")?.items ?? [];
  if (!items.length) return null;

  const itemListElement = items.map((item, i) => {
    const product = productFor(item.asin ?? item.link);
    const image = product?.image;
    return {
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      ...(image ? { image } : {}),
    };
  });

  return {
    "@type": "ItemList",
    "@id": `${SITE_URL}/blog/${slug}#products`,
    ...(listName ? { name: listName } : {}),
    numberOfItems: itemListElement.length,
    itemListOrder: "https://schema.org/ItemListUnordered",
    itemListElement,
  };
}
