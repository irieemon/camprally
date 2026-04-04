import Link from "next/link"

export default function Footer() {
  return (
    <footer className="border-t border-camp-brown/20 bg-muted">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col items-center gap-6 text-center md:flex-row md:justify-between md:text-left">
          {/* Branding */}
          <div>
            <p className="text-lg font-bold text-camp-green">CampRally</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your trusted guide to the best camping gear.
            </p>
          </div>

          {/* Footer links */}
          <div className="flex gap-6">
            <Link
              href="/privacy"
              className="text-sm text-muted-foreground transition-colors hover:text-camp-green"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-sm text-muted-foreground transition-colors hover:text-camp-green"
            >
              Terms of Use
            </Link>
          </div>
        </div>

        {/* Disclaimers */}
        <div className="mt-8 border-t border-camp-brown/10 pt-6 text-center text-xs text-muted-foreground">
          <p>&copy; 2026 CampRally. All rights reserved.</p>
          <p className="mt-2">
            As an Amazon Associate, CampRally earns from qualifying purchases.
          </p>
        </div>
      </div>
    </footer>
  )
}
