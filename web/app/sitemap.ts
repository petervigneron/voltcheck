import type { MetadataRoute } from "next";
import { allListings } from "@/lib/listings/source";
import { FACT_SHEETS } from "@/lib/facts/registry";

const BASE = "https://voltcheck.net";

// Cached a full day, and — like the browse index — expired early by
// nightly.yml's POST to /api/revalidate. allListings() reads the same
// day-cached `feed` fetch the browse grid uses (lib/listings/db.ts,
// FEED_CACHE_TAG), so building this map costs no database read the browse
// page wasn't already paying for.
export const revalidate = 86400;

// Sharded because a sitemap file is capped at 50,000 URLs / 50MB and live
// inventory already sits near that (~39k, growing). 40k/shard keeps a safe
// margin. generateSitemaps serves each at /sitemap/[id].xml.
const CHUNK = 40_000;

function staticRoutes(now: Date): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/vin`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/bot`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/facts`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    // Each fact sheet's lastModified tracks its audit record's last-checked
    // date (lib/facts/registry.ts dateModified), not build time — same
    // freshness signal its FAQPage JSON-LD carries.
    ...FACT_SHEETS.map((s) => ({
      url: `${BASE}/facts/${s.make}/${s.model}/${s.topic}`,
      lastModified: new Date(s.dateModified),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}

// Real inventory only: a live listing's id is its 17-char lowercase VIN.
// Demo/sample rows (short slug ids) are excluded so the sitemap never points a
// crawler at a URL that vanishes as coverage grows. A feed read failure yields
// an empty list rather than a 500 — the static routes still ship.
async function listingIds(): Promise<{ id: string; listedOn?: string }[]> {
  try {
    const listings = await allListings();
    return listings
      .filter((l) => l.id.length === 17)
      .map((l) => ({ id: l.id, listedOn: l.listedOn }));
  } catch (err) {
    console.error("[sitemap] listing enumeration failed; serving static routes only:", err);
    return [];
  }
}

export async function generateSitemaps(): Promise<{ id: number }[]> {
  const ids = await listingIds();
  const shards = Math.max(1, Math.ceil(ids.length / CHUNK));
  return Array.from({ length: shards }, (_, i) => ({ id: i }));
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const n = Number(await props.id) || 0;
  const now = new Date();
  const ids = await listingIds();
  const listingRoutes: MetadataRoute.Sitemap = ids.slice(n * CHUNK, (n + 1) * CHUNK).map((l) => ({
    url: `${BASE}/listing/${l.id}`,
    lastModified: l.listedOn ? new Date(l.listedOn) : now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));
  // Static routes ride in the first shard so they are always present.
  return n === 0 ? [...staticRoutes(now), ...listingRoutes] : listingRoutes;
}
