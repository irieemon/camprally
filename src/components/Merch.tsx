import Image from "next/image";
import { ArrowRight } from "lucide-react";
import merchData from "@/data/merch.json";

type MerchProduct = {
  kind: string;
  label: string;
  url: string;
  priceCents: number;
  price: string;
  varies: boolean;
};

type MerchDesign = {
  slug: string;
  name: string;
  subtitle: string;
  image: string | null;
  imageKey: string | null;
  fromCents: number;
  from: string;
  publishedAt: string | null;
  products: MerchProduct[];
};

const DATA = merchData as { storeUrl: string; designs: MerchDesign[] };
export const merchDesigns = DATA.designs;
export const merchStoreUrl = DATA.storeUrl;

/* Same reasoning as the printables: these are CampRally's own products, not
 * affiliate placements, so no sponsored/nofollow rel and no earnings
 * disclosure — "we may earn a commission" about your own store would be
 * misleading rather than transparent. */
const REL = "noopener";

/* Prices are per-variant ranges (a 5XL hoodie costs more than a small), so a
 * single figure would be wrong for most sizes. The plus is the cheapest honest
 * way to say "this is where it starts" in the width a chip has. */
const priceLabel = (p: MerchProduct) => (p.varies ? `${p.price}+` : p.price);

const teeOf = (d: MerchDesign) =>
  d.products.find((p) => p.kind === "tee") ?? d.products[0];

/**
 * Deterministic bucket for a string, so a page picks the same thing on every
 * build. Rotating by hand or by date would make two builds of the same commit
 * differ, which turns a diff of the output into noise.
 */
export function stableIndex(seed: string, buckets: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % buckets;
}

function Art({ d, className = "" }: { d: MerchDesign; className?: string }) {
  if (!d.image) {
    return <div className={`bg-camp-bone-deep ${className}`} aria-hidden="true" />;
  }
  return (
    <div className={`relative overflow-hidden bg-camp-bone ${className}`}>
      <Image
        src={d.image}
        alt={`${d.name} printed on a t-shirt`}
        fill
        sizes="(max-width: 640px) 100vw, 340px"
        /* The mockup is a square studio shot with the garment centred and deep
           empty margins top and bottom. A centred crop to this card's landscape
           box trims exactly that dead space and leaves the print filling the
           frame, which is the only part worth showing at card size. */
        className="object-cover object-center transition-transform duration-500 ease-out group-hover:scale-[1.04]"
      />
    </div>
  );
}

/**
 * Full-width band for the home page.
 *
 * One card per design rather than per product: there are 25 products but only
 * five paintings, so a product grid would show each image five times. The
 * per-product links live inside the card, which keeps every SKU one click away
 * without repeating the art.
 */
export function MerchSection() {
  if (!merchDesigns.length) return null;

  return (
    <section className="border-b border-camp-stone bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-2 text-camp-green">CampRally merch</p>
            <h2 className="max-w-xl text-h2 text-balance text-foreground">
              Original watercolours, printed when you order
            </h2>
            <p className="mt-3 max-w-md text-[1.0625rem] leading-relaxed text-muted-foreground">
              Five camp scenes we painted ourselves, on tees, hoodies, totes,
              mugs and phone cases. Nothing is printed until someone buys it.
            </p>
          </div>
          <a
            href={merchStoreUrl}
            target="_blank"
            rel={REL}
            className="inline-flex h-11 items-center border border-camp-stone bg-background px-5 text-[0.9375rem] font-semibold text-foreground transition-colors hover:border-camp-green hover:text-camp-green"
          >
            Visit the store
          </a>
        </div>

        {/* Matches the printables grid, including its cap: below three designs
            the row is narrowed rather than left with a dead third column. */}
        <div
          className={`grid gap-6 sm:grid-cols-2 ${
            merchDesigns.length < 3 ? "max-w-3xl" : "lg:grid-cols-3"
          }`}
        >
          {merchDesigns.map((d) => {
            const hero = teeOf(d);
            return (
              /* Not a single <a> wrapper, unlike a printable card: a design is
                 five separate products and each needs its own link, which
                 cannot nest inside an anchor. */
              <div
                key={d.slug}
                className="group flex flex-col overflow-hidden border border-camp-stone bg-card transition-colors hover:border-camp-green"
              >
                <a
                  href={hero.url}
                  target="_blank"
                  rel={REL}
                  data-merch={`${d.slug}:${hero.kind}`}
                  aria-label={`${d.name} — ${hero.label}`}
                  className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-camp-green"
                >
                  <Art d={d} className="aspect-[4/3] w-full" />
                </a>
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <h3 className="text-h3 text-balance text-foreground">{d.name}</h3>
                  {d.subtitle && (
                    <p className="line-clamp-2 text-meta text-muted-foreground first-letter:uppercase">
                      {d.subtitle}
                    </p>
                  )}
                  <ul className="mt-auto flex flex-wrap gap-1.5 pt-4">
                    {d.products.map((p) => (
                      <li key={p.kind}>
                        <a
                          href={p.url}
                          target="_blank"
                          rel={REL}
                          data-merch={`${d.slug}:${p.kind}`}
                          className="inline-flex items-baseline gap-1.5 border border-camp-stone px-2.5 py-1.5 text-[0.8125rem] leading-none text-muted-foreground transition-colors hover:border-camp-green hover:text-camp-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-camp-green"
                        >
                          {p.label}
                          <span className="font-display font-bold tracking-tight text-camp-ember">
                            {priceLabel(p)}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * Single-design block for the article sidebar.
 *
 * Keyed off the article slug rather than showing the newest design, so the five
 * paintings spread across the catalogue instead of every page selling the same
 * shirt — and so a given article looks the same on every build.
 */
export function MerchSidebarCard({ slug }: { slug: string }) {
  if (!merchDesigns.length) return null;

  const d = merchDesigns[stableIndex(slug, merchDesigns.length)];
  const hero = teeOf(d);

  return (
    <div className="group border border-camp-stone bg-card transition-colors hover:border-camp-green">
      <a
        href={hero.url}
        target="_blank"
        rel={REL}
        data-merch={`${d.slug}:${hero.kind}`}
        aria-label={`${d.name} — ${hero.label}`}
        className="block"
      >
        <Art d={d} className="aspect-[4/3] w-full" />
      </a>
      <div className="p-5">
        <p className="eyebrow mb-2 text-camp-green">CampRally merch</p>
        <h3 className="text-[1.0625rem] font-semibold leading-snug text-foreground">
          {d.name}
        </h3>
        {d.subtitle && (
          <p className="mt-2 line-clamp-3 text-meta leading-relaxed text-muted-foreground first-letter:uppercase">
            {d.subtitle}
          </p>
        )}
        <a
          href={hero.url}
          target="_blank"
          rel={REL}
          data-merch={`${d.slug}:${hero.kind}`}
          className="mt-4 flex items-center justify-center gap-2 bg-camp-ember py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-camp-ember-deep"
        >
          {hero.label} · {priceLabel(hero)}
          <ArrowRight className="size-4" />
        </a>
        {/* The card sells one product; this says the design is not limited to
            it, without pricing four more things in a sidebar. */}
        <a
          href={merchStoreUrl}
          target="_blank"
          rel={REL}
          /* Underlined only on hover: in a sidebar this narrow the line wraps,
             and a permanent rule under two ragged centred lines reads as a
             mistake rather than as a link. */
          className="mt-3 block text-center text-meta text-muted-foreground underline-offset-4 transition-colors hover:text-camp-green hover:underline"
        >
          Also on hoodies, totes, mugs and cases
        </a>
      </div>
    </div>
  );
}
