const ASSOCIATE_ID = "camprally-20";

export function generateAffiliateUrl(amazonUrl: string): string {
  try {
    const url = new URL(amazonUrl);
    if (url.searchParams.has("tag")) {
      return amazonUrl;
    }
    url.searchParams.set("tag", ASSOCIATE_ID);
    return url.toString();
  } catch {
    // Fallback for malformed URLs
    if (amazonUrl.includes("tag=")) {
      return amazonUrl;
    }
    const separator = amazonUrl.includes("?") ? "&" : "?";
    return `${amazonUrl}${separator}tag=${ASSOCIATE_ID}`;
  }
}

export function createProductLink(asin: string): string {
  return `https://www.amazon.com/dp/${asin}?tag=${ASSOCIATE_ID}`;
}

export { ASSOCIATE_ID };
