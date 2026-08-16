// A listing as it would arrive from a feed: the fields every listing site has.
// Everything smart about the site is layered on top by lib/listings/enrich.ts.
export interface Listing {
  id: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  drive?: "RWD" | "AWD" | "FWD";
  priceUsd: number;
  mileage?: number;
  city?: string;
  state?: string;
  zip?: string; // dealer ZIP — powers distance search
  sellerType: "dealer" | "private";
  condition?: "new" | "used" | "certified";
  exteriorColor?: string;
  // Scraped-listing extras
  optionCodes?: string[]; // factory option codes (GM RPO etc.) from the dealer's own data
  vpicBatteryKwh?: number; // NHTSA vPIC battery-size decode — version discriminator
  /**
   * Set when this listing's own description unambiguously names a DIFFERENT
   * version than `trim` claims, to the name the description gave. Decided at
   * sync time (scraper/lib/trim-suspect.mjs), because the judgement needs the
   * whole corpus and the description, and the browse feed carries neither.
   * Consumed by lib/listings/trimClaim.ts.
   */
  trimSuspect?: string;
  imageUrl?: string;
  images?: string[]; // gallery, when the source provided more than one
  interiorColor?: string;
  stockNumber?: string;
  previousOwners?: number; // schema.org numberOfPreviousOwners, when the dealer publishes it
  description?: string; // the dealer's own writeup, shown with attribution
  sourceUrl?: string; // canonical listing page on the dealer site
  dealerDomain?: string;
  dealerName?: string; // actual rooftop (group sites list many stores)
  // T3.5 — facts read from the listing's own photos at ingest. Nobody else
  // does this because it doesn't scale to millions of listings; we're small.
  photoChecks?: {
    dcFastCharge?: "confirmed_present" | "confirmed_absent";
  };
  // History from the persistence layer (lib/listings/db.ts) — absent when
  // serving from the bundled JSON fallback. Powers days-on-lot and
  // price-drop display; timestamps are ISO strings.
  firstSeenAt?: string;
  lastSeenAt?: string;
  priceHistory?: { priceUsd: number; observedAt: string }[];
  prevPriceUsd?: number; // the asking price before the current one
  priceChangedAt?: string; // when the current price took effect
  /**
   * The seller's own description discloses a manufacturer repurchase (lemon-law
   * or goodwill buyback). Read at write time by the database (migration 0024)
   * because the browse feed strips descriptions; the patterns are audited
   * disclosure templates, so absence asserts nothing about cars whose sellers
   * stayed silent. Gates every price claim: a repurchase is priced against its
   * clean-title cohort nowhere on this site.
   */
  buybackDisclosed?: boolean;
  // Per-VIN campaign history, where an owner portal exposes it (GM today).
  campaignCheck?: {
    packReplaced: boolean;
    packReplacedDate?: string;
    odometerAtReplacement?: number;
    gmProgramNumber?: string;
  };
}
