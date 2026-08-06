import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    // Pointed at the serving host: the apex 307s, and a redirecting sitemap
    // reference is one more hop between Google and the URL list.
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
