import type { Listing } from "./types";
import { SAMPLE_LISTINGS } from "./sample";
import { decodeSnapshot } from "./snapshot";
import { dbConfigured, fetchListingByIdFromDb, fetchListingDetailFromDb, fetchListingsFromDb } from "./db";

// Live inventory comes from Supabase (nightly scraper sync, see
// scraper/db-sync.mjs); the bundled JSON is the fallback when the DB is
// unconfigured or unreachable, so local dev and outages both keep working.
// The fallback is a gzipped snapshot — 5.4MB on disk against the 40.7MB of
// JSON it holds (see lib/listings/snapshot.ts for why it is compressed, and
// for the measurements) — imported lazily, on the failure path only, so a
// cold serverless start never parses it just to have it around.
// Demo rows exercise enrichment cases the current scrape doesn't cover and
// disappear as real coverage grows.
let snapshotCache: Listing[] | undefined;
async function fallbackListings(): Promise<Listing[]> {
  // Decoded once per instance and held: the module registry caches the import,
  // but not the gunzip, and an outage that resolves ten VINs should pay for
  // one decode rather than ten. (~174 ms each, measured on 58,730 rows.)
  if (!snapshotCache) {
    const scraped = await import("@/data/scraped-listings.json");
    snapshotCache = decodeSnapshot(scraped.default);
  }
  return snapshotCache;
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

/**
 * Where the rows a caller is holding actually came from.
 *
 *   "db"           the live feed. The only origin that may be published as
 *                  current inventory.
 *   "unconfigured" no SUPABASE_URL/ANON_KEY — local dev and CI. The bundled
 *                  snapshot is the intended answer here.
 *   "fallback"     the database IS configured and did not answer, so these
 *                  are the committed snapshot's rows. The site keeps working,
 *                  but this is 58,730 cars standing in for ~100,300 and it
 *                  must never be mistaken for the live feed.
 *
 * The distinction exists because the third case used to be invisible. On
 * 2026-08-16 three production deploys in a row shipped the snapshot to the
 * browse grid — every request 200, the site looked clean, ~40,000 cars simply
 * weren't there. Callers that publish a claim about what is for sale (the
 * sitemap) refuse to serve on "fallback"; callers that just have to keep the
 * lights on (the browse index) serve it but do not let it become the day's
 * cached truth (see db.ts's catch).
 */
export type FeedOrigin = "db" | "fallback" | "unconfigured";

export async function allListingsWithOrigin(): Promise<{ listings: Listing[]; origin: FeedOrigin }> {
  const db = await fetchListingsFromDb();
  const origin: FeedOrigin = db ? "db" : dbConfigured() ? "fallback" : "unconfigured";
  const byVin = new Map<string, Listing>();
  for (const l of [...(db ?? (await fallbackListings())), ...SAMPLE_LISTINGS]) {
    if (!byVin.has(l.vin)) byVin.set(l.vin, absolutizeImages(l));
  }
  return { listings: [...byVin.values()], origin };
}

export async function allListings(): Promise<Listing[]> {
  return (await allListingsWithOrigin()).listings;
}

// A real listing's id is its VIN — id === vin.toLowerCase() for every row the
// scraper writes (scraper/ingest.mjs), and for all 58,730 rows of the bundled
// snapshot (checked 2026-08-22: zero exceptions, zero non-VIN-shaped ids).
// Demo rows are the other kind: all eleven SAMPLE_LISTINGS ids are hyphenated
// slugs, so no id can be both.
//
// Same shape test the sitemap uses (app/sitemap/[shard]/route.ts) except for
// case, and deliberately: that route is deciding what to publish, so it wants
// only the canonical lowercase form, while this one is deciding whether a URL
// a crawler already typed is worth a database request. /listing/<UPPERCASE
// VIN> resolves today — the read uppercases the id anyway — and a
// lowercase-only test here would start 404ing it.
const VIN_SHAPED = /^[a-zA-Z0-9]{17}$/;

/** One VIN out of the bundled snapshot, for when the database can't say.
 *  The import is the same lazy one allListingsWithOrigin uses and the module
 *  registry caches it, so an outage parses that JSON once per instance —
 *  where the walk it replaces paid 226 requests per render. */
async function findInSnapshot(id: string): Promise<Listing | undefined> {
  const key = id.toLowerCase();
  const row = (await fallbackListings()).find((l) => l.id === key);
  return row ? absolutizeImages(row) : undefined;
}

/**
 * One listing by id, without ever walking the feed.
 *
 * What this replaced, and why it had to go: the fallback used to be
 * `(await allListings()).find(...)` — a FULL WALK, 226 PostgREST requests
 * against a 100,297-row feed — taken on EVERY id the per-VIN read didn't
 * return. That is the read amplification behind the 2026-08-22 incident. The
 * per-VIN read misses on every request while the database is sick, and the
 * sitemap advertises ~100,297 listing URLs, so a crawler working through them
 * became a walk generator: 2,500-4,900 feed-page requests an hour against a
 * ~20/hour baseline, 13 GB of disk reads over 44 hours. db.ts's 60-second
 * cooldown bounds that case; it does nothing for the healthy one, where an
 * unknown id still cost a walk.
 *
 * The walk was never buying what its comment claimed. It read the same view
 * the per-VIN read does (live_listings_feed, `WHERE delisted_at IS NULL`), so
 * on a healthy database it can only ever return rows that read already
 * covered — plus the eleven demo rows. A just-delisted car is invisible to
 * both. So each branch below returns exactly what the walk would have:
 *
 *   not VIN-shaped   only a demo row can have that id. No request.
 *   database has it  the row. One request, as before.
 *   database says no this VIN is not for sale. 404 — the same answer the
 *                    walk gave, since the walk reads the same view. It is
 *                    also the honest one for a sold car.
 *   database silent  the bundled snapshot, which is exactly what a failed
 *                    walk would have handed back via allListings(), minus the
 *                    226 requests spent failing.
 */
async function resolveListing(id: string): Promise<{ listing?: Listing; live: boolean }> {
  if (!VIN_SHAPED.test(id)) {
    const sample = SAMPLE_LISTINGS.find((l) => l.id === id);
    return { listing: sample && absolutizeImages(sample), live: false };
  }
  if (!dbConfigured()) return { listing: await findInSnapshot(id), live: false };
  const { answered, listing } = await fetchListingByIdFromDb(id);
  if (listing) return { listing: absolutizeImages(listing), live: true };
  if (answered) return { live: true };
  return { listing: await findInSnapshot(id), live: false };
}

export async function findListing(id: string): Promise<Listing | undefined> {
  const { listing, live } = await resolveListing(id);
  if (!listing) return undefined;
  // The bulk feed omits description and price history (egress: they render
  // only here), so a row that came from the database needs one small per-VIN
  // read to get them.
  //
  // A row that did NOT come from the database doesn't: a demo row's VIN is
  // synthetic and has never been in `listings`, and a snapshot row is only
  // being served because the database just failed to answer for this very
  // VIN — asking it a second question about the same car is two more
  // requests into a database that is already down, for a description it
  // won't return. Both used to make that call whenever they had no
  // description of their own (most rows have none), which doubled the cost
  // of exactly the outage this file was being fixed for.
  if (!live || listing.description !== undefined) return listing;
  const detail = await fetchListingDetailFromDb(listing.vin);
  return detail ? { ...listing, ...detail } : listing;
}
