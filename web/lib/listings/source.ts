import type { Listing } from "./types";
import { SAMPLE_LISTINGS } from "./sample";
import { dbConfigured, fetchListingByIdFromDb, fetchListingDetailFromDb, fetchListingsFromDb } from "./db";

// Live inventory comes from Supabase (nightly scraper sync, see
// scraper/db-sync.mjs); the bundled JSON is the fallback when the DB is
// unconfigured or unreachable, so local dev and outages both keep working.
// The fallback is 17MB of JSON — imported lazily, on the failure path only,
// so a cold serverless start never parses it just to have it around.
// Demo rows exercise enrichment cases the current scrape doesn't cover and
// disappear as real coverage grows.
async function fallbackListings(): Promise<Listing[]> {
  const scraped = await import("@/data/scraped-listings.json");
  return scraped.default as Listing[];
}

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
  for (const l of [...(db ?? (await fallbackListings())), ...SAMPLE_LISTINGS]) {
    if (!byVin.has(l.vin)) byVin.set(l.vin, absolutizeImages(l));
  }
  return [...byVin.values()];
}

export async function findListing(id: string): Promise<Listing | undefined> {
  // One row by id, not the whole feed: the detail page shouldn't pay for
  // 16k listings to show one. Ids the DB doesn't know (sample rows, the
  // bundled-JSON fallback, just-delisted cars) fall back to the full scan.
  const fromDb = await fetchListingByIdFromDb(id);
  const listing = fromDb
    ? absolutizeImages(fromDb)
    : (await allListings()).find((l) => l.id === id);
  if (!listing) return undefined;
  // The bulk feed omits description and price history (egress: they render
  // only here). One small per-VIN read brings them in; bundled-JSON and
  // sample rows already carry their description and skip the fetch.
  if (listing.description !== undefined || !dbConfigured()) return listing;
  const detail = await fetchListingDetailFromDb(listing.vin);
  return detail ? { ...listing, ...detail } : listing;
}
