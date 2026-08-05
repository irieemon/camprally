import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

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

export const metadata: Metadata = {
  title: "CampRally | Smart Camping for Every Budget",
  description:
    "Honest reviews and practical guides to help you get outdoors without breaking the bank. Budget camping gear, tips, and beginner-friendly advice.",
  keywords: [
    "budget camping gear",
    "cheap camping equipment",
    "camping for beginners",
    "affordable outdoor gear",
    "camping on a budget",
  ],
  other: {
    "p:domain_verify": "880d0f2204d93164f159ad9581eab664",
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
          `}
        </Script>
        {/*
          AvantLink affiliate application verification. Added 2026-04 and marked
          "delete after approval" — still here months later, so approval status
          is unconfirmed. Loaded via next/script rather than a raw tag so it no
          longer blocks first render on every page; verification still works
          because the script is present in the DOM either way.
        */}
        <Script
          id="avantlink-verify"
          src="https://classic.avantlink.com/affiliate_app_confirm.php?mode=js&authResponse=20d071dee7649107b0746ce9716f6da2575dd4de"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
