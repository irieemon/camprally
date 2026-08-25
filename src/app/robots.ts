import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * AI crawlers, named explicitly.
 *
 * They were already allowed — by the blanket `allow: "/"` below, which permits
 * anything not named. But allowed by omission and allowed on purpose look
 * identical in a robots.txt and are not the same decision, and this one is on
 * purpose: being quotable in an AI answer is a distribution channel for a site
 * whose whole business is being found. Naming them makes the intent legible to
 * whoever reads this next, and gives one obvious place to revoke it.
 *
 * Google-Extended is the one worth understanding before touching: it governs
 * Gemini and AI Overviews grounding, NOT ordinary Search indexing. Disallowing
 * it does not remove the site from Google's index — and does not remove it from
 * AI Overviews either, which draw on the regular Search index.
 */
const AI_CRAWLERS = [
  "GPTBot",          // OpenAI, model training
  "OAI-SearchBot",   // OpenAI, ChatGPT search results
  "ChatGPT-User",    // OpenAI, fetches a page a user asked about
  "ClaudeBot",       // Anthropic
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",           // Common Crawl, which most other models train from
  "Bytespider",
  "Amazonbot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      { userAgent: AI_CRAWLERS, allow: "/" },
    ],
    // Pointed at the serving host: the apex redirects, and a redirecting
    // sitemap reference is one more hop between Google and the URL list.
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
