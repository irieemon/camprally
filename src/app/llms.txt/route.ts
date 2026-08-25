import { articles, byNewest } from "@/data/articles";
import { articlesInGroup, populatedGroups } from "@/data/categories";
import { SITE_URL, SITE_NAME } from "@/lib/site";

/**
 * /llms.txt — the site, in the form an answer engine can read in one request.
 *
 * A route handler rather than a file in public/, for the same reason sitemap.ts
 * is generated: it is built from `articles` and `categoryGroups`, so it cannot
 * fall behind a corpus that grows daily. A static copy would be stale by the
 * next publish cycle and nobody would notice, because nothing on the site links
 * to it.
 *
 * `force-static` so it is emitted at build time like everything else here and
 * costs nothing to serve.
 *
 * Scope is deliberately modest: what this site is, how it is put together, and
 * every URL with the one-line description that already exists as the article's
 * meta description. It is not a mirror of the content — an answer engine that
 * wants the article can fetch the article, and the guides are fully
 * server-rendered, so there is nothing hidden from it there.
 */
export const dynamic = "force-static";

export function GET() {
  const groups = populatedGroups();
  const sorted = [...articles].sort(byNewest);

  const lines: string[] = [
    `# ${SITE_NAME}`,
    "",
    "> Budget camping gear guides. Independent, reader-funded through Amazon",
    "> affiliate links, and written for people outfitting a first trip without",
    "> spending what a gear shop would like them to.",
    "",
    "## About this site",
    "",
    `- ${sorted.length} guides, published roughly daily.`,
    "- Recommendations are research-led. We do not test gear ourselves and do",
    "  not claim to; guides are built from manufacturer specs, long-run owner",
    "  reports and recurring field complaints.",
    "- Every draft is screened against fixed safety rules — combustion inside a",
    "  shelter, heaters running while asleep, cotton as cold-weather insulation,",
    "  untreated water, food stored in a tent — and blocked if it trips one.",
    "- Drafts are then reviewed by an independent panel of models from different",
    "  families; a flaw two of them agree on blocks publication.",
    "- Prices are re-checked daily and shown only while verifiably current. A",
    "  guide shows no price rather than a stale one.",
    "- Product links are Amazon affiliate links, marked rel=\"sponsored\".",
    "",
    "## Categories",
    "",
    ...groups.map(
      (g) =>
        `- [${g.name}](${SITE_URL}/blog/category/${g.slug}) (${articlesInGroup(g.slug).length}) — ${g.description}`,
    ),
    "",
    "## Guides",
    "",
    ...sorted.map(
      (a) => `- [${a.title}](${SITE_URL}/blog/${a.slug}) — ${a.excerpt}`,
    ),
    "",
    "## Pages",
    "",
    `- [All guides](${SITE_URL}/blog)`,
    `- [About and editorial method](${SITE_URL}/about)`,
    `- [Privacy](${SITE_URL}/privacy)`,
    `- [Terms](${SITE_URL}/terms)`,
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
