// The listing page's schema.org node, serialized. Same shape as
// components/facts/FactJsonLd.tsx — one <script type="application/ld+json">,
// built by a pure function so a test can read the object rather than parse
// HTML. What may and may not go in it is lib/listings/jsonLd.ts's comment.
export function JsonLd({ json }: { json: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}
