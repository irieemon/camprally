import type { Metadata } from "next";
import { merchDesigns, merchStoreUrl, MerchGrid } from "@/components/Merch";
import JsonLd from "@/components/JsonLd";
import { breadcrumbNode } from "@/lib/structured-data";

/**
 * The merch store page. Same reasoning as `/printables`: the 16 Printify
 * designs previously lived only in a homepage band and an occasional guide
 * sidebar slot, with no indexable URL of their own.
 */
const TITLE = "Merch";
const DESCRIPTION =
  "Original camp watercolours, printed to order — tees, hoodies, totes, mugs and phone cases. Made and sold by CampRally.";

export const metadata: Metadata = {
  // Brand suffix comes from the root layout's title template.
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/merch" },
  openGraph: {
    /* Restated in full — a route's `openGraph` replaces the root layout's
     * object rather than merging with it. Same trap documented on the
     * homepage, /blog and the article route. */
    type: "website",
    siteName: "CampRally",
    locale: "en_US",
    url: "/merch",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function MerchPage() {
  return (
    <div>
      <JsonLd
        nodes={[
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "Merch" },
          ]),
        ]}
      />

      <div className="border-b border-camp-stone bg-camp-bone">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
          <p className="eyebrow mb-3 text-camp-green">CampRally merch</p>
          <h1 className="max-w-2xl text-h1 text-balance text-foreground">
            Original watercolours, printed when you order
          </h1>
          <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-muted-foreground">
            {merchDesigns.length} camp scenes we created ourselves, on tees,
            hoodies, totes, mugs and phone cases.
          </p>
          <a
            href={merchStoreUrl}
            target="_blank"
            rel="noopener"
            className="mt-6 inline-flex h-11 items-center border border-camp-stone bg-background px-5 text-[0.9375rem] font-semibold text-foreground transition-colors hover:border-camp-green hover:text-camp-green"
          >
            Visit the store
          </a>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <MerchGrid />
      </div>
    </div>
  );
}
