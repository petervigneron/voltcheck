import { FACT_SHEETS } from "@/lib/facts/registry";
import { SPEC_HUBS, specPath } from "@/lib/facts/specs";
import { BASE, type SitemapEntry, renderUrlset } from "@/lib/sitemap";

// The fact sheets and spec pages in a sitemap of their own, listed first in
// robots.txt and the index (lib/sitemap.ts FACTS_SITEMAP_URL has the reason).
// A static folder beats the [shard] segment beside it, so this never reaches
// that route's feed walk: it reads only the compiled-in registries and is
// prerendered at build.
export const dynamic = "force-static";

export function GET() {
  const entries: SitemapEntry[] = [
    { url: `${BASE}/facts`, changeFrequency: "monthly", priority: 0.5 },
    // lastModified is the sheet's audit date, the same one its JSON-LD
    // carries and the same one shard 0 prints for it.
    ...FACT_SHEETS.map((s) => ({
      url: `${BASE}/facts/${s.make}/${s.model}/${s.topic}`,
      lastModified: new Date(s.dateModified),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...SPEC_HUBS.map((h) => ({
      url: `${BASE}${specPath(h)}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
  return new Response(renderUrlset(entries, "sitemap/facts.xml"), {
    headers: { "Content-Type": "application/xml" },
  });
}
