import type { Listing } from "./types";
import { SAMPLE_LISTINGS } from "./sample";
import { fetchListingsFromDb } from "./db";
import scraped from "@/data/scraped-listings.json";

// Live inventory comes from Supabase (nightly scraper sync, see
// scraper/db-sync.mjs); the bundled JSON is the fallback when the DB is
// unconfigured or unreachable, so local dev and outages both keep working.
// Demo rows exercise enrichment cases the current scrape doesn't cover and
// disappear as real coverage grows.
const SCRAPED = scraped as Listing[];

// Some dealer platforms serve photos from a root-relative path ("/inventory
// photos/…/1.jpg"), and the scraper stored them as-is — 278 listings whose
// photo can't load anywhere but on the dealer's own page. The listing knows
// where it came from, so resolve against that rather than dropping the image.
function absolutizeImages(l: Listing): Listing {
  const base = l.sourceUrl ?? (l.dealerDomain ? `https://${l.dealerDomain}/` : undefined);
  if (!base) return l;
  const abs = (u: string | undefined): string | undefined => {
    if (!u || /^https?:/i.test(u)) return u;
    try {
      return new URL(u, base).toString();
    } catch {
      return undefined;
    }
  };
  const imageUrl = abs(l.imageUrl);
  const images = l.images?.map(abs).filter((u): u is string => !!u);
  if (imageUrl === l.imageUrl && images?.length === l.images?.length) return l;
  return { ...l, imageUrl, images };
}

export async function allListings(): Promise<Listing[]> {
  const db = await fetchListingsFromDb();
  const byVin = new Map<string, Listing>();
  for (const l of [...(db ?? SCRAPED), ...SAMPLE_LISTINGS]) {
    if (!byVin.has(l.vin)) byVin.set(l.vin, absolutizeImages(l));
  }
  return [...byVin.values()];
}

export async function findListing(id: string): Promise<Listing | undefined> {
  return (await allListings()).find((l) => l.id === id);
}
