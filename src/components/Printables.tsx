import Image from "next/image";
import { ArrowRight } from "lucide-react";
import printablesData from "@/data/printables.json";

export type Printable = {
  slug: string;
  title: string;
  subtitle: string;
  price: string;
  priceCents: number;
  pages: number | null;
  url: string;
  image: string | null;
};

const DATA = printablesData as { storeUrl: string; products: Printable[] };
export const printables = DATA.products;
export const storeUrl = DATA.storeUrl;

/* These are CampRally's own products, not affiliate placements, so they carry
 * no sponsored/nofollow rel and no earnings disclosure — saying "we may earn a
 * commission" about your own store would be misleading. The one thing worth
 * stating plainly is that they are ours, which is a trust signal rather than a
 * disclaimer. */
const REL = "noopener";

function Art({ p, className = "" }: { p: Printable; className?: string }) {
  if (!p.image) {
    return <div className={`bg-camp-bone-deep ${className}`} aria-hidden="true" />;
  }
  return (
    <div className={`relative overflow-hidden bg-camp-bone ${className}`}>
      <Image
        src={p.image}
        /* The product name, which is the right alt for a PRODUCT image even
           though it would be wrong for an article hero. The distinction is
           whether the text is redundant: a hero sits directly under the H1 it
           would restate, whereas this tile is the only visual identifying the
           thing being sold, and a shopper skimming with a screen reader needs
           to know which printable it is. */
        alt={p.title}
        fill
        sizes="(max-width: 640px) 100vw, 340px"
        /* The source is a 3:4 watercolour with the illustration weighted to the
           lower two thirds and empty paper above it, so a centred crop lands on
           blank space. Anchor low and the tile fills with the artwork. */
        className="object-cover object-[center_78%] transition-transform duration-500 ease-out group-hover:scale-[1.04]"
      />
    </div>
  );
}

/**
 * The product grid — one implementation shared by the homepage band
 * (`PrintablesSection`) and the standalone `/printables` page, so the two
 * cannot render different cards for the same catalogue.
 */
export function PrintablesGrid({ items = printables }: { items?: Printable[] }) {
  if (!items.length) return null;
  return (
    /* Three columns once the catalogue can fill them. Below that the grid is
       capped instead, so two products sit as two cards of a normal width
       rather than leaving a dead third column beside them. */
    <div
      className={`grid gap-6 sm:grid-cols-2 ${
        items.length < 3 ? "max-w-3xl" : "lg:grid-cols-3"
      }`}
    >
      {items.map((p) => (
        <a
          key={p.slug}
          href={p.url}
          target="_blank"
          rel={REL}
          data-printable={p.slug}
          className="group flex flex-col overflow-hidden border border-camp-stone bg-card transition-colors hover:border-camp-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-camp-green"
        >
          <Art p={p} className="aspect-[4/3] w-full" />
          <div className="flex flex-1 flex-col gap-2 p-5">
            <h3 className="text-h3 text-balance text-foreground">{p.title}</h3>
            <p className="line-clamp-2 text-meta text-muted-foreground">
              {p.subtitle}
            </p>
            <div className="mt-auto flex items-baseline justify-between gap-3 pt-3">
              <span className="font-display text-lg font-bold tracking-tight text-camp-ember">
                {p.price}
              </span>
              <span className="text-meta text-muted-foreground">
                {p.pages ? `${p.pages} pages · PDF` : "PDF"}
              </span>
            </div>
          </div>
          <span className="flex items-center justify-center gap-2 bg-camp-ember py-3 text-[0.9375rem] font-semibold text-white transition-colors group-hover:bg-camp-ember-deep">
            Get it for {p.price}
            <ArrowRight className="size-4" />
          </span>
        </a>
      ))}
    </div>
  );
}

/** Full-width band for the home page. */
export function PrintablesSection() {
  if (!printables.length) return null;

  return (
    <section className="border-y border-camp-stone bg-camp-bone">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-2 text-camp-green">CampRally printables</p>
            <h2 className="max-w-xl text-h2 text-balance text-foreground">
              Plan the trip on paper
            </h2>
            <p className="mt-3 max-w-md text-[1.0625rem] leading-relaxed text-muted-foreground">
              Printable checklists and planners we made ourselves. Instant PDF
              download, print as many times as you like.
            </p>
          </div>
          <a
            href={storeUrl}
            target="_blank"
            rel={REL}
            className="inline-flex h-11 items-center border border-camp-stone bg-background px-5 text-[0.9375rem] font-semibold text-foreground transition-colors hover:border-camp-green hover:text-camp-green"
          >
            Visit the store
          </a>
        </div>

        <PrintablesGrid />
      </div>
    </section>
  );
}

/**
 * Single-product block for the article sidebar.
 *
 * Defaults to the cheapest printable — the sidebar is an impulse slot next to
 * a reader who came for gear advice, and the lowest ticket is the least
 * friction. A caller (the guide page) may instead pass the printable its
 * relevance scorer picked for THIS article, in which case the eyebrow says so
 * rather than repeating the generic store label.
 */
export function PrintableSidebarCard({
  printable,
  reason,
}: {
  printable?: Printable;
  /** Shown as the eyebrow instead of "CampRally printables" when set. */
  reason?: string;
} = {}) {
  const p = printable ?? [...printables].sort((a, b) => a.priceCents - b.priceCents)[0];
  if (!p) return null;

  return (
    <a
      href={p.url}
      target="_blank"
      rel={REL}
      data-printable={p.slug}
      className="group block border border-camp-stone bg-card transition-colors hover:border-camp-green"
    >
      <Art p={p} className="aspect-[4/3] w-full" />
      <div className="p-5">
        <p className="eyebrow mb-2 text-camp-green">
          {reason ?? "CampRally printables"}
        </p>
        <h3 className="text-[1.0625rem] font-semibold leading-snug text-foreground">
          {p.title}
        </h3>
        <p className="mt-2 line-clamp-3 text-meta leading-relaxed text-muted-foreground">
          {p.subtitle}
        </p>
        <span className="mt-4 flex items-center justify-center gap-2 bg-camp-ember py-2.5 text-[0.9375rem] font-semibold text-white transition-colors group-hover:bg-camp-ember-deep">
          Get it for {p.price}
        </span>
      </div>
    </a>
  );
}
