import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { remark } from "remark";
import html from "remark-html";
import { articles } from "@/data/articles";
import NewsletterForm from "@/components/NewsletterForm";
import { PrintableSidebarCard } from "@/components/Printables";
import { MerchSidebarCard, merchDesigns, stableIndex } from "@/components/Merch";
import { SITE_URL } from "@/lib/site";
/* Badge and the Card family used to build the hero label and the sidebar
 * panels. Both are now plain markup — an eyebrow and border-topped blocks —
 * so the shadcn wrappers are no longer imported here. */
import {
  ArrowLeft, ExternalLink, Star, ChevronRight, Mountain
} from "lucide-react";
import Image from "next/image";
import { getHeroImage } from "@/data/heroes";
import { getCustomSections } from "@/data/article-sections";
import {
  productFor,
  withLivePrice,
  newestAsOf,
  CHECK_PRICE,
} from "@/lib/catalog";

interface Props {
  params: Promise<{ slug: string }>;
}





// ─────────────────────────────────────────
// RENDERERS FOR CUSTOM SECTIONS
// ─────────────────────────────────────────


function StatsSection({ stats, liveTotal }: { stats: Array<{ value: string; label: string }>; liveTotal?: string | null }) {
  /* A "$…" stat is a sum of product prices frozen when the article was written
   * ("$192.93 Total Setup Cost"). Recompute it from live prices when every
   * component product is currently priced; otherwise drop the tile rather than
   * headline a total we cannot stand behind. */
  const shown = stats.flatMap((s) =>
    s.value.trim().startsWith("$")
      ? liveTotal ? [{ ...s, value: liveTotal }] : []
      : [s],
  );
  if (!shown.length) return null;
  return (
    <div className="mb-10 grid grid-cols-2 gap-px border border-camp-stone bg-camp-stone sm:grid-cols-4">
      {shown.map((stat, i) => (
        <div key={i} className="bg-camp-bone p-5">
          {/* Money reads in ember, everything else in ink — the same split the
              rest of the site uses so a price is always the same colour. */}
          <p
            className={`font-display text-2xl font-bold tracking-tight ${
              stat.value.trim().startsWith("$") ? "text-camp-ember" : "text-camp-green"
            }`}
          >
            {stat.value}
          </p>
          <p className="eyebrow mt-2 text-muted-foreground">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}


/**
 * Product thumbnail with a branded empty state.
 *
 * 46 of the 73 catalogued products have no photograph — src/data/product-images.json
 * is hand-maintained and only covers 30 ASINs. The old fallback dropped a small
 * emoji into a white box, which reads as a broken image. A CampRally mark on
 * bone reads as "no photo yet", which is what it is.
 */
function ProductThumb({
  src,
  alt,
  className = "",
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  return (
    <div className={`product-tile ${className}`}>
      {src ? (
        <img
          src={src}
          alt={alt}
          className="size-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="flex size-full items-center justify-center bg-camp-bone">
          <Mountain
            className="size-2/5 text-camp-green/30"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}

function ProductGrid({ title, subtitle, items }: { title?: string; subtitle?: string; items?: Array<{ label: string; category?: string; icon?: string; link?: string; asin?: string }> }) {
  if (!items?.length) return null;
  const asOf = newestAsOf(items.map((i) => i.asin ?? i.link));
  return (
    <div className="mb-12">
      {title && <h2 className="mb-2 text-h3 text-foreground">{title}</h2>}
      {subtitle && <p className="mb-5 text-meta text-muted-foreground">{subtitle}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item, i) => {
          const product = productFor(item.asin ?? item.link);
          const productImage = product?.image ?? null;
          const live = withLivePrice(product);
          return (
          <a
            key={i}
            href={product?.url ?? item.link ?? "https://www.amazon.com/shop/camprally?tag=camprally-20"}
            target="_blank"
            rel="nofollow noopener"
            className="group flex items-stretch gap-4 border border-camp-stone bg-card p-4 transition-colors hover:border-camp-green"
          >
            <ProductThumb
              src={productImage}
              alt={item.label}
              className="size-20 shrink-0"
            />
            <div className="flex min-w-0 flex-1 flex-col">
              {item.category && (
                <p className="eyebrow mb-1 text-camp-green">{item.category}</p>
              )}
              <p className="text-[0.9375rem] font-medium leading-snug text-foreground">
                {item.label}
              </p>
              <div className="mt-auto flex items-baseline gap-2 pt-2">
                <span
                  className={`font-display text-lg font-bold tracking-tight ${
                    live ? "text-camp-ember" : "text-muted-foreground"
                  }`}
                >
                  {live?.price ?? CHECK_PRICE}
                </span>
                {live?.rating && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="size-3 fill-camp-ember text-camp-ember" />
                    {live.rating}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="size-4 shrink-0 self-center text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-camp-green" />
          </a>
        );})}
      </div>
      <PriceDisclaimer asOf={asOf} />
    </div>
  );
}

/*
 * Prices and star ratings across this site are hardcoded strings written when
 * each article was published, not live data. They go stale immediately, and
 * Amazon's Associates Operating Agreement restricts presenting prices that
 * did not come from their product API as if they were current.
 *
 * The durable fix is to stop displaying specific figures, or to source them
 * from Amazon's API — which requires 3 qualifying sales the account does not
 * yet have. Until then this states plainly that the numbers are indicative,
 * which is both honest to the reader and materially lower risk than implying
 * they are live. Rendered once per grid rather than edited into ~180 places.
 */
function PriceDisclaimer({ asOf }: { asOf?: string | null }) {
  // Two different claims, and it matters which one we make. With a refresh
  // timestamp we can say when the figures were checked; without one they are
  // whatever the article said when it was written, which may be months old.
  if (asOf) {
    const when = new Date(asOf).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
    });
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        Prices and ratings last checked {when} and can change at any time.
        Confirm the current price on Amazon before buying.
      </p>
    );
  }
  return (
    <p className="mt-3 text-xs text-muted-foreground">
      Prices and ratings are indicative and were accurate when this guide was
      written. Amazon pricing changes frequently — check the current price on
      Amazon before buying.
    </p>
  );
}

function SpotlightSection({ item }: { item: { name: string; asin?: string; why: string; category: string } }) {
  const product = productFor(item.asin);
  const productImage = product?.image ?? null;
  const live = withLivePrice(product);
  return (
    <div className="mb-12 border border-camp-stone bg-card">
      <div className="flex items-center justify-between bg-camp-green px-5 py-2.5">
        <span className="eyebrow text-white">Our top pick</span>
        <span className="eyebrow text-white/70">{item.category}</span>
      </div>
      <div className="grid gap-6 p-6 sm:grid-cols-[minmax(0,11rem)_1fr] sm:p-7">
        <ProductThumb
          src={productImage}
          alt={item.name}
          className="aspect-square w-full"
        />
        <div className="flex min-w-0 flex-col">
          <h3 className="text-h3 text-balance text-foreground">{item.name}</h3>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span
              className={`font-display text-[2rem] font-bold leading-none tracking-tight ${
                live ? "text-camp-ember" : "text-muted-foreground"
              }`}
            >
              {live?.price ?? CHECK_PRICE}
            </span>
            {live?.rating && (
              <span className="flex items-center gap-1.5 text-meta text-muted-foreground">
                <Star className="size-4 fill-camp-ember text-camp-ember" />
                {live.rating} out of 5
                {live.ratingsTotal
                  ? ` · ${live.ratingsTotal.toLocaleString("en-US")} ratings`
                  : ""}
              </span>
            )}
          </div>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-muted-foreground">
            {item.why}
          </p>
          <div className="mt-6">
            <a
              href={product?.url ?? "https://www.amazon.com/shop/camprally?tag=camprally-20"}
              target="_blank"
              rel="nofollow noopener"
              className="inline-flex h-12 items-center gap-2 bg-camp-ember px-7 font-semibold text-white transition-colors hover:bg-camp-ember-deep"
            >
              View on Amazon
              <ExternalLink className="size-4" />
            </a>
          </div>
          <PriceDisclaimer asOf={live?.priceAsOf} />
        </div>
      </div>
    </div>
  );
}

function CalloutSection({ calloutType, calloutTitle, calloutBody }: { calloutType?: string; calloutTitle?: string; calloutBody?: string }) {
  /* A left rule in the callout's own colour rather than a tinted panel. Four
   * pastel-filled boxes stacked through an article read as decoration; a rule
   * carries the same signal at a fraction of the visual weight. */
  const styles: Record<string, { rule: string; label: string; text: string }> = {
    save:    { rule: "border-camp-green",  text: "text-camp-green",  label: "Save" },
    splurge: { rule: "border-camp-ember",  text: "text-camp-ember",  label: "Worth the splurge" },
    tip:     { rule: "border-camp-brown",  text: "text-camp-brown",  label: "Pro tip" },
    warning: { rule: "border-destructive", text: "text-destructive", label: "Watch out" },
  };
  const style = styles[calloutType || "tip"] || styles.tip;
  return (
    <div className={`mb-8 border-l-2 ${style.rule} bg-camp-bone py-5 pl-5 pr-6`}>
      <p className={`eyebrow mb-2 ${style.text}`}>{calloutTitle || style.label}</p>
      <p className="text-[0.9375rem] leading-relaxed text-foreground">{calloutBody}</p>
    </div>
  );
}

function ChecklistSection({ title, checkItems }: { title?: string; checkItems?: string[] }) {
  if (!checkItems?.length) return null;
  return (
    <div className="mb-12">
      {title && <h2 className="mb-4 text-h3 text-foreground">{title}</h2>}
      <div className="grid gap-px border border-camp-stone bg-camp-stone sm:grid-cols-2">
        {checkItems.map((item, i) => (
          <label
            key={i}
            className="flex cursor-pointer items-center gap-3 bg-card p-4 transition-colors hover:bg-camp-bone"
          >
            <input
              type="checkbox"
              className="size-4 accent-[var(--camp-green)] focus:ring-camp-green"
            />
            <span className="text-[0.9375rem] text-foreground">{item}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function TipsSection({ title, tips }: { title?: string; tips?: Array<{ title: string; body: string }> }) {
  if (!tips?.length) return null;
  return (
    <div className="mb-12">
      {title && <h2 className="mb-5 text-h3 text-foreground">{title}</h2>}
      <ol className="grid gap-6 sm:grid-cols-2">
        {tips.map((tip, i) => (
          <li key={i} className="border-t-2 border-camp-green pt-4">
            <p className="eyebrow mb-2 text-camp-green">
              {String(i + 1).padStart(2, "0")}
            </p>
            <p className="mb-1.5 text-[1.0625rem] font-semibold leading-snug text-foreground">
              {tip.title}
            </p>
            <p className="text-meta leading-relaxed text-muted-foreground">{tip.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TableSection({ title, rows }: { title?: string; rows?: string[][] }) {
  if (!rows?.length) return null;
  return (
    <div className="mb-12">
      {title && <h2 className="mb-4 text-h3 text-foreground">{title}</h2>}
      <div className="overflow-x-auto border border-camp-stone">
        <table className="w-full text-[0.9375rem]">
          <thead>
            <tr className="bg-camp-green text-white">
              {rows[0].map((cell, j) => (
                <th
                  key={j}
                  scope="col"
                  className={`px-4 py-3 font-semibold ${j > 0 ? "text-right" : "text-left"}`}
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((row, i) => (
              // Zebra striping rather than a hairline per row: the rules were
              // competing with the product grids directly above these tables.
              <tr key={i} className={i % 2 ? "bg-camp-bone" : "bg-card"}>
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`px-4 py-3 ${j === 0 ? "font-medium text-foreground" : "text-right text-muted-foreground"}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// MARKDOWN PROCESSOR
// ─────────────────────────────────────────
async function processMarkdown(content: string): Promise<string> {
  const trimmed = content.trim();
  const processed = await remark()
    .use(html)
    .process(trimmed);
  let htmlContent = processed.toString();

  // The hero banner already renders the title — a body-leading H1 duplicated
  // it as the first line of every generated article.
  htmlContent = htmlContent.replace(/^\s*<h1>[\s\S]*?<\/h1>\s*/, "");

  // A paragraph whose sole content is a (possibly bold) Amazon affiliate link
  // is a buy CTA — the revenue mechanism of the whole page. As plain anchors
  // they were visually indistinguishable from body text; render them as
  // buttons instead. Inline links elsewhere in a paragraph are left alone.
  htmlContent = htmlContent.replace(
    /<p>(?:<strong>)?<a href="(https:\/\/www\.amazon\.com\/[^"]*?tag=camprally-20[^"]*?)">([\s\S]*?)<\/a>(?:<\/strong>)?<\/p>/g,
    (_m, href, label) =>
      `<p class="not-prose my-6"><a href="${href}" target="_blank" rel="nofollow noopener sponsored" ` +
      `class="inline-flex h-11 items-center gap-2 bg-camp-ember px-6 text-[0.9375rem] font-semibold text-white no-underline transition-colors hover:bg-camp-ember-deep">` +
      `${label}<span aria-hidden="true">&nbsp;→</span></a></p>`,
  );

  // The generated pick headings embed the affiliate link in the heading itself
  // ("### 2. Check the NAME on Amazon"). A link styled as heading text is not
  // a visible CTA, and "Check the … on Amazon" is a clumsy heading. Split it:
  // the heading keeps a clean product name, and an explicit button follows.
  htmlContent = htmlContent.replace(
    // before/after segments are [^<]* on purpose: anything more permissive can
    // lazily cross </h2> boundaries and swallow entire sections into one match.
    /<h([23])([^>]*)>([^<]*)<a href="(https:\/\/www\.amazon\.com\/[^"]*?tag=camprally-20[^"]*?)">([\s\S]*?)<\/a>([^<]*)<\/h\1>/g,
    (_m, lvl, attrs, before, href, label, after) => {
      const name = label
        .replace(/<[^>]+>/g, "")
        .replace(/^check\s+(?:the|out)?\s*/i, "")
        .replace(/[\s,.]*on amazon[\s.]*$/i, "")
        .trim();
      return (
        `<h${lvl}${attrs}>${before}${name}${after}</h${lvl}>` +
        `<p class="not-prose my-4"><a href="${href}" target="_blank" rel="nofollow noopener sponsored" ` +
        `class="inline-flex h-11 items-center gap-2 bg-camp-ember px-6 text-[0.9375rem] font-semibold text-white no-underline transition-colors hover:bg-camp-ember-deep">` +
        `Check price on Amazon<span aria-hidden="true">&nbsp;→</span></a></p>`
      );
    },
  );

  // Add anchor IDs to h2 headings
  const headingMatches = htmlContent.matchAll(/<h2([^>]*)>(.*?)<\/h2>/g) || [];
  const toc: { text: string; id: string }[] = [];
  for (const match of headingMatches) {
    const fullMatch = match[0];
    const text = match[1]; // This is actually the inner content in remark-html output
    // The format from remark-html is <h2>text</h2>, group 1 is empty, group 2 is content
    const id = text
      .toLowerCase()
      .replace(/<[^>]+>/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    toc.push({ text: text.replace(/<[^>]+>/g, ""), id });
    if (!fullMatch.includes(`id="${id}"`)) {
      htmlContent = htmlContent.replace(
        fullMatch,
        fullMatch.replace("<h2", `<h2 id="${id}"`)
      );
    }
  }

  return htmlContent;
}

// ─────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────
export async function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = articles.find((a) => a.slug === slug);
  if (!article) return { title: "Article Not Found" };
  const path = `/blog/${article.slug}`;
  const hero = getHeroImage(article.slug);
  return {
    title: `${article.title} | CampRally`,
    description: article.excerpt,
    /* Relative, resolved against metadataBase. It was absolute and pointed at
     * the bare apex, which 307s to www — every article was telling Google its
     * real address was a redirect back to itself. */
    alternates: { canonical: path },
    openGraph: {
      /* Restated in full, not merged: setting openGraph at all replaces the
       * layout's object outright. */
      type: "article",
      siteName: "CampRally",
      locale: "en_US",
      url: path,
      title: article.title,
      description: article.excerpt,
      publishedTime: article.date,
      /* Every slug resolves to a hero — a local render for the four the
       * pipeline has generated, an Unsplash URL otherwise, with a `default`
       * catching anything unmapped. No dimensions declared: the Unsplash URLs
       * pin width only, so any height here would be a guess, and platforms
       * measure the image they fetch anyway. */
      images: [{ url: hero, alt: article.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.excerpt,
      images: [hero],
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = articles.find((a) => a.slug === slug);
  if (!article) notFound();

  const related = articles
    .filter((a) => a.slug !== slug && a.category === article.category)
    .slice(0, 3);

  const contentHtml = await processMarkdown(article.content);
  const customSections = getCustomSections(slug);
  const heroImage = getHeroImage(slug);

  /* Live replacement for a headline "total cost" stat. Asserted only when every
   * product in the article's grid has a current price — a total built from a
   * mix of live and months-old figures is not a total of anything. */
  const liveTotal = (() => {
    const items = customSections.find((s) => s.type === "product-grid")?.items ?? [];
    if (!items.length) return null;
    const prices = items.map((i) => withLivePrice(productFor(i.asin ?? i.link)));
    if (prices.some((p) => !p)) return null;
    const sum = prices.reduce((n, p) => n + (p!.priceValue ?? 0), 0);
    return Number.isFinite(sum) && sum > 0 ? `$${sum.toFixed(2)}` : null;
  })();

  /* Article + breadcrumb structured data.
   *
   * Inlined rather than emitted through the Metadata API, which has no field
   * for JSON-LD. Everything asserted here is something the page also states in
   * visible text — headline, author, dates, image, section — because structured
   * data that disagrees with the rendered page is a manual-action risk, not a
   * ranking trick. No `aggregateRating` or `review`: this site publishes buying
   * guides, not first-party product reviews, and marking them up as reviews
   * without a real rating is exactly the misuse Google penalises.
   *
   * dateModified is the article's own date, not build time: stamping "modified
   * today" on every rebuild would claim freshness the content does not have. */
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${SITE_URL}/blog/${article.slug}#article`,
        headline: article.title,
        description: article.excerpt,
        image: heroImage.startsWith("http") ? heroImage : `${SITE_URL}${heroImage}`,
        datePublished: article.date,
        dateModified: article.date,
        articleSection: article.category,
        author: { "@type": "Organization", name: article.author, url: SITE_URL },
        publisher: { "@type": "Organization", name: "CampRally", url: SITE_URL },
        mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/blog/${article.slug}` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "All Guides", item: `${SITE_URL}/blog` },
          { "@type": "ListItem", position: 3, name: article.title },
        ],
      },
    ],
  };

  return (
    <div>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Hero. Full-bleed rather than an inset rounded panel — the edge-to-edge
          photograph is most of what separates a store from a blog. */}
      <div className="relative isolate flex min-h-[clamp(22rem,48vh,32rem)] items-end overflow-hidden">
        <Image
          src={heroImage}
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-camp-ink via-camp-ink/60 to-camp-ink/15" />
        <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-24">
          <Link
            href="/blog"
            className="mb-5 inline-flex items-center gap-1.5 text-meta text-white/75 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-4" />
            All guides
          </Link>
          <p className="eyebrow mb-3 text-white/75">{article.category}</p>
          <h1 className="max-w-4xl text-h1 text-balance text-white">
            {article.title}
          </h1>
          <p className="mt-4 text-meta text-white/70">
            {new Date(article.date).toLocaleDateString("en-US", {
              month: "long", day: "numeric", year: "numeric",
            })}
            {" · "}
            {article.readTime}
          </p>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-12 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* Main Content */}
        <article className="min-w-0">
          {/* Standfirst. The drop cap is gone — it belongs to long-form
              editorial, and it fought the product cards that follow it. */}
          <p className="mb-10 border-l-2 border-camp-green pl-5 text-[1.1875rem] leading-relaxed text-foreground">
            {article.excerpt}
          </p>

          {/* Custom sections */}
          {customSections.map((section, i) => {
            switch (section.type) {
              case "stats":
                return section.stats ? <StatsSection key={i} stats={section.stats} liveTotal={liveTotal} /> : null;
              case "product-grid":
                return <ProductGrid key={i} title={section.title} subtitle={section.subtitle} items={section.items} />;
              case "spotlight":
                return section.spotlightItem ? <SpotlightSection key={i} item={section.spotlightItem} /> : null;
              case "callout":
                return <CalloutSection key={i} calloutType={section.calloutType} calloutTitle={section.calloutTitle} calloutBody={section.calloutBody} />;
              case "checklist":
                return <ChecklistSection key={i} title={section.title} checkItems={section.checkItems} />;
              case "tips":
                return section.tips ? <TipsSection key={i} title={section.title} tips={section.tips} /> : null;
              case "table":
                return section.rows ? <TableSection key={i} title={section.title} rows={section.rows} /> : null;
              default:
                return null;
            }
          })}

          {/* Rendered article body */}
          <div
            /* 17px body on a ~68ch measure. REI puts the comfortable range at
               50–60 characters and discourages anything past 80; the previous
               `max-w-none` let lines run the full column width. */
            className="prose prose-stone max-w-[68ch] prose-headings:font-display prose-headings:tracking-tight prose-h2:mt-12 prose-h2:mb-4 prose-h2:text-h2 prose-h3:mt-8 prose-h3:mb-3 prose-h3:text-h3 prose-p:text-[1.0625rem] prose-p:leading-[1.7] prose-a:text-camp-green prose-a:font-medium prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground prose-li:text-[1.0625rem] prose-li:leading-[1.7] prose-li:mb-1.5 prose-ul:my-4 prose-ol:my-4 prose-blockquote:border-camp-green prose-blockquote:not-italic"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />

          {/* Bottom CTA */}
          <div className="mt-14 border border-camp-stone bg-camp-bone p-8">
            <h3 className="text-h3 text-foreground">Shop the gear we recommend</h3>
            <p className="mt-2 max-w-prose text-meta leading-relaxed text-muted-foreground">
              We test every piece of gear we recommend. As an Amazon Associate,
              we earn from qualifying purchases — at no extra cost to you.
            </p>
            <a
              href="https://www.amazon.com?tag=camprally-20"
              target="_blank"
              rel="nofollow noopener"
              className="mt-5 inline-flex h-12 items-center gap-2 bg-camp-ember px-7 font-semibold text-white transition-colors hover:bg-camp-ember-deep"
            >
              Shop on Amazon
              <ExternalLink className="size-4" />
            </a>
          </div>
        </article>

        {/* Sidebar. Sticky so the newsletter and related links stay reachable
            through a 3,000-word guide instead of scrolling away in the first
            screen. */}
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="space-y-8">
            <div className="border-t-2 border-camp-green pt-5">
              <p className="eyebrow mb-4 text-foreground">Guide details</p>
              <dl className="space-y-2.5 text-meta">
                {[
                  ["Category", article.category],
                  ["Read time", article.readTime],
                  ["Author", article.author],
                  [
                    "Published",
                    new Date(article.date).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    }),
                  ],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right font-medium text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {related.length > 0 && (
              <div className="border-t-2 border-camp-green pt-5">
                <p className="eyebrow mb-4 text-foreground">Related guides</p>
                <ul className="space-y-3">
                  {related.map((r) => (
                    <li key={r.slug}>
                      <Link
                        href={`/blog/${r.slug}`}
                        className="text-meta font-medium leading-snug text-foreground transition-colors hover:text-camp-green"
                      >
                        {r.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Own-product slot, above the newsletter: a reader deep in a gear
                guide is closer to buying than to subscribing.

                Two rails share the one slot instead of taking one each. Three
                stacked asks — printable, shirt, newsletter — is how a sidebar
                stops being read at all, and the split is by slug so a given
                article shows the same thing on every build. */}
            {merchDesigns.length > 0 && stableIndex(slug, 2) === 1 ? (
              <MerchSidebarCard slug={slug} />
            ) : (
              <PrintableSidebarCard />
            )}

            <div className="border border-camp-stone bg-camp-bone p-5">
              <p className="eyebrow mb-3 text-camp-green">The dispatch</p>
              <p className="mb-4 text-meta leading-relaxed text-muted-foreground">
                Weekly budget gear picks, straight to your inbox.
              </p>
              <NewsletterForm tone="light" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
