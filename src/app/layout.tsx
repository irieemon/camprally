import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Navigation />
        <main className="flex-1">{children}</main>
        <Footer />
        {/*
          ⚠️  ACTION REQUIRED: Replace G-XXXXXXXXXX with your actual GA4 Measurement ID.
          Go to https://analytics.google.com to create your GA4 property.
        */}
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-MQWSB6RTKJ" strategy="afterInteractive" />
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-MQWSB6RTKJ');
          `}
        </Script>
        {/* AVANTLINK AFFILIATE APPLICATION VERIFICATION — DELETE AFTER APPROVAL */}
        <script
          type="text/javascript"
          src="https://classic.avantlink.com/affiliate_app_confirm.php?mode=js&authResponse=20d071dee7649107b0746ce9716f6da2575dd4de"
        />
      </body>
    </html>
  );
}
