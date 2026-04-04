import type { Metadata } from "next";
import { Mountain, Shield, DollarSign, Heart } from "lucide-react";

export const metadata: Metadata = {
  title: "About CampRally | Budget Camping Gear Reviews",
  description:
    "Learn about CampRally's mission to make camping accessible and affordable for everyone.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
        About CampRally
      </h1>
      <p className="mb-10 text-lg text-muted-foreground">
        Making the great outdoors accessible to every budget.
      </p>

      {/* Mission */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Our Mission</h2>
        <p className="mb-4 leading-7 text-foreground/85">
          CampRally was born from a simple frustration: too many camping gear
          sites push expensive gear that beginners don&apos;t need. We watched
          friends give up on camping before they even started because they
          thought they needed a $400 tent and $200 sleeping bag just to spend a
          night under the stars.
        </p>
        <p className="mb-4 leading-7 text-foreground/85">
          The truth? You can build a complete, reliable camping setup for under
          $200. You just need to know where to look and what actually matters.
          That&apos;s where we come in.
        </p>
        <p className="leading-7 text-foreground/85">
          We test budget camping gear in real conditions — not in a lab, not in a
          studio — on actual trails and campsites. Then we write honest reviews
          so you can make informed decisions without the marketing fluff.
        </p>
      </section>

      {/* Why Trust Us */}
      <section className="mb-12">
        <h2 className="mb-6 text-2xl font-bold">Why Trust Us?</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {[
            {
              icon: Mountain,
              title: "Real Experience",
              desc: "Our recommendations come from years of camping across national forests, state parks, and backcountry sites. We use the gear we review.",
            },
            {
              icon: DollarSign,
              title: "Budget-First Approach",
              desc: "We don't review gear we wouldn't buy ourselves on a budget. If it costs more than it should, we'll tell you — and suggest a cheaper alternative.",
            },
            {
              icon: Shield,
              title: "Honest Reviews",
              desc: "We disclose all affiliate relationships. When a product has flaws, we list them. Our reputation matters more than any commission.",
            },
            {
              icon: Heart,
              title: "Beginner Focused",
              desc: "Every article is written with new campers in mind. No gatekeeping, no jargon without explanation, no assumptions about your experience level.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border bg-card p-5">
              <item.icon className="mb-3 size-6 text-camp-green" />
              <h3 className="mb-2 font-semibold">{item.title}</h3>
              <p className="text-sm leading-6 text-muted-foreground">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Affiliate Disclosure */}
      <section className="rounded-lg bg-camp-cream p-6">
        <h2 className="mb-3 text-lg font-bold">Affiliate Disclosure</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          CampRally is a participant in the Amazon Services LLC Associates
          Program, an affiliate advertising program designed to provide a means
          for sites to earn advertising fees by advertising and linking to
          Amazon.com. This means we may earn a small commission when you purchase
          through our links at no extra cost to you. These commissions help us
          keep creating free content and testing new gear. We only recommend
          products we genuinely believe in.
        </p>
      </section>
    </div>
  );
}
