import type { EnrichedListing } from "@/lib/listings/enrich";
import type { Listing } from "@/lib/listings/types";
import type { CardRow } from "@/lib/listings/card";
import { vehicleKind, type VehicleKind } from "@/lib/listings/kind";
import { modelKey } from "@/lib/listings/modelName";

// The public read API's record — /api/v1/listings, /api/v1/listings/{vin}
// and the MCP tools all hand back this shape, built by one function so no
// surface can say something another does not.
//
// The house rule on claims applies to every field here exactly as it does
// on a card: a number that is not the manufacturer's own figure carries
// `estimated: true`; a yes/no fact is either answered or absent, never
// hedged; a Fact's `note` is working, not copy, and is emitted nowhere
// (lib/enrichment/noteRule.ts). Two value signals are deliberately NOT here:
// ask-vs-sold (withheld from every surface since 2026-08-20 until a second
// regional sold dataset validates it) and ask-vs-market (the "deals" filter
// is a Pro feature; a free API that carries the delta is that filter for
// free). Incentive eligibility is Pro-gated for the same reason.

export const SITE = "https://voltcheck.net";

export interface ApiListing {
  id: string;
  vin: string;
  /** The car's page on Voltcheck. */
  url: string;
  year: number;
  make: string;
  model: string;
  /** Only when the site is willing to stand behind it (lib/listings/trimClaim.ts). */
  trim?: string;
  title: string;
  condition?: "new" | "used" | "certified";
  /** Battery-electric or plug-in hybrid; absent when the enrichment cannot settle it. */
  kind?: VehicleKind;
  body?: string;
  drive?: "RWD" | "AWD" | "FWD";
  /** Null when the seller printed something that failed the junk-price floor
   *  (a lease payment, an accessory total): there is no asking price to quote. */
  price_usd: number | null;
  /** The asking price before the current one, and when the current one took effect. */
  previous_price_usd?: number;
  price_changed_at?: string;
  /** A cut worth attention: at least $500, within the last 14 days, both prices real. */
  price_cut?: { usd: number; at: string };
  mileage?: number;
  exterior_color?: string;
  location: { city?: string; state?: string; zip?: string; lat?: number; lng?: number };
  seller: { type: "dealer" | "private"; name?: string; domain?: string; url?: string };
  image_url?: string;
  /** Pack size; `basis` says whether the figure is usable or total capacity. */
  battery?: { kwh: number; basis: "usable" | "total"; estimated: boolean };
  /** EPA-rated unless `estimated` (the maker's own simulation where EPA never
   *  rated the car). For a plug-in hybrid this is the electric-only figure. */
  range?: { mi: number; estimated: boolean; electric_only: boolean };
  charge_port?: { standard: string; estimated: boolean };
  /** Answered yes or no; absent when the source does not clear the bar. */
  heat_pump?: "yes" | "no";
  dc_fast_charge?: "yes" | "no";
  charge_time_10_80_min?: { min: number; estimated: boolean };
  /** The pack was replaced under a manufacturer campaign (GM's owner portal). */
  battery_replaced?: { date?: string };
  /** The seller's own description discloses a manufacturer repurchase. */
  buyback_disclosed?: true;
  /** The seller's own description discloses a branded title (salvage, rebuilt, flood, lemon). */
  branded_title_disclosed?: true;
  /** When the car appeared on its seller's site — only when that is honestly a listing date. */
  listed_on?: string;
  first_seen?: string;
  last_seen?: string;
}

export interface ApiListingDetail extends ApiListing {
  price_history?: { usd: number; at: string }[];
}

export function makeSlug(make: string): string {
  return make
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const day = (iso: string | undefined) => (iso ? iso.slice(0, 10) : undefined);
const domainish = (d: string | undefined) => (d && d.includes(".") ? d : undefined);

/** What a record needs beyond the enrichment: the card-index answers the
 *  publisher already has, or their per-listing equivalents on the detail path. */
export interface RecordExtras {
  realPrice: boolean;
  cut?: { amountUsd: number; at: string };
  loc?: [number, number];
  body?: string;
  trim?: string;
  /** The card's own title when the caller has one; otherwise built from trim. */
  title?: string;
}

export function toApiListing(e: EnrichedListing, x: RecordExtras): ApiListing {
  const l = e.listing;
  const kind = vehicleKind(e);
  const rec: ApiListing = {
    id: l.id,
    vin: l.vin.toUpperCase(),
    url: `${SITE}/listing/${l.id}`,
    year: l.year,
    make: l.make,
    model: l.model,
    title: x.title ?? `${l.year} ${l.make} ${l.model}${x.trim ? ` ${x.trim}` : ""}`,
    price_usd: x.realPrice ? l.priceUsd : null,
    location: {},
    seller: { type: l.sellerType },
  };
  if (x.trim) rec.trim = x.trim;
  if (l.condition) rec.condition = l.condition;
  if (kind) rec.kind = kind;
  if (x.body) rec.body = x.body;
  // The feed's own word wins; where it says nothing, the exact-matched
  // enrichment row's drive fills in — the same rule the card index applies.
  const drive = l.drive ?? e.row?.drive;
  if (drive) rec.drive = drive;
  if (x.realPrice && l.prevPriceUsd != null && l.prevPriceUsd !== l.priceUsd) {
    rec.previous_price_usd = l.prevPriceUsd;
    if (l.priceChangedAt) rec.price_changed_at = l.priceChangedAt;
  }
  if (x.cut) rec.price_cut = { usd: x.cut.amountUsd, at: x.cut.at };
  if (l.mileage != null) rec.mileage = l.mileage;
  if (l.exteriorColor) rec.exterior_color = l.exteriorColor;
  if (l.city) rec.location.city = l.city;
  if (l.state) rec.location.state = l.state;
  if (l.zip) rec.location.zip = l.zip;
  if (x.loc) {
    rec.location.lat = x.loc[0];
    rec.location.lng = x.loc[1];
  }
  if (l.dealerName) rec.seller.name = l.dealerName;
  const dom = domainish(l.dealerDomain);
  if (dom) rec.seller.domain = dom;
  if (l.sourceUrl) rec.seller.url = l.sourceUrl;
  if (l.imageUrl) rec.image_url = l.imageUrl;
  if (e.packKwh) rec.battery = { kwh: Math.round(e.packKwh.value), basis: e.packKwh.basis, estimated: e.packKwh.estimated };
  // A listing that could be one of several versions (enrichment.candidates)
  // has no single range to quote; the card prints a span, the API prints
  // nothing rather than a number it cannot stand behind.
  if (e.realRangeMi && !e.enrichment.candidates) {
    rec.range = { mi: e.realRangeMi.value, estimated: Boolean(e.rangeIsMfrEstimate), electric_only: kind === "PHEV" };
  }
  if (e.port) rec.charge_port = { standard: e.port.value, estimated: e.port.source !== "mfr" };
  if (e.heatPump?.status === "yes" || e.heatPump?.status === "no") rec.heat_pump = e.heatPump.status;
  if (e.fastCharge.status === "yes" || e.fastCharge.status === "no") rec.dc_fast_charge = e.fastCharge.status;
  if (e.chargeTime1080Min) rec.charge_time_10_80_min = { min: e.chargeTime1080Min.value, estimated: e.chargeTime1080Min.source !== "mfr" };
  if (l.campaignCheck?.packReplaced) rec.battery_replaced = l.campaignCheck.packReplacedDate ? { date: l.campaignCheck.packReplacedDate } : {};
  if (l.buybackDisclosed) rec.buyback_disclosed = true;
  if (l.brandedTitleDisclosed) rec.branded_title_disclosed = true;
  if (l.listedOn) rec.listed_on = l.listedOn;
  const fs = day(l.firstSeenAt);
  if (fs) rec.first_seen = fs;
  const ls = day(l.lastSeenAt);
  if (ls) rec.last_seen = ls;
  return rec;
}

export function withPriceHistory(rec: ApiListing, l: Listing): ApiListingDetail {
  const out: ApiListingDetail = { ...rec };
  if (l.priceHistory?.length) out.price_history = l.priceHistory.map((p) => ({ usd: p.priceUsd, at: p.observedAt }));
  return out;
}

// ------------------------------------------------------------ the index
// The query index: every live car as one short tuple, so a query with no
// make can be answered from one ~15 MB file (a few MB gzipped) instead of
// forty make partitions. Only the fields a filter or a sort reads; the page
// of results is hydrated from the make partitions afterwards.
//
//   [id, makeSlug, modelKey, year, price (0 = none), mileage (-1 = unknown),
//    condition (0 new / 1 used / 2 certified / -1), state, lat, lng
//    (null when unknown), kind (0 BEV / 1 PHEV / -1), range mi (0 = none),
//    kwh (0 = none), heat pump (1 yes / 0 no / -1), port ("" = none),
//    drive ("" = none), body ("" = none), first-seen day number (0 = unknown)]
export type SlimRow = [
  string, string, string, number, number, number, number, string,
  number | null, number | null, number, number, number, number, string, string, string, number,
];
export const SLIM_CONDITIONS = ["new", "used", "certified"] as const;

export interface ApiIndex {
  v: 1;
  as_of: string;
  r: SlimRow[];
}

export interface ApiManifest {
  v: 1;
  as_of: string;
  total: number;
  makes: { make: string; slug: string; count: number; models: Record<string, number> }[];
}

export const dayNumber = (iso: string | undefined): number => {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor(t / 86400000) : 0;
};

export function slimRow(rec: ApiListing, e: EnrichedListing): SlimRow {
  return [
    rec.id,
    makeSlug(rec.make),
    modelKey(rec.model),
    rec.year,
    rec.price_usd ?? 0,
    rec.mileage ?? -1,
    rec.condition ? SLIM_CONDITIONS.indexOf(rec.condition) : -1,
    rec.location.state ?? "",
    rec.location.lat ?? null,
    rec.location.lng ?? null,
    rec.kind === "BEV" ? 0 : rec.kind === "PHEV" ? 1 : -1,
    rec.range?.mi ?? 0,
    rec.battery?.kwh ?? 0,
    rec.heat_pump === "yes" ? 1 : rec.heat_pump === "no" ? 0 : -1,
    rec.charge_port?.standard ?? "",
    rec.drive ?? "",
    rec.body ?? "",
    dayNumber(e.listing.firstSeenAt),
  ];
}

/** Everything the publisher uploads for the API, built from the same
 *  listings and enrichment the browse feed was built from. */
export function buildApiArtifacts(
  listings: Listing[],
  enriched: Map<string, EnrichedListing>,
  rows: CardRow[],
  asOf: string
): { index: ApiIndex; partitions: Map<string, ApiListing[]>; manifest: ApiManifest } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const partitions = new Map<string, ApiListing[]>();
  const makes = new Map<string, { make: string; slug: string; count: number; models: Record<string, number> }>();
  const slim: SlimRow[] = [];
  for (const l of listings) {
    const row = byId.get(l.id);
    const e = enriched.get(l.vin);
    if (!row || !e) continue;
    const rec = toApiListing(e, { realPrice: row.realPrice, cut: row.cut, loc: row.loc, body: row.body, trim: row.trim, title: row.title });
    const slug = makeSlug(rec.make);
    let part = partitions.get(slug);
    if (!part) partitions.set(slug, (part = []));
    part.push(rec);
    slim.push(slimRow(rec, e));
    let m = makes.get(slug);
    if (!m) makes.set(slug, (m = { make: rec.make, slug, count: 0, models: {} }));
    m.count++;
    m.models[rec.model] = (m.models[rec.model] ?? 0) + 1;
  }
  const manifest: ApiManifest = {
    v: 1,
    as_of: asOf,
    total: slim.length,
    makes: [...makes.values()].sort((a, b) => b.count - a.count),
  };
  return { index: { v: 1, as_of: asOf, r: slim }, partitions, manifest };
}
