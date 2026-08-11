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

export async function allListings(): Promise<Listing[]> {
  const db = await fetchListingsFromDb();
  const byVin = new Map<string, Listing>();
  for (const l of [...(db ?? SCRAPED), ...SAMPLE_LISTINGS]) {
    if (!byVin.has(l.vin)) byVin.set(l.vin, l);
  }
  return [...byVin.values()];
}

export async function findListing(id: string): Promise<Listing | undefined> {
  return (await allListings()).find((l) => l.id === id);
}
