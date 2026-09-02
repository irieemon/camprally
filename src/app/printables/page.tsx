import type { Metadata } from "next";
import { printables, storeUrl, PrintablesGrid } from "@/components/Printables";
import JsonLd from "@/components/JsonLd";
import { breadcrumbNode } from "@/lib/structured-data";

/**
 * The printables store page.
 *
 * Until now the 11 Gumroad printables only ever appeared as a homepage band
 * (`PrintablesSection`) and a single sidebar slot on guide pages — no
 * indexable URL, and nothing in the header nav pointed at them. This page and
 * `/merch` are that URL: same grid the homepage uses (`PrintablesGrid`, so
 * there is exactly one implementation of the card markup), its own H1, its
 * own canonical, and a listing in the header nav and the sitemap.
 */
const TITLE = "Printables";
const DESCRIPTION =
  "Printable camping checklists, planners and log books — instant PDF download, print as many times as you like. Made by CampRally, sold on Gumroad.";

export const metadata: Metadata = {
  // Brand suffix comes from the root layout's title template.
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/printables" },
  openGraph: {
    /* Restated in full: setting `openGraph` on a route REPLACES the root
     * layout's object rather than merging into it, so naming only `url` here
     * would silently drop og:title, og:description, og:site_name and og:type.
     * Same trap documented on the homepage, /blog and the article route. */
    type: "website",
    siteName: "CampRally",
    locale: "en_US",
    url: "/printables",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function PrintablesPage() {
  return (
    <div>
      <JsonLd
        nodes={[
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Printables" },
          ]),
        ]}
      />

      {/* Page header on a bone band — same shell BlogListing uses for /blog
          and the category hubs, so a store page reads as part of the same
          site rather than a bolted-on landing page. */}
      <div className="border-b border-camp-stone bg-camp-bone">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
          <p className="eyebrow mb-3 text-camp-green">CampRally printables</p>
          <h1 className="max-w-2xl text-h1 text-balance text-foreground">
            Plan the trip on paper
          </h1>
          <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-muted-foreground">
            {printables.length} printable checklists and planners we made
            ourselves. Instant PDF download, print as many times as you like.
          </p>
          <a
            href={storeUrl}
            target="_blank"
            rel="noopener"
            className="mt-6 inline-flex h-11 items-center border border-camp-stone bg-background px-5 text-[0.9375rem] font-semibold text-foreground transition-colors hover:border-camp-green hover:text-camp-green"
          >
            Visit the store
          </a>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <PrintablesGrid />
      </div>
    </div>
  );
}
