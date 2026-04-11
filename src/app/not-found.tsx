import Link from "next/link";
import { Mountain, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-camp-green flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-bold text-white/20 mb-4">404</div>
        <Mountain className="mx-auto mb-6 size-16 text-camp-cream/80" />
        <h1 className="text-3xl font-bold text-white mb-3">
          Campsite Not Found
        </h1>
        <p className="text-lg text-camp-cream/80 mb-8">
          Looks like this trail leads nowhere. The page you're looking for might
          have been moved, deleted, or never existed.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-lg bg-white px-6 font-medium text-camp-green transition hover:bg-camp-cream"
          >
            <Home className="mr-2 size-4" />
            Back to CampRally
          </Link>
          <Link
            href="/blog"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-white/30 px-6 font-medium text-white transition hover:bg-white/10"
          >
            Browse Gear Guides
          </Link>
        </div>
        <p className="mt-12 text-sm text-camp-cream/50">
          Pro tip: Start with our{" "}
          <Link href="/blog/best-budget-tents-under-100" className="underline hover:text-camp-cream">
            budget tent guide
          </Link>{" "}
          — it's a reader favorite.
        </p>
      </div>
    </div>
  );
}
