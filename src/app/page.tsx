import Link from "next/link";
import Image from "next/image";
import { articles } from "@/data/articles";
import { populatedGroups, groupCounts } from "@/data/categories";
import { getHeroImage } from "@/data/heroes";
import ArticleCard from "@/components/ArticleCard";
import NewsletterForm from "@/components/NewsletterForm";
import {
  Tent, Flame, Compass, Map as MapIcon, Moon, Shirt, Armchair, ShieldPlus,
  BadgeCheck, Wallet, Sprout, ArrowRight,
} from "lucide-react";

// Aliased on import: lucide exports a `Map` icon, which shadows the global Map
// constructor used below and turns `new Map(...)` into a type error.
const ICONS = { Tent, Flame, Compass, Map: MapIcon, Moon, Shirt, Armchair, ShieldPlus };

/* Slugs the homepage leads with. Filtered against the real article list below,
 * because the previous hardcoded list had drifted — three of its six slugs no
 * longer existed and the grid silently rendered half empty. */
const featuredSlugs = [
  "best-budget-tents-under-100",
  "cheapest-camping-setup-for-beginners",
  "best-budget-sleeping-bags-cold-weather",
  "budget-camping-cookware-that-works",
  "how-to-start-camping-no-gear",
  "budget-camping-hacks-that-work",
];

const PROMISES = [
  {
    icon: BadgeCheck,
    title: "Field-tested picks",
    desc: "Every recommendation comes from real trail time, not a spec sheet skim.",
  },
  {
    icon: Wallet,
    title: "Live prices",
    desc: "Prices are re-checked daily. If we can't verify one, we show you nothing rather than a stale number.",
  },
  {
    icon: Sprout,
    title: "Beginner-first",
    desc: "No jargon. We tell you what to buy, and just as often, what to skip.",
  },
];

export default function Home() {
  const bySlug = new Map(articles.map((a) => [a.slug, a]));
  const featured = featuredSlugs
    .map((s) => bySlug.get(s))
    .filter((a) => a !== undefined);
  /* Backfill from the newest articles if a featured slug has been retired, so
   * the grid is always a full three columns. */
  const filler = articles
    .filter((a) => !featuredSlugs.includes(a.slug))
    .sort((a, b) => b.date.localeCompare(a.date));
  const lead = [...featured, ...filler].slice(0, 6);

  const groups = populatedGroups();
  const counts = groupCounts();
  const heroArticle = lead[0];

  return (
    <div className="flex flex-col">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative isolate flex min-h-[clamp(30rem,68vh,44rem)] items-end overflow-hidden">
        <Image
          src={getHeroImage("best-budget-tents-under-100")}
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover"
        />
        {/* Two stacked scrims: a bottom-up ramp for the text block and a light
            left-to-right wash, so the headline holds contrast regardless of
            what the photograph is doing behind it. */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-camp-ink via-camp-ink/55 to-camp-ink/10" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-camp-ink/70 to-transparent" />

        <div className="mx-auto w-full max-w-6xl px-4 pb-14 pt-28 md:pb-20">
          <p className="eyebrow mb-4 text-white/75">Smart camping for every budget</p>
          <h1 className="max-w-3xl text-display text-balance text-white">
            Great gear costs less than they told you
          </h1>
          <p className="mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-white/85">
            Honest reviews and practical guides that get you outdoors without
            wrecking your budget — with prices checked daily.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/blog"
              className="inline-flex h-12 items-center justify-center gap-2 bg-camp-ember px-7 font-semibold text-white transition-colors hover:bg-camp-ember-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Shop the guides
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/about"
              className="inline-flex h-12 items-center justify-center border border-white/40 px-7 font-semibold text-white transition-colors hover:bg-white/10"
            >
              How we test
            </Link>
          </div>
        </div>
      </section>

      {/* ── Category rail ────────────────────────────────────────────────── */}
      <section className="border-b border-camp-stone bg-camp-bone">
        <div className="mx-auto w-full max-w-6xl px-4 py-10">
          <div className="mb-6 flex items-end justify-between gap-4">
            <h2 className="text-h3 text-foreground">Shop by category</h2>
            <Link
              href="/blog"
              className="link-wipe hidden text-meta font-medium text-camp-green sm:inline"
            >
              View all guides &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden border border-camp-stone bg-camp-stone sm:grid-cols-4">
            {groups.map((g) => {
              const Icon = ICONS[g.icon as keyof typeof ICONS] ?? Tent;
              return (
                <Link
                  key={g.slug}
                  href={`/blog?category=${g.slug}`}
                  className="group flex flex-col gap-2 bg-background p-5 transition-colors hover:bg-camp-bone-deep"
                >
                  <Icon
                    className="size-6 text-camp-green transition-transform duration-200 group-hover:-translate-y-0.5"
                    strokeWidth={1.75}
                  />
                  <span className="text-[0.9375rem] font-semibold leading-tight text-foreground">
                    {g.name}
                  </span>
                  <span className="text-meta text-muted-foreground">
                    {counts.get(g.slug)} {counts.get(g.slug) === 1 ? "guide" : "guides"}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Featured guides ──────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 md:py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-2 text-camp-green">Most popular</p>
            <h2 className="text-h2 text-foreground">Top gear guides</h2>
          </div>
          <Link
            href="/blog"
            className="inline-flex h-11 items-center border border-camp-stone px-5 text-[0.9375rem] font-semibold text-foreground transition-colors hover:border-camp-green hover:text-camp-green"
          >
            View all {articles.length} guides
          </Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {lead.map((article, i) => (
            <ArticleCard key={article.slug} article={article} priority={i < 3} />
          ))}
        </div>
      </section>

      {/* ── Editorial split ──────────────────────────────────────────────── */}
      {heroArticle && (
        <section className="border-y border-camp-stone bg-camp-bone">
          <div className="mx-auto grid w-full max-w-6xl items-stretch gap-0 px-4 py-0 md:grid-cols-2">
            <div className="relative min-h-[18rem] md:min-h-[26rem]">
              <Image
                src={getHeroImage(heroArticle.slug)}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
            <div className="flex flex-col justify-center gap-4 py-10 md:py-14 md:pl-12">
              <p className="eyebrow text-camp-green">Start here</p>
              <h2 className="text-h2 text-balance text-foreground">
                {heroArticle.title}
              </h2>
              <p className="max-w-prose text-[1.0625rem] leading-relaxed text-muted-foreground">
                {heroArticle.excerpt}
              </p>
              <div>
                <Link
                  href={`/blog/${heroArticle.slug}`}
                  className="mt-2 inline-flex h-12 items-center gap-2 bg-camp-green px-7 font-semibold text-white transition-colors hover:bg-camp-green-deep"
                >
                  Read the guide
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Promises ─────────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 md:py-20">
        <p className="eyebrow mb-2 text-camp-green">Why CampRally</p>
        <h2 className="mb-10 max-w-2xl text-h2 text-balance text-foreground">
          We would rather show you nothing than show you a wrong price
        </h2>
        <div className="grid gap-10 md:grid-cols-3">
          {PROMISES.map((item) => (
            <div key={item.title} className="border-t-2 border-camp-green pt-5">
              <item.icon className="mb-3 size-6 text-camp-green" strokeWidth={1.75} />
              <h3 className="mb-2 text-h3 text-foreground">{item.title}</h3>
              <p className="text-meta leading-relaxed text-muted-foreground">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Newsletter ───────────────────────────────────────────────────── */}
      <section className="bg-camp-green-deep px-4 py-16 md:py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-8 md:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="eyebrow mb-3 text-white/70">The dispatch</p>
            <h2 className="text-h2 text-balance text-white">Stay trail-ready</h2>
            <p className="mt-3 max-w-md text-[1.0625rem] leading-relaxed text-white/80">
              Our best budget gear picks and camping tips, every week. No spam,
              just trail-tested advice.
            </p>
          </div>
          <div>
            <NewsletterForm />
          </div>
        </div>
      </section>
    </div>
  );
}
