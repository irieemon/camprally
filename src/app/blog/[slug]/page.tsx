import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { articles } from "@/data/articles";
import { products } from "@/data/products";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ExternalLink, Star } from "lucide-react";

interface Props {
  params: Promise<{ slug: string }>;
}

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

  const categoryProducts = products.filter(
    (p) => p.category === article.category
  );

  const related = articles
    .filter((a) => a.slug !== slug && a.category === article.category)
    .slice(0, 3);

  const headings = article.content.match(/<h2[^>]*>(.*?)<\/h2>/g) || [];
  const toc = headings.map((h) => {
    const text = h.replace(/<[^>]+>/g, "");
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return { text, id };
  });

  const contentWithIds = article.content.replace(
    /<h2([^>]*)>(.*?)<\/h2>/g,
    (_match, attrs, text) => {
      const id = text
        .replace(/<[^>]+>/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      return `<h2${attrs} id="${id}">${text}</h2>`;
    }
  );

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
        {/* Main Content */}
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

          {/* Table of Contents */}
          {toc.length > 0 && (
            <nav className="mb-8 rounded-lg border bg-card p-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                In This Article
              </h2>
              <ul className="space-y-1">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="text-sm text-camp-green-light transition hover:text-camp-green hover:underline"
                    >
                      {item.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {/* Article Body */}
          <div
            className="prose prose-stone max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:mt-8 prose-h2:mb-4 prose-h2:text-2xl prose-h3:mt-6 prose-h3:mb-3 prose-h3:text-xl prose-p:leading-7 prose-a:text-camp-green prose-a:font-medium prose-a:no-underline hover:prose-a:underline prose-li:leading-7 [&_h2]:text-foreground [&_h3]:text-foreground [&_p]:text-foreground/85 [&_li]:text-foreground/85 [&_a]:text-camp-green-light"
            dangerouslySetInnerHTML={{ __html: contentWithIds }}
          />
        </article>

        {/* Sidebar */}
        <aside className="space-y-6">
          {/* Products Mentioned */}
          {categoryProducts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Products Mentioned</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {categoryProducts.slice(0, 5).map((product) => (
                  <div
                    key={product.id}
                    className="flex flex-col gap-1 border-b pb-3 last:border-0 last:pb-0"
                  >
                    <span className="text-sm font-medium">{product.name}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5">
                        <Star className="size-3 fill-camp-orange text-camp-orange" />
                        <span className="text-xs text-muted-foreground">
                          {product.rating}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-camp-green">
                        ${product.price}
                      </span>
                    </div>
                    <a
                      href={product.amazonUrl}
                      target="_blank"
                      rel="nofollow noopener"
                      className="inline-flex items-center gap-1 text-xs text-camp-green-light transition hover:text-camp-green hover:underline"
                    >
                      View on Amazon
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

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
        </aside>
      </div>
    </div>
  );
}
