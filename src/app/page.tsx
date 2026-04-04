import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { articles } from "@/data/articles";
import { Tent, Flame, Mountain, Compass, TreePine, Sun } from "lucide-react";

const featuredSlugs = [
  "best-budget-tents-under-100",
  "cheapest-camping-setup-beginners",
  "best-budget-sleeping-bags-cold-weather",
  "budget-camping-cookware",
  "how-to-start-camping-no-gear",
  "budget-camping-hacks",
];

const categories = [
  { name: "Tents & Shelter", icon: Tent, href: "/blog?category=Tents" },
  { name: "Sleep Systems", icon: Sun, href: "/blog?category=Sleep+Systems" },
  { name: "Cooking Gear", icon: Flame, href: "/blog?category=Cooking" },
  { name: "Navigation", icon: Compass, href: "/blog?category=Navigation" },
  { name: "Tips & Hacks", icon: Mountain, href: "/blog?category=Tips" },
  { name: "Tools & Gear", icon: TreePine, href: "/blog?category=Tools" },
];

export default function Home() {
  const featured = articles.filter((a) => featuredSlugs.includes(a.slug));

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative bg-camp-green px-4 py-20 text-center md:py-28">
        <div className="mx-auto max-w-3xl">
          <Mountain className="mx-auto mb-4 size-12 text-camp-cream opacity-80" />
          <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl lg:text-6xl">
            Smart Camping for Every Budget
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-camp-cream/90">
            Honest reviews and practical guides to help you get outdoors without
            breaking the bank. Gear up smart, camp happy.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/blog"
              className="inline-flex h-11 items-center rounded-lg bg-white px-6 font-medium text-camp-green transition hover:bg-camp-cream"
            >
              Browse All Guides
            </Link>
            <Link
              href="/about"
              className="inline-flex h-11 items-center rounded-lg border border-white/30 px-6 font-medium text-white transition hover:bg-white/10"
            >
              Why CampRally?
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Articles */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <h2 className="mb-2 text-center text-3xl font-bold text-foreground">
          Top Gear Guides
        </h2>
        <p className="mb-10 text-center text-muted-foreground">
          Our most popular budget camping guides
        </p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((article) => (
            <Link key={article.slug} href={`/blog/${article.slug}`}>
              <Card className="h-full transition hover:shadow-md hover:-translate-y-0.5">
                <CardHeader>
                  <div className="mb-1">
                    <Badge variant="secondary">{article.category}</Badge>
                  </div>
                  <CardTitle className="line-clamp-2 text-lg">
                    {article.title}
                  </CardTitle>
                  <CardDescription className="line-clamp-2">
                    {article.excerpt}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="text-sm text-muted-foreground">
                    {new Date(article.date).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link
            href="/blog"
            className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            View All Articles
          </Link>
        </div>
      </section>

      {/* Why Camp Lean */}
      <section className="bg-camp-cream px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-10 text-center text-3xl font-bold text-foreground">
            Why Camp Lean?
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                title: "Tested on Real Trails",
                desc: "Every recommendation comes from actual camping experience. We test gear in real conditions so you don't have to gamble with your money.",
              },
              {
                title: "Budget-First Philosophy",
                desc: "You don't need $500 tents to enjoy the outdoors. We find the sweet spot between price and quality for every piece of gear.",
              },
              {
                title: "Beginner Friendly",
                desc: "New to camping? We break down the jargon and tell you exactly what you need — and what you can skip.",
              },
            ].map((item) => (
              <div key={item.title} className="text-center">
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-camp-green/10">
                  <TreePine className="size-6 text-camp-green" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <h2 className="mb-2 text-center text-3xl font-bold text-foreground">
          Browse by Category
        </h2>
        <p className="mb-10 text-center text-muted-foreground">
          Find the gear guides you need
        </p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {categories.map((cat) => (
            <Link
              key={cat.name}
              href={cat.href}
              className="flex flex-col items-center gap-2 rounded-xl border bg-card p-5 text-center transition hover:shadow-md hover:-translate-y-0.5"
            >
              <cat.icon className="size-8 text-camp-green" />
              <span className="text-sm font-medium">{cat.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Newsletter */}
      <section className="bg-camp-brown px-4 py-16 text-center text-white">
        <div className="mx-auto max-w-lg">
          <h2 className="mb-3 text-3xl font-bold">Stay Trail-Ready</h2>
          <p className="mb-6 text-camp-cream/80">
            Get our best budget gear picks and camping tips delivered to your
            inbox. No spam, just trail-tested advice.
          </p>
          <form
            className="flex flex-col gap-3 sm:flex-row"
            action="#"
          >
            <input
              type="email"
              placeholder="your@email.com"
              className="h-11 flex-1 rounded-lg border border-white/20 bg-white/10 px-4 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/30"
            />
            <button
              type="submit"
              className="h-11 rounded-lg bg-camp-orange px-6 font-medium text-white transition hover:bg-camp-orange/90"
            >
              Subscribe
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
