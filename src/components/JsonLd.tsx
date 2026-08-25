/**
 * Renders a JSON-LD `@graph`.
 *
 * A component rather than an inline <script> per route for two reasons: it
 * removes four copies of the dangerouslySetInnerHTML incantation, and it gives
 * one place to escape `<`, which the previous inline version on the article
 * page did not do. Nothing in the current data can produce a `</script>` — the
 * strings are article titles and product labels — but "nothing can today" is
 * how injection holes are described the day before they open, and the fix is
 * one replace.
 *
 * Must stay a Server Component: `@/lib/structured-data` imports the product
 * catalog, and marking this "use client" would drag the whole catalog back into
 * the browser bundle that /blog just got rid of.
 */
export default function JsonLd({ nodes }: { nodes: unknown[] }) {
  const graph = {
    "@context": "https://schema.org",
    "@graph": nodes.filter(Boolean),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, "\\u003c"),
      }}
    />
  );
}
