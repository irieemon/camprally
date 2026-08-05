"use client"

import { useState } from "react"
import Link from "next/link"
import { Mountain, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

/* Groups rather than raw article categories — the raw list is mostly
 * one-article dead ends. See src/data/categories.ts. */
const navLinks = [
  { href: "/blog", label: "All Guides" },
  { href: "/blog?category=shelter", label: "Shelter" },
  { href: "/blog?category=sleep", label: "Sleep" },
  { href: "/blog?category=cooking", label: "Cooking" },
  { href: "/blog?category=planning", label: "Tips" },
  { href: "/about", label: "About" },
]

export default function Navigation() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Promo rail. Deliberately outside the sticky header: pinned, its copy
          wrapped to two lines on a phone and the fixed chrome ate ~110px of an
          844px viewport. It scrolls away; the nav stays. */}
      <div className="bg-camp-green-deep px-4 py-2 text-center">
        <p className="truncate text-eyebrow uppercase text-white/85">
          Field-tested gear
          <span className="hidden sm:inline"> &middot; Prices checked daily</span>
        </p>
      </div>

      <header className="sticky top-0 z-40 w-full border-b border-camp-stone bg-background/95 backdrop-blur-sm">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-camp-green"
        >
          <Mountain className="size-6 text-camp-green" strokeWidth={2.25} />
          <span className="font-display text-xl font-bold tracking-[-0.02em] text-camp-green">
            CampRally
          </span>
        </Link>

        <ul className="hidden items-center gap-7 md:flex">
          {navLinks.map((link) => (
            <li key={link.label}>
              <Link
                href={link.href}
                className="link-wipe text-[0.9375rem] font-medium text-foreground transition-colors hover:text-camp-green"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Open menu" />
              }
            >
              <Menu className="size-5 text-foreground" />
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>
                  <Link
                    href="/"
                    className="flex items-center gap-2"
                    onClick={() => setOpen(false)}
                  >
                    <Mountain className="size-5 text-camp-green" strokeWidth={2.25} />
                    <span className="font-display text-lg font-bold text-camp-green">
                      CampRally
                    </span>
                  </Link>
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1 px-4">
                {navLinks.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="border-b border-camp-stone py-3 text-base font-medium text-foreground transition-colors hover:text-camp-green"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
      </header>
    </>
  )
}
