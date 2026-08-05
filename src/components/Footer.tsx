import Link from "next/link"
import { Mountain } from "lucide-react"
import { populatedGroups } from "@/data/categories"

export default function Footer() {
  const groups = populatedGroups()

  return (
    <footer className="mt-auto border-t border-camp-stone bg-camp-bone">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="max-w-sm">
            <Link href="/" className="flex items-center gap-2">
              <Mountain className="size-6 text-camp-green" strokeWidth={2.25} />
              <span className="font-display text-xl font-bold tracking-[-0.02em] text-camp-green">
                CampRally
              </span>
            </Link>
            <p className="mt-3 text-meta leading-relaxed text-muted-foreground">
              Field-tested budget camping gear, reviewed honestly and priced
              live. We would rather show you nothing than show you a wrong
              number.
            </p>
          </div>

          <div>
            <p className="eyebrow mb-4 text-foreground">Shop</p>
            <ul className="space-y-2.5">
              {groups.slice(0, 5).map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`/blog?category=${g.slug}`}
                    className="link-wipe text-meta text-muted-foreground transition-colors hover:text-camp-green"
                  >
                    {g.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="eyebrow mb-4 text-foreground">CampRally</p>
            <ul className="space-y-2.5">
              {[
                { href: "/blog", label: "All guides" },
                { href: "/about", label: "How we test" },
                { href: "/privacy", label: "Privacy policy" },
                { href: "/terms", label: "Terms of use" },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="link-wipe text-meta text-muted-foreground transition-colors hover:text-camp-green"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-camp-stone pt-6 text-xs text-muted-foreground md:flex-row md:justify-between">
          <p>&copy; 2026 CampRally. All rights reserved.</p>
          <p>
            As an Amazon Associate, CampRally earns from qualifying purchases.
          </p>
        </div>
      </div>
    </footer>
  )
}
