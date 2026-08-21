import type { FactSheetEntry } from "@/lib/facts/registry";

const BASE = "https://voltcheck.net";

// FAQPage + BreadcrumbList only, per the publication-shape recommendation
// (docs/agents/factsheet-queries-2026-08-20.md §4): no Product/Vehicle
// schema here, since a fact sheet has no priced, VIN'd offer — that belongs
// on web/app/listing/[id]. The FAQ text is plain sentences with no links or
// footnote markers, kept in lib/facts/registry.ts so it can be reviewed
// alongside the page's own content instead of derived automatically; it
// must never say more than what's rendered on the page.
export function FactJsonLd({ entry, path }: { entry: FactSheetEntry; path: string }) {
  const url = `${BASE}${path}`;
  const json = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        url,
        dateModified: entry.dateModified,
        mainEntity: entry.faq.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Voltcheck", item: BASE },
          { "@type": "ListItem", position: 2, name: "Fact sheets", item: `${BASE}/facts` },
          { "@type": "ListItem", position: 3, name: entry.breadcrumbLabel, item: url },
        ],
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}
