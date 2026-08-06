import type { Metadata } from "next";

/**
 * Metadata carrier for the blog index.
 *
 * page.tsx is a Client Component — it runs the search box and category filter
 * off useSearchParams — and `metadata` exports are only honoured in Server
 * Components. Without this layout the index inherits the root metadata and has
 * no canonical of its own, so it competes with the homepage rather than
 * standing as the hub for 30 articles.
 */
export const metadata: Metadata = {
  title: "All Guides | CampRally",
  description:
    "Every CampRally guide in one place — budget gear reviews, beginner how-tos and practical camping advice, searchable by category.",
  alternates: { canonical: "/blog" },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
