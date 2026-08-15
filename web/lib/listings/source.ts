import type { Listing } from "./types";
import { SAMPLE_LISTINGS } from "./sample";
import { dbConfigured, fetchListingDetailFromDb, fetchListingsFromDb } from "./db";
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

// Dealer feeds serialize missing fields as literal placeholder strings —
// "null", "N/A", "-" (all observed in stored rows) — which then render
// verbatim ("Exterior null"). The scraper now drops them at extraction, but
// rows already in the DB and the bundled JSON still carry them, so every
// listing is scrubbed here before any surface (detail specs, search haystack)
// sees it.
const JUNK_STRINGS = new Set(["", "null", "n/a", "-", "undefined"]);
const SCRUBBED_FIELDS = [
  "trim",
  "exteriorColor",
  "interiorColor",
  "stockNumber",
  "description",
  "dealerName",
  "city",
  "state",
  "zip",
] as const;

function scrubJunkStrings(l: Listing): Listing {
  let out = l;
  for (const k of SCRUBBED_FIELDS) {
    const v = out[k];
    if (typeof v === "string" && JUNK_STRINGS.has(v.trim().toLowerCase())) {
      if (out === l) out = { ...l };
      out[k] = undefined;
    }
  }
  return out;
}

export async function allListings(): Promise<Listing[]> {
  const db = await fetchListingsFromDb();
  const byVin = new Map<string, Listing>();
  for (const l of [...(db ?? SCRAPED), ...SAMPLE_LISTINGS]) {
    if (!byVin.has(l.vin)) byVin.set(l.vin, scrubJunkStrings(absolutizeImages(l)));
  }
  return [...byVin.values()];
}

export async function findListing(id: string): Promise<Listing | undefined> {
  const listing = (await allListings()).find((l) => l.id === id);
  if (!listing) return undefined;
  // The bulk feed omits description and price history (egress: they render
  // only here). One small per-VIN read brings them in; bundled-JSON and
  // sample rows already carry their description and skip the fetch.
  if (listing.description !== undefined || !dbConfigured()) return listing;
  const detail = await fetchListingDetailFromDb(listing.vin);
  return detail ? scrubJunkStrings({ ...listing, ...detail }) : listing;
}
