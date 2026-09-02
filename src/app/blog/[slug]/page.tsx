import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { remark } from "remark";
import html from "remark-html";
import { articles, lastChanged } from "@/data/articles";
import NewsletterForm from "@/components/NewsletterForm";
import { PrintableSidebarCard } from "@/components/Printables";
import { MerchSidebarCard, merchDesigns, stableIndex } from "@/components/Merch";
import { SITE_URL } from "@/lib/site";
import JsonLd from "@/components/JsonLd";
import { articleProductListNode, breadcrumbNode } from "@/lib/structured-data";
/* Badge and the Card family used to build the hero label and the sidebar
 * panels. Both are now plain markup — an eyebrow and border-topped blocks —
 * so the shadcn wrappers are no longer imported here. */
import {
  ArrowLeft, ExternalLink, Star, ChevronRight, Mountain
} from "lucide-react";
import Image from "next/image";
import { getHeroImage, getHeroAlt } from "@/data/heroes";
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
            rel="nofollow noopener sponsored"
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
              rel="nofollow noopener sponsored"
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
// PRODUCT IMAGES IN THE BODY
// ─────────────────────────────────────────
/* Product photos inside the article body.
 *
 * Until now a product's photo appeared only in the "Quick Comparison" grid at
 * the top of the page — the body section that actually discusses the product
 * (its own h3, a few paragraphs, the buy CTA) showed no image at all. This
 * pass finds the same affiliate links the CTA passes below act on and drops
 * the catalog photo in beside the prose that discusses that product, once,
 * at the heading (or paragraph) where the product is first mentioned.
 *
 * Runs BEFORE the CTA passes, on the untouched markdown-to-HTML output, so it
 * sees headings and paragraphs in their original shape — including the "link
 * embedded in the heading" and "bare URL in the heading" shapes those passes
 * go on to rewrite. The tile it inserts sits outside any <h2>/<h3>/<p> tag (a
 * standalone `not-prose` <a>…</a>), so none of the passes below — which all
 * key on tag boundaries — see it or mistake it for a second CTA.
 *
 * Placement rule:
 *  - One heading, one product (the common shape: "### Klein Tools 55600 Work
 *    Cooler" followed by prose and a trailing CTA link) → the tile goes right
 *    after that heading, which IS the section for that product.
 *  - One heading, several products (older articles that link products from
 *    paragraphs under a single h2, no h3 per product) → the heading isn't
 *    "its own" for any one of them, so each product's tile goes immediately
 *    before the paragraph that first links it.
 *  - No enclosing heading, or the link never appears inside a <p> (only ever
 *    in heading text) → falls back to the nearest anchor point that does
 *    exist, rather than dropping the image.
 *
 * Deduped by ASIN across the whole body — a product mentioned twice only
 * gets its photo once, at the first mention. Products with no catalog entry
 * or no catalog photo are skipped outright — never an empty tile.
 */
const AMZN_URL_IN_TEXT = /https:\/\/www\.amazon\.com\/[^\s"<]*?tag=camprally-20[^\s"<]*/g;

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function productImageTile(image: string, url: string, title: string): string {
  // Floats beside the prose on wider screens (~10rem, left margin); on mobile
  // it just stacks in reading order, centered and capped at the same width
  // rather than stretching edge to edge.
  return (
    `<a href="${escapeAttr(url)}" target="_blank" rel="nofollow noopener sponsored" ` +
    `class="not-prose mx-auto mb-4 block w-full max-w-[10rem] sm:float-right sm:ml-6 sm:mb-2 sm:mt-1 sm:w-[10rem] sm:max-w-none">` +
    `<div class="product-tile aspect-square w-full">` +
    `<img src="${escapeAttr(image)}" alt="${escapeAttr(title)}" class="size-full object-contain p-2" loading="lazy" /></div></a>`
  );
}

function insertProductImages(htmlContent: string): string {
  type Hit = { asin: string; image: string; url: string; title: string; index: number };

  const hitsIn = (start: number, end: number): Hit[] => {
    const text = htmlContent.slice(start, end);
    const out: Hit[] = [];
    for (const m of text.matchAll(AMZN_URL_IN_TEXT)) {
      const product = productFor(m[0]);
      if (!product?.image) continue;
      out.push({
        asin: product.asin,
        image: product.image,
        url: product.url,
        title: product.title,
        index: start + (m.index ?? 0),
      });
    }
    return out;
  };

  // Every top-level paragraph range, so a "before the paragraph" placement
  // can find the specific <p> that contains a given hit. Same negative-
  // lookahead shape as the CTA passes below, for the same reason: a lazy
  // `[\s\S]*?` prefix would cross `</p>` boundaries and swallow whole
  // sections.
  const paragraphs = [...htmlContent.matchAll(/<p>(?:(?!<\/p>)[\s\S])*<\/p>/g)].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
  const paragraphContaining = (index: number) =>
    paragraphs.find((p) => index >= p.start && index < p.end);

  const headings = [...htmlContent.matchAll(/<h[23][^>]*>[\s\S]*?<\/h[23]>/g)].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));

  // Sections run from one h2/h3 to the next (of either level) or EOF, plus a
  // headless prefix section for any content before the first heading.
  type Section = { headingEnd: number | null; start: number; end: number };
  const sections: Section[] = [];
  if (!headings.length || headings[0].start > 0) {
    sections.push({
      headingEnd: null,
      start: 0,
      end: headings.length ? headings[0].start : htmlContent.length,
    });
  }
  headings.forEach((h, i) => {
    sections.push({
      headingEnd: h.end,
      start: h.start,
      end: i + 1 < headings.length ? headings[i + 1].start : htmlContent.length,
    });
  });

  const used = new Set<string>();
  const insertions: { at: number; markup: string }[] = [];

  for (const section of sections) {
    const hits = hitsIn(section.start, section.end);
    const distinct: Hit[] = [];
    const seenHere = new Set<string>();
    for (const hit of hits) {
      if (seenHere.has(hit.asin)) continue;
      seenHere.add(hit.asin);
      distinct.push(hit);
    }
    if (!distinct.length) continue;

    for (const hit of distinct) {
      if (used.has(hit.asin)) continue;
      used.add(hit.asin);
      const markup = productImageTile(hit.image, hit.url, hit.title);

      // A heading with exactly one product IS that product's section.
      if (section.headingEnd !== null && distinct.length === 1) {
        insertions.push({ at: section.headingEnd, markup });
        continue;
      }
      // Several products under one heading (or no heading at all): anchor to
      // the paragraph that actually names this product.
      const para = paragraphContaining(hit.index);
      if (para) {
        insertions.push({ at: para.start, markup });
      } else if (section.headingEnd !== null) {
        insertions.push({ at: section.headingEnd, markup });
      } else {
        insertions.push({ at: section.start, markup });
      }
    }
  }

  // Apply back-to-front so an earlier insertion's length never shifts a
  // later insertion's recorded offset.
  insertions.sort((a, b) => b.at - a.at);
  let out = htmlContent;
  for (const { at, markup } of insertions) {
    out = out.slice(0, at) + markup + out.slice(at);
  }
  return out;
}

// ─────────────────────────────────────────
// MARKDOWN PROCESSOR
// ─────────────────────────────────────────
async function processMarkdown(
  content: string,
): Promise<{ html: string; toc: { text: string; id: string }[] }> {
  const trimmed = content.trim();
  const processed = await remark()
    .use(html)
    .process(trimmed);
  let htmlContent = processed.toString();

  // The hero banner already renders the title — a body-leading H1 duplicated
  // it as the first line of every generated article.
  htmlContent = htmlContent.replace(/^\s*<h1>[\s\S]*?<\/h1>\s*/, "");

  // Body product photos, before any of the CTA passes reshape headings and
  // paragraphs. See insertProductImages() above for the placement rule.
  htmlContent = insertProductImages(htmlContent);

  /* One product, one button.
   *
   * The passes below each recognise a different shape the generator has used
   * over time, and an article can contain more than one of them for the SAME
   * product — a "### Check the X on Amazon" heading followed by a paragraph
   * that links X again. Buttoning both put two identical CTAs a line apart on
   * every product in the older articles. The heading is the canonical slot, so
   * it claims the href first and the paragraph passes defer to it. */
  const buttoned = new Set<string>();

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
      buttoned.add(href);
      return (
        `<h${lvl}${attrs}>${before}${name}${after}</h${lvl}>` +
        `<p class="not-prose my-4"><a href="${href}" target="_blank" rel="nofollow noopener sponsored" ` +
        `class="inline-flex h-11 items-center gap-2 bg-camp-ember px-6 text-[0.9375rem] font-semibold text-white no-underline transition-colors hover:bg-camp-ember-deep">` +
        `Check price on Amazon<span aria-hidden="true">&nbsp;→</span></a></p>`
      );
    },
  );

  /* A BARE affiliate URL sitting in a heading, with no markdown link around it:
   *
   *   ### Zonon RV Checklist Board (Single Pack) — https://www.amazon.com/dp/…
   *
   * The generator hands the writer an `AMZ_n` token and asks for it inside
   * `[…](AMZ_n)`; when the writer instead drops the bare token after an em-dash,
   * substitution turns it into a naked URL and every pass above misses it — they
   * all key on an <a>, and there is no <a> here. It renders as a wall of
   * query-string in the middle of an h3, which is what a reader actually sees.
   *
   * The URL is removed from the heading and a placeholder is left in its place.
   * It is NOT buttoned here: the same product is usually linked properly at the
   * end of its section a few lines later, and buttoning both would put two
   * identical CTAs on top of each other. The placeholder resolves after the
   * passes below have had their chance — to nothing if one of them claimed the
   * href, and to a button only if the heading was the sole reference. */
  const pendingHeadingCtas: string[] = [];
  htmlContent = htmlContent.replace(
    /<h([23])([^>]*)>([^<]*)<\/h\1>/g,
    (whole, lvl, attrs, text: string) => {
      const m = text.match(
        /^([\s\S]*?)[\s—–-]*(https:\/\/www\.amazon\.com\/\S*?tag=camprally-20\S*)\s*$/,
      );
      if (!m) return whole;
      const [, name, href] = m;
      if (!name.trim()) return whole;
      pendingHeadingCtas.push(href);
      return (
        `<h${lvl}${attrs}>${name.trim()}</h${lvl}>` +
        `<!--amzcta:${pendingHeadingCtas.length - 1}-->`
      );
    },
  );

  const buyButton = (href: string, label: string) =>
    `<p class="not-prose my-6"><a href="${href}" target="_blank" rel="nofollow noopener sponsored" ` +
    `class="inline-flex h-11 items-center gap-2 bg-camp-ember px-6 text-[0.9375rem] font-semibold text-white no-underline transition-colors hover:bg-camp-ember-deep">` +
    `${label}<span aria-hidden="true">&nbsp;→</span></a></p>`;

  /* An Amazon affiliate link that ENDS a paragraph is a buy CTA and gets a
   * button. It is the revenue mechanism of the page, and as a plain anchor it
   * is indistinguishable from body text.
   *
   * THIS USED TO REQUIRE THE LINK TO BE THE WHOLE PARAGRAPH, AND THE GENERATOR
   * STOPPED WRITING THEM THAT WAY. Its current shape is a sentence of prose
   * followed by the CTA — "…you are paying for inverter headroom rather than
   * extra capacity. **[Check the X on Amazon](url)**" — which matched neither
   * this pass nor the heading pass below. Every pipeline-written article was
   * shipping with ZERO buy buttons: the newest guide had 12 affiliate links and
   * not one of them looked clickable, while an older hand-written article had
   * ten buttons. Nothing failed; the money just quietly stopped being asked for.
   *
   * Matching is per-paragraph — the inner pattern is applied to one paragraph's
   * contents at a time — because a `[\s\S]*?` prefix in a single regex lazily
   * crosses `</p>` and swallows whole sections, which is the same trap already
   * documented on the heading pass.
   *
   * Only a TRAILING link is lifted. A link genuinely mid-sentence is part of the
   * prose and stays inline, where moving it would break the sentence around it. */
  htmlContent = htmlContent.replace(
    /<p>((?:(?!<\/p>)[\s\S])*)<\/p>/g,
    (whole, inner: string) => {
      const m = inner.match(
        /^([\s\S]*?)\s*(?:<strong>)?<a href="(https:\/\/www\.amazon\.com\/[^"]*?tag=camprally-20[^"]*?)">([\s\S]*?)<\/a>(?:<\/strong>)?\s*$/,
      );
      if (!m) return whole;
      const [, prose, href, label] = m;
      if (buttoned.has(href)) return whole;
      const text = label.replace(/<[^>]+>/g, "").trim();
      buttoned.add(href);
      return (prose.trim() ? `<p>${prose.trim()}</p>` : "") + buyButton(href, text);
    },
  );

  /* The generator's other shape puts the link MID-sentence, and uses the CTA
   * phrasing as the link text, so the sentence reads:
   *
   *   "The **Check the Mountain House Beef Lasagna on Amazon** covers nine
   *    generous servings."
   *
   * which is not English. The author clearly meant the product NAME there. So
   * the anchor keeps its place in the sentence but is relabelled to the bare
   * name, and the CTA it was impersonating becomes a real button after the
   * paragraph — the same split the heading pass performs, for the same reason.
   *
   * Gated on the label actually being that boilerplate. A link whose text is
   * already a product name, or any other inline reference, is deliberate prose
   * and is left exactly as it is. */
  const CTA_LABEL = /^check\s+(?:the\s+|out\s+)?([\s\S]+?)[\s,.]*on\s+amazon[\s.]*$/i;
  htmlContent = htmlContent.replace(
    /<p>((?:(?!<\/p>)[\s\S])*)<\/p>/g,
    (whole, inner: string) => {
      if (inner.includes("not-prose")) return whole;
      const m = inner.match(
        /<a href="(https:\/\/www\.amazon\.com\/[^"]*?tag=camprally-20[^"]*?)">([\s\S]*?)<\/a>/,
      );
      if (!m) return whole;
      const [anchor, href, label] = m;
      const named = label.replace(/<[^>]+>/g, "").trim().match(CTA_LABEL);
      if (!named) return whole;
      const relabelled = inner.replace(anchor, `<a href="${href}" target="_blank" rel="nofollow noopener sponsored">${named[1].trim()}</a>`);
      /* The relabel happens either way — the sentence is ungrammatical
       * regardless of whether a button already exists elsewhere for it. */
      if (buttoned.has(href)) return `<p>${relabelled}</p>`;
      buttoned.add(href);
      return `<p>${relabelled}</p>` + buyButton(href, "Check price on Amazon");
    },
  );

  /* The generator's fourth and best shape: the link sits mid-sentence with the
   * PRODUCT NAME as its text — "The [FLY2SKY Camping Lights](url) clip onto
   * tent loops…". That prose is correct and must not be touched, which is why
   * the relabel pass above deliberately skips it. But the article still had no
   * buy button anywhere in its body: every affiliate link was an ordinary
   * green inline word, and the whole guide converted on the product grid alone.
   *
   * So the sentence is left exactly as written and a button is appended after
   * the paragraph. Deduplication means a product already buttoned by one of the
   * passes above does not get a second one here, which is what keeps this from
   * carpeting the older articles in CTAs. */
  htmlContent = htmlContent.replace(
    /<p>((?:(?!<\/p>)[\s\S])*)<\/p>/g,
    (whole, inner: string) => {
      if (inner.includes("not-prose")) return whole;
      const m = inner.match(
        /<a href="(https:\/\/www\.amazon\.com\/[^"]*?tag=camprally-20[^"]*?)">/,
      );
      if (!m) return whole;
      const href = m[1];
      if (buttoned.has(href)) return whole;
      buttoned.add(href);
      return whole + buyButton(href, "Check price on Amazon");
    },
  );

  /* Resolve the heading placeholders now that every pass has claimed what it
   * was going to claim. A href another pass already buttoned leaves nothing
   * behind; one that appeared ONLY in the heading gets the button it would
   * otherwise have lost when the bare URL was stripped. */
  htmlContent = htmlContent.replace(/<!--amzcta:(\d+)-->/g, (_m, i: string) => {
    const href = pendingHeadingCtas[Number(i)];
    if (!href || buttoned.has(href)) return "";
    buttoned.add(href);
    return buyButton(href, "Check price on Amazon");
  });

  /* Anchor every h2, and hand the caller the table of contents.
   *
   * This read `match[1]` — the ATTRIBUTES group — where it meant `match[2]`,
   * the content, and the two comments on those lines contradicted each other
   * about which was which. remark-html emits a bare `<h2>`, so group 1 was
   * always the empty string, every id slugified to "", and all 50 articles
   * shipped `<h2 id="">` with zero working anchors sitewide. The `toc` array
   * was built correctly-shaped and then dropped on the floor: nothing read it,
   * because processMarkdown only ever returned the HTML.
   *
   * That costs more than a broken hash link. Anchored headings are what let
   * Google link straight to a section from a result, and what lets an answer
   * engine cite one passage instead of the whole page.
   *
   * One pass with a replace callback, not a match-then-replace loop: the old
   * shape called `htmlContent.replace(fullMatch, …)`, which rewrites the FIRST
   * occurrence, so two headings with identical text both took the first one's
   * id. `seen` keeps ids unique for the same reason — duplicate ids are invalid
   * HTML and the browser jumps to whichever came first. */
  const toc: { text: string; id: string }[] = [];
  const seen = new Map<string, number>();
  htmlContent = htmlContent.replace(
    /<h2([^>]*)>([\s\S]*?)<\/h2>/g,
    (full, attrs: string, inner: string) => {
      const text = inner.replace(/<[^>]+>/g, "").trim();
      const base =
        text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
        "section";
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      const id = n ? `${base}-${n + 1}` : base;
      toc.push({ text, id });
      // Respect an id the markdown author already set rather than adding a second.
      if (/\sid=/.test(attrs)) return full;
      return `<h2${attrs} id="${id}">${inner}</h2>`;
    },
  );

  return { html: htmlContent, toc };
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
    // Brand suffix comes from the root layout's title template.
    title: article.title,
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

  const { html: contentHtml, toc } = await processMarkdown(article.content);
  const customSections = getCustomSections(slug);
  const heroImage = getHeroImage(slug);

  /* The article's own recommendations, for the closing CTA.
   *
   * That CTA used to be a single "Shop on Amazon" button pointing at
   * amazon.com — the storefront homepage — on every one of the 32 articles. It
   * is the last thing a reader sees after a full guide, the point of highest
   * intent, and it dropped them somewhere they would have to start their search
   * over. Ten articles had no product link anywhere in their body, so this was
   * their only body-level CTA and it named no product at all.
   *
   * Built from the article's OWN curated products — the grid and spotlight it
   * already renders — so nothing is invented and it cannot drift from what the
   * page recommends. Unpriced products are dropped rather than shown with a
   * "Check price" placeholder: this is a buy prompt, and the site's rule is
   * that a figure is live or absent. Capped at three so a long comparison does
   * not end in a wall of buttons.
   */
  const ctaProducts = (() => {
    const refs: Array<{ ref?: string; label?: string }> = [];
    for (const sec of customSections) {
      for (const it of sec.items ?? []) refs.push({ ref: it.asin ?? it.link, label: it.label });
      if (sec.spotlightItem) refs.push({ ref: sec.spotlightItem.asin, label: sec.spotlightItem.name });
    }
    const seen = new Set<string>();
    const out: Array<{ url: string; label: string; price: string }> = [];
    for (const r of refs) {
      const live = withLivePrice(productFor(r.ref));
      if (!live?.url || !live.price || seen.has(live.asin)) continue;
      seen.add(live.asin);
      out.push({ url: live.url, label: r.label ?? live.title, price: live.price });
    }
    return out.slice(0, 3);
  })();

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
  const productList = articleProductListNode(
    article.slug,
    customSections.find((s) => s.type === "product-grid")?.title,
  );

  const articleNode = {
    "@type": "Article",
    "@id": `${SITE_URL}/blog/${article.slug}#article`,
    headline: article.title,
    description: article.excerpt,
    image: heroImage.startsWith("http") ? heroImage : `${SITE_URL}${heroImage}`,
    datePublished: article.date,
    /* The later of publication and last rewrite. It was `article.date` for
     * both, which was only ever right because nothing had been rewritten yet. */
    dateModified: lastChanged(article),
    articleSection: article.category,
    /* author and publisher stay INLINE objects. Replacing them with
     * `{ "@id": ORG_ID }` is the obvious tidy and silently breaks the markup:
     * the Organization node is only emitted on the homepage, and Google does
     * not resolve an @id reference across documents. */
    author: { "@type": "Organization", name: article.author, url: SITE_URL },
    publisher: { "@type": "Organization", name: "CampRally", url: SITE_URL },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/blog/${article.slug}` },
    ...(productList ? { mainEntity: { "@id": `${SITE_URL}/blog/${article.slug}#products` } } : {}),
  };

  return (
    <div>
      <JsonLd
        nodes={[
          articleNode,
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "All Guides", path: "/blog" },
            { name: article.title },
          ]),
          productList,
        ]}
      />
      {/* Hero. Full-bleed rather than an inset rounded panel — the edge-to-edge
          photograph is most of what separates a store from a blog. */}
      <div className="relative isolate flex min-h-[clamp(22rem,48vh,32rem)] items-end overflow-hidden">
        <Image
          src={heroImage}
          alt={getHeroAlt(slug)}
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

          {/* Table of contents.
              Three or more sections before it earns its space — on a two-heading
              article it is longer than the thing it indexes. Rendered as real
              anchors in the static HTML, which is what makes the section links
              available to a crawler and not only to a reader. */}
          {toc.length >= 3 ? (
            <nav
              aria-labelledby="toc-heading"
              className="mb-10 max-w-[68ch] border border-camp-stone bg-camp-bone p-5"
            >
              {/* A <p>, not a heading: this labels a navigation landmark and
                  is not a section of the article. As an <h2> it would sit in
                  the document outline alongside the real sections, which is
                  exactly the outline a passage-ranking crawler reads. */}
              <p
                id="toc-heading"
                className="text-eyebrow uppercase tracking-wide text-muted-foreground"
              >
                In this guide
              </p>
              <ol className="mt-3 flex flex-col gap-2">
                {toc.map((h, i) => (
                  <li key={h.id} className="text-[1.0625rem] leading-snug">
                    <span className="mr-2 tabular-nums text-muted-foreground">
                      {i + 1}.
                    </span>
                    <a
                      href={`#${h.id}`}
                      className="font-medium text-camp-green hover:underline"
                    >
                      {h.text}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}

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
              Researched, safety-reviewed, and priced live. As an Amazon
              Associate, we earn from qualifying purchases — at no extra cost to
              you.
            </p>
            {ctaProducts.length ? (
              <ul className="mt-5 flex flex-col gap-2">
                {ctaProducts.map((p) => (
                  <li key={p.url}>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="nofollow noopener sponsored"
                      className="group flex h-12 items-center justify-between gap-4 bg-camp-ember px-5 font-semibold text-white transition-colors hover:bg-camp-ember-deep"
                    >
                      <span className="truncate">{p.label}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {p.price}
                        <ExternalLink className="size-4" />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              /* Articles with no products of their own — the pure how-to
                 pieces — send the reader to the guides rather than to a
                 storefront they did not ask for. */
              <Link
                href="/blog"
                className="mt-5 inline-flex h-12 items-center gap-2 border border-camp-stone bg-background px-7 font-semibold text-foreground transition-colors hover:border-camp-green hover:text-camp-green"
              >
                Browse the gear guides
                <ArrowLeft className="size-4 rotate-180" />
              </Link>
            )}
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
