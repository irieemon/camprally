# CampRally SEO Checklist

## ⚠️ IMPORTANT: Replace GA4 Placeholder

In `src/app/layout.tsx`, the Google Analytics script uses placeholder `G-XXXXXXXXXX`.
**Replace `G-XXXXXXXXXX` with your actual GA4 Measurement ID** once you create the property.

---

## 1. Google Search Console — Submit Sitemap

1. Go to [Google Search Console](https://search.google.com/search-console) and sign in with your Google account
2. Select your property (camprally.co)
3. In the left sidebar, click **Sitemaps** under "Indexing"
4. Enter `sitemap.xml` in the "Add a sitemap" field
5. Click **Submit**
6. Check back in 24-48 hours to see crawl status and any errors

---

## 2. Google Analytics 4 — Setup (Replace Placeholder First)

Once you've created your GA4 property:

1. Go to [analytics.google.com](https://analytics.google.com)
2. Click **Start measuring**
3. Enter account name (e.g., "CampRally")
4. Configure data sharing settings → click **Next**
5. Enter property name: "CampRally Website"
6. Set reporting time zone: Eastern Time (Americas/New_York)
7. Select **Web** as the business category
8. Enter website URL: `https://camprally.co`
9. Copy the **Measurement ID** (looks like `G-XXXXXXXXXX`)
10. Replace `G-XXXXXXXXXX` in `src/app/layout.tsx` with your actual ID
11. Deploy/push the change

GA4 will start collecting data immediately. Allow 24-48 hours for data to appear.

---

## 3. Bing Webmaster Tools — Submit Sitemap

1. Go to [bingwebmastertools.com](https://www.bingwebmastertools.com) and sign in with Microsoft/Google account
2. Click **Add a Site**
3. Enter `https://camprally.co`
4. Download the verification file or add a CNAME/DNS record
5. Once verified, go to **Sitemaps** in the dashboard
6. Submit `https://camprally.co/sitemap.xml`
7. Bing also picks up `robots.txt` automatically

---

## 4. Blog Post Schedule for SEO

Publish 2-3 posts per week on a consistent schedule. Here is a sustainable cadence:

| Day | Content Type | Example |
|-----|-------------|---------|
| Monday | Gear review / comparison | "Best Budget Tents Under $100" |
| Wednesday | How-to / guide | "How to Find Free Campsites" |
| Friday | Tips / listicle | "Budget Camping Hacks That Work" |

**Why this schedule:**
- Monday/Wednesday posts give time for social sharing before weekend camping trips
- Friday posts get saved for weekend reading
- Consistent publishing signals trustworthiness to search engines

---

## 5. Recommended Keyword Targets (Camping Niche)

Target these keyword clusters for SEO:

### High-Volume Head Terms
- "budget camping gear" (~1,900/mo)
- "camping for beginners" (~2,400/mo)
- "cheap camping equipment" (~800/mo)
- "best camping tent" (~5,000/mo)

### Long-Tail / Low Competition
- "best budget sleeping bag for cold weather"
- "how to start camping with no gear"
- "cheapest camping setup for beginners"
- "budget camping cookware that works"
- "how to find free campsites"
- "best time of year to camp for free"
- "budget camping hacks that actually work"

### Seasonal / Trending
- "camping checklist" (spikes March-May)
- "best camping gifts" (spikes Oct-Dec)
- "winter camping tips" (spikes Nov-Jan)
- "camping food ideas" (spikes May-Sept)

### Affiliate-Intent Keywords (High Converting)
- "best [category] under $50"
- "[item] vs [item] camping"
- "budget [item] reddit"
- "[item] amazon"

---

## 6. On-Page SEO Checklist (Per Blog Post)

- [ ] Unique title tag (include keyword + year)
- [ ] Meta description (150-160 chars, include keyword + CTA)
- [ ] H1 matches title
- [ ] H2s are descriptive (not "Tips" — use "5 Budget Camping Hacks")
- [ ] Internal links to 2-3 related posts
- [ ] External links to authoritative sources (REI, NPS, etc.)
- [ ] Affiliate links where natural (Amazon Associates)
- [ ] Alt text on all images (describe the image + include keyword)
- [ ] Schema/structured data for articles (Next.js handles some automatically)
- [ ] URL slug matches target keyword (lowercase, hyphens)
- [ ] Content answers search intent (what is the searcher looking for?)

---

## 7. Off-Page SEO

- [ ] Submit to directories: DMOZ (if still active), Yelp for local camping services
- [ ] Reach out to outdoor blogs for backlinks (guest posting)
- [ ] Share posts on Reddit r/camping, r/CampingandHiking, r/BudgetCamping
- [ ] Pinterest pins for gear list posts (high traffic from Pinterest in camping niche)
- [ ] Set up a Google Business Profile if covering local camping areas

---

## 8. Technical SEO

- [ ] Enable HTTPS (should already be done by host)
- [ ] Submit sitemap to Google Search Console ✓ (done)
- [ ] Submit sitemap to Bing Webmaster ✓ (do this)
- [ ] Set canonical URLs to prevent duplicate content
- [ ] Ensure site loads under 3 seconds (check with PageSpeed Insights)
- [ ] Mobile-friendly (test with Google's mobile-friendly test)
- [ ] Create `404.tsx` page with helpful "campsite not found" messaging
- [ ] Add Open Graph and Twitter card meta tags if not already present
