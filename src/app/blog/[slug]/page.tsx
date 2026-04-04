import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { articles } from "@/data/articles";
import { products } from "@/data/products";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ExternalLink, Star, Check, TrendingDown, Zap, Map, ChevronRight } from "lucide-react";
import Image from "next/image";

interface Props {
  params: Promise<{ slug: string }>;
}

// Free Unsplash images by category
const HERO_IMAGES: Record<string, string> = {
  "cheapest-camping-setup-for-beginners": "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=1200&q=80",
  "best-budget-tents-under-100": "https://images.unsplash.com/photo-1478827536114-da961b7f86d2?w=1200&q=80",
  "best-budget-sleeping-bags-cold-weather": "https://images.unsplash.com/photo-1517823382935-51bfcb0ec6bc?w=1200&q=80",
  default: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=1200&q=80",
};

const PRODUCT_IMAGES: Record<string, string> = {
  "Coleman Sundome": "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=400&q=80",
  "Coleman Brazos": "https://images.unsplash.com/photo-1517823382935-51bfcb0ec6bc?w=400&q=80",
  "Klymit Static V": "https://images.unsplash.com/photo-1537905569824-f89f14cceb68?w=400&q=80",
  "Stanley Adventure": "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&q=80",
  "Etekcity": "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&q=80",
  "Vont": "https://images.unsplash.com/photo-1510312305653-8ed496ef7575?w=400&q=80",
  "Nalgene": "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400&q=80",
};

function getHeroImage(slug: string): string {
  return HERO_IMAGES[slug] || HERO_IMAGES.default;
}

function getProductImage(productName: string): string {
  for (const [key, url] of Object.entries(PRODUCT_IMAGES)) {
    if (productName.includes(key)) return url;
  }
  return "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=400&q=80";
}

// Data for the cheapest camping setup article
const CAMPING_ESSENTIALS = [
  { name: "Coleman Sundome 2P Tent", price: 49.99, category: "Shelter", rating: 4.4, amazonUrl: "https://www.amazon.com/shop/camprally" },
  { name: "Coleman Brazos 30°F Sleeping Bag", price: 24.99, category: "Sleeping Bag", rating: 4.3, amazonUrl: "https://www.amazon.com/shop/camprally" },
  { name: "Klymit Static V Sleeping Pad", price: 44.99, category: "Sleeping Pad", rating: 4.5, amazonUrl: "https://www.amazon.com/shop/camprally" },
  { name: "Stanley Adventure Camp Cook Set", price: 29.99, category: "Cooking", rating: 4.6, amazonUrl: "https://www.amazon.com/shop/camprally" },
  { name: "Etekcity Ultralight Stove", price: 12.99, category: "Stove", rating: 4.4, amazonUrl: "https://www.amazon.com/shop/camprally" },
  { name: "Vont 4-Pack LED Lanterns", price: 14.99, category: "Lighting", rating: 4.6, amazonUrl: "https://www.amazon.com/shop/camprally" },
  { name: "Nalgene 32oz Water Bottle", price: 14.99, category: "Water", rating: 4.7, amazonUrl: "https://www.amazon.com/shop/camprally" },
];

const FREE_CAMPING_SPOTS = [
  { name: "National Forests", detail: "193M acres open to dispersed camping", icon: "🌲" },
  { name: "Bureau of Land Management", detail: "Free, always adventurous", icon: "🏜️" },
  { name: "Crown Lands (Canada)", detail: "Extremely affordable options", icon: "🍁" },
];

const FIRST_TRIP_CHECKLIST = [
  "Tent + rainfly",
  "Sleeping bag + pad",
  "Headlamp + lanterns",
  "Stove + fuel",
  "Water + filtration",
  "Food + cooler",
  "Lighter/matches",
  "First aid kit",
  "Sunscreen",
  "Clothing layers",
];

export async function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = articles.find((a) => a.slug === slug);
  if (!article) return { title: "Article Not Found" };
  return {
    title: `${article.title} | CampRally`,
    description: article.excerpt,
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = articles.find((a) => a.slug === slug);
  if (!article) notFound();

  const related = articles
    .filter((a) => a.slug !== slug && a.category === article.category)
    .slice(0, 3);

  // Handle the cheapest camping setup article with custom magazine layout
  if (slug === "cheapest-camping-setup-for-beginners") {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <Link
          href="/blog"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to all articles
        </Link>

        {/* Hero Section */}
        <div className="relative mb-8 overflow-hidden rounded-2xl">
          <div className="relative h-[400px] w-full">
            <Image
              src={getHeroImage(slug)}
              alt="Camping setup"
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-8">
            <Badge variant="secondary" className="mb-3 bg-camp-green text-white border-0">
              {article.category}
            </Badge>
            <h1 className="mb-2 text-3xl font-bold tracking-tight text-white md:text-5xl">
              {article.title}
            </h1>
            <p className="text-white/80">
              {new Date(article.date).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
          {/* Main Content */}
          <article>
            {/* Intro */}
            <div className="mb-10">
              <p className="text-xl leading-relaxed text-foreground/80 first-letter:text-5xl first-letter:font-bold first-letter:text-camp-green first-letter:float-left first-letter:mr-3 first-letter:mt-1">
                The camping industry wants you to think you need $1,000 in gear to sleep outside.{" "}
                <strong className="text-foreground">You don&apos;t.</strong> Here&apos;s how to camp
                comfortably for under $200.
              </p>
            </div>

            {/* The $200 Challenge - Big Stat Callout */}
            <div className="mb-12 rounded-2xl bg-gradient-to-br from-camp-green/10 to-camp-green/5 p-8 text-center border border-camp-green/20">
              <p className="text-sm font-semibold uppercase tracking-widest text-camp-green mb-2">The Goal</p>
              <p className="text-5xl font-bold text-foreground mb-2">$192.93</p>
              <p className="text-muted-foreground">Complete camping setup for 2 people</p>
            </div>

            {/* The Essential 7 - Product Cards */}
            <div className="mb-12">
              <h2 className="mb-6 flex items-center gap-2 text-2xl font-bold tracking-tight">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-camp-green text-white text-sm">7</span>
                The Essential Items
              </h2>
              <p className="mb-6 text-muted-foreground">
                You genuinely need just seven things to camp. Everything else is optional.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {CAMPING_ESSENTIALS.map((item, i) => (
                  <a
                    key={i}
                    href={item.amazonUrl}
                    target="_blank"
                    rel="nofollow noopener"
                    className="group flex items-center gap-4 rounded-xl border p-4 transition-all hover:border-camp-green/50 hover:shadow-md hover:shadow-camp-green/10"
                  >
                    <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                      <Image
                        src={getProductImage(item.name)}
                        alt={item.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                        <span className="font-medium text-camp-green">{item.category}</span>
                      </div>
                      <p className="font-medium text-sm leading-tight group-hover:text-camp-green transition-colors truncate">
                        {item.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-bold text-camp-green">${item.price}</span>
                        <div className="flex items-center gap-0.5">
                          <Star className="size-3 fill-camp-orange text-camp-orange" />
                          <span className="text-xs text-muted-foreground">{item.rating}</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground group-hover:text-camp-green transition-colors flex-shrink-0" />
                  </a>
                ))}
              </div>
              <div className="mt-6 rounded-xl bg-camp-green/10 border border-camp-green/20 p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Total for all 7 items:{" "}
                  <span className="font-bold text-camp-green text-lg">
                    ${CAMPING_ESSENTIALS.reduce((sum, item) => sum + item.price, 0).toFixed(2)}
                  </span>
                </p>
              </div>
            </div>

            {/* What You Can Skip */}
            <div className="mb-12">
              <h2 className="mb-6 text-2xl font-bold tracking-tight">What You Can Skip</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { item: "Camp chairs", tip: "Sit on a log or rock" },
                  { item: "Portable tables", tip: "Use a flat rock or tailgate" },
                  { item: "Expensive cookware", tip: "The Stanley nested set does everything" },
                  { item: "Fancy lanterns", tip: "$14 Vont lanterns work great" },
                  { item: "GPS", tip: "Your phone works fine with offline maps" },
                ].map((skip, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
                    <TrendingDown className="size-4 text-camp-orange mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm">{skip.item}</p>
                      <p className="text-xs text-muted-foreground">{skip.tip}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Where to Save vs Splurge */}
            <div className="mb-12">
              <h2 className="mb-6 text-2xl font-bold tracking-tight">Where to Save vs. Splurge</h2>
              <div className="space-y-4">
                <div className="rounded-xl border border-camp-green/30 bg-camp-green/5 p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown className="size-5 text-camp-green" />
                    <h3 className="font-bold text-lg">Save: Tent</h3>
                  </div>
                  <p className="text-muted-foreground">
                    The $50 Sundome outperforms tents 3x its price in weather protection. Don&apos;t overthink this.
                  </p>
                </div>
                <div className="rounded-xl border border-camp-orange/30 bg-camp-orange/5 p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="size-5 text-camp-orange" />
                    <h3 className="font-bold text-lg">Splurge: Sleeping Bag</h3>
                  </div>
                  <p className="text-muted-foreground">
                    Your sleeping bag is the most personal item. The Brazos is decent, but if you camp in colder weather,
                    consider the Teton Sports Celsius (rated to 0°F) for $34.99.
                  </p>
                </div>
                <div className="rounded-xl border border-camp-green/30 bg-camp-green/5 p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown className="size-5 text-camp-green" />
                    <h3 className="font-bold text-lg">Save: Stove</h3>
                  </div>
                  <p className="text-muted-foreground">
                    The Etekcity canister stove at $12.99 boils water in 3 minutes. Expensive stoves do the same thing
                    30 seconds faster. Not worth the money.
                  </p>
                </div>
              </div>
            </div>

            {/* Free Camping Spots */}
            <div className="mb-12">
              <h2 className="mb-6 text-2xl font-bold tracking-tight">Free Camping Spots</h2>
              <p className="text-muted-foreground mb-6">
                Once you have gear, finding free places to camp is the real hack:
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                {FREE_CAMPING_SPOTS.map((spot, i) => (
                  <div key={i} className="rounded-xl border bg-card p-5 text-center">
                    <span className="text-3xl mb-3 block">{spot.icon}</span>
                    <p className="font-bold text-sm mb-1">{spot.name}</p>
                    <p className="text-xs text-muted-foreground">{spot.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* First Trip Checklist */}
            <div className="mb-12">
              <h2 className="mb-6 text-2xl font-bold tracking-tight">First Trip Checklist</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {FIRST_TRIP_CHECKLIST.map((item, i) => (
                  <label key={i} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                    <input type="checkbox" className="h-4 w-4 rounded border-camp-green text-camp-green focus:ring-camp-green" />
                    <span className="text-sm">{item}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Final CTA */}
            <div className="rounded-2xl bg-gradient-to-br from-camp-green/10 via-camp-green/5 to-transparent border border-camp-green/20 p-8 text-center">
              <h3 className="text-xl font-bold mb-2">Ready to Start?</h3>
              <p className="text-muted-foreground mb-4">
                Shop our complete budget setup on Amazon. Everything you need, nothing you don&apos;t.
              </p>
              <a
                href="https://www.amazon.com/shop/camprally"
                target="_blank"
                rel="nofollow noopener"
                className="inline-flex items-center gap-2 rounded-lg bg-camp-green px-6 py-3 font-semibold text-white transition hover:bg-camp-green/90"
              >
                Shop the Full Setup on Amazon
                <ExternalLink className="size-4" />
              </a>
            </div>
          </article>

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* Quick Stats */}
            <Card className="border-camp-green/20 bg-gradient-to-br from-camp-green/5 to-transparent">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-center">
                  <p className="text-3xl font-bold text-camp-green">$192.93</p>
                  <p className="text-xs text-muted-foreground">Total Setup Cost</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-card p-2">
                    <p className="text-lg font-bold">7</p>
                    <p className="text-xs text-muted-foreground">Items Needed</p>
                  </div>
                  <div className="rounded-lg bg-card p-2">
                    <p className="text-lg font-bold">2</p>
                    <p className="text-xs text-muted-foreground">People</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Related Articles */}
            {related.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Related Articles</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {related.map((r) => (
                    <Link
                      key={r.slug}
                      href={`/blog/${r.slug}`}
                      className="block text-sm text-muted-foreground transition hover:text-foreground"
                    >
                      {r.title}
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Newsletter */}
            <Card className="border-camp-green/20 bg-gradient-to-br from-camp-green/5 to-transparent">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Get Weekly Gear Picks</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  Join 2,847 campers getting our best budget gear recommendations.
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="your@email.com"
                    className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
                  />
                  <button className="rounded-lg bg-camp-green px-3 py-2 text-sm font-semibold text-white">
                    →
                  </button>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    );
  }

  // Default article page for all other articles
  return <DefaultArticlePage article={article} related={related} />;
}

function DefaultArticlePage({ article, related }: { article: typeof articles[0]; related: typeof articles }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <Link
        href="/blog"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to all articles
      </Link>

      <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
        <article>
          <header className="mb-8">
            <Badge variant="secondary" className="mb-3">
              {article.category}
            </Badge>
            <h1 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">
              {article.title}
            </h1>
            <p className="text-muted-foreground">
              {new Date(article.date).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </header>

          {/* Hero Image for default articles */}
          <div className="relative mb-8 h-[300px] w-full overflow-hidden rounded-xl">
            <Image
              src={getHeroImage(article.slug)}
              alt={article.title}
              fill
              className="object-cover"
              priority
            />
          </div>

          {/* Article Body */}
          <div
            className="prose prose-stone max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:mt-8 prose-h2:mb-4 prose-h2:text-2xl prose-h3:mt-6 prose-h3:mb-3 prose-h3:text-xl prose-p:leading-7 prose-a:text-camp-green prose-a:font-medium prose-a:no-underline hover:prose-a:underline prose-li:leading-7 first-letter:text-5xl first-letter:font-bold first-letter:text-camp-green first-letter:float-left first-letter:mr-3 first-letter:mt-1"
            dangerouslySetInnerHTML={{ __html: article.content }}
          />
        </article>

        <aside className="space-y-6">
          {related.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Related Articles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {related.map((r) => (
                  <Link
                    key={r.slug}
                    href={`/blog/${r.slug}`}
                    className="block text-sm text-muted-foreground transition hover:text-foreground"
                  >
                    {r.title}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
