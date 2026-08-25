import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { SITE_URL } from "@/lib/site";

/* Inter for body and UI — the closest freely available match to Graphik, which
 * is what REI's Cedar design system runs on. Large x-height, so it reads a full
 * step larger than a serif at the same nominal size. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/* Archivo for headlines. A grotesque drawn from American highway and park
 * signage, which gives the display type the sturdiness an outdoor retailer
 * wants and Inter deliberately lacks. */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

const TITLE = "CampRally | Smart Camping for Every Budget";
const DESCRIPTION =
  "Honest reviews and practical guides to help you get outdoors without breaking the bank. Budget camping gear, tips, and beginner-friendly advice.";

export const metadata: Metadata = {
  /* Lets every route below express canonical and OG urls as relative paths and
   * have them resolved against the one host that actually serves. Without it,
   * relative URL-based metadata is a build error and og:image never resolves —
   * which is why this site had no social preview at all. */
  metadataBase: new URL(SITE_URL),
  /* NO `alternates` here, deliberately. Metadata is inherited by any route that
   * does not set its own, so a canonical of "/" in the root layout would have
   * every page without an explicit one declaring itself the homepage — worse
   * than having no canonical at all, and silent. Each route sets its own, and a
   * future route that forgets simply has none, which Google infers correctly. */
  /* `default` is the homepage's own title; `template` brands every child that
   * sets a plain string title, so routes stop hand-writing "| CampRally" and a
   * future one cannot forget it.
   *
   * NOTE the template applies to `title` only. Open Graph titles are separate
   * and are NOT templated — og:title should be the bare headline, since the
   * site name travels in og:site_name and a social card that says
   * "Foo | CampRally · CampRally" is the usual result of assuming otherwise. */
  title: {
    default: TITLE,
    template: "%s | CampRally",
  },
  description: DESCRIPTION,
  /* Inherited by every route that does not set its own, so a link to any page
   * previews as something rather than as a bare URL. Pinterest is this site's
   * distribution rail, which makes these load-bearing rather than cosmetic. */
  openGraph: {
    type: "website",
    siteName: "CampRally",
    locale: "en_US",
    /* No `url` for the same inheritance reason: an un-overridden child would
     * advertise the homepage as its own og:url. Omitted, every platform falls
     * back to the URL it actually fetched, which is always right. */
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  keywords: [
    "budget camping gear",
    "cheap camping equipment",
    "camping for beginners",
    "affordable outdoor gear",
    "camping on a budget",
  ],
  other: {
    "p:domain_verify": "880d0f2204d93164f159ad9581eab664",
    /* The commit this build came from, so a deploy can be verified from
     * outside instead of inferred.
     *
     * scripts/verify-deploy.mjs used to check that the article URL returned 200
     * and mentioned its own slug. For a brand new article that is real evidence
     * — the page 404s until the deploy lands. For an UPDATE it proves nothing,
     * because both were already true before the deploy: a price refresh, a
     * catalog rebuild or a photo backfill would be reported "verified" against
     * the previous build. That is most deploys.
     *
     * Vercel sets VERCEL_GIT_COMMIT_SHA at build time. Read in a server
     * component it is baked into the static HTML, which makes the served page
     * state which commit produced it. */
    "build-commit": process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Navigation />
        <main className="flex-1">{children}</main>
        <Footer />
        <Analytics />
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-MQWSB6RTKJ" strategy="afterInteractive" />
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-MQWSB6RTKJ');

            // Affiliate click telemetry. GA4's built-in outbound-click event
            // can't answer "which product on which article converts", so tag
            // every Amazon link click with the ASIN and the page it came from.
            // transport beacon survives the navigation away.
            document.addEventListener('click', function (e) {
              var a = e.target && e.target.closest ? e.target.closest('a[href*="amazon.com"]') : null;
              if (!a) return;
              var m = a.href.match(/\\/dp\\/(B[0-9A-Z]{9})/);
              gtag('event', 'affiliate_click', {
                asin: m ? m[1] : '(unknown)',
                article_path: location.pathname,
                transport_type: 'beacon'
              });
            }, true);

            // Gumroad printables are the second revenue rail and the handler
            // above only matches amazon.com, so without this every click
            // through to the store is invisible in GA — and the weekly KPI
            // report cannot tell which page sells a printable.
            document.addEventListener('click', function (e) {
              var a = e.target && e.target.closest ? e.target.closest('a[href*="gumroad.com"]') : null;
              if (!a) return;
              gtag('event', 'printable_click', {
                printable: a.getAttribute('data-printable') || '(store)',
                article_path: location.pathname,
                transport_type: 'beacon'
              });
            }, true);

            // Printify merch is the third rail. data-merch carries
            // "<design>:<kind>", so this answers which PAINTING sells and on
            // which product — the two questions a design queue is planned
            // from. Links without the attribute are the "Visit the store"
            // buttons, which are still worth counting as store intent.
            document.addEventListener('click', function (e) {
              var a = e.target && e.target.closest ? e.target.closest('a[href*="printify.me"]') : null;
              if (!a) return;
              var tag = (a.getAttribute('data-merch') || '').split(':');
              gtag('event', 'merch_click', {
                design: tag[0] || '(store)',
                product: tag[1] || '(store)',
                article_path: location.pathname,
                transport_type: 'beacon'
              });
            }, true);
          `}
        </Script>
        {/*
          The AvantLink application-verification script lived here from 2026-04,
          marked "delete after approval". Removed 2026-08-06: it had been
          failing with ERR_BLOCKED_BY_ORB on every page load, so it was a dead
          request on every view and could not have been verifying anything. If
          AvantLink is ever applied for again, re-add it, confirm approval, and
          delete it the same week rather than leaving it to rot.
        */}
      </body>
    </html>
  );
}
