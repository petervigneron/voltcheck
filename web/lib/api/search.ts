import { apiIndex, apiManifest, hydrate } from "./artifacts";
import { parseQuery, runQuery } from "./query";
import { toApiListing, withPriceHistory, type ApiListing, type ApiListingDetail } from "./records";
import { zipCoords } from "@/lib/zips";
import { findListing } from "@/lib/listings/source";
import { enrichListing, displayTrim, specTrim } from "@/lib/listings/enrich";
import { trimClaim } from "@/lib/listings/trimClaim";
import { hasRealPrice, priceCut } from "@/lib/listings/price";
import { bodyTypeOf } from "@/lib/listings/bodyType";

// The three operations behind the REST routes and the MCP tools. One
// implementation, two doors.

export interface SearchResponse {
  as_of: string;
  total: number;
  offset: number;
  limit: number;
  next_offset: number | null;
  results: (ApiListing & { distance_mi?: number })[];
}

export type ApiError = { error: string; details?: string[] };

export async function searchListings(params: URLSearchParams | Record<string, unknown>): Promise<SearchResponse | ApiError> {
  const { query, errors } = parseQuery(params);
  if (errors.length) return { error: "invalid query", details: errors };
  const m = await apiManifest();
  if (!m) return { error: "inventory data is not available right now" };
  const idx = await apiIndex(m);
  if (!idx) return { error: "inventory data is not available right now" };
  const origin = query.zip ? await zipCoords(query.zip) : undefined;
  if (query.zip && !origin) return { error: "invalid query", details: [`zip: ${query.zip} is not a ZIP code this site knows`] };
  const r = runQuery(idx.r, query, origin);
  const recs = await hydrate(m, r.page);
  return {
    as_of: m.as_of,
    total: r.total,
    offset: query.offset,
    limit: query.limit,
    next_offset: query.offset + query.limit < r.total ? query.offset + query.limit : null,
    results: recs.map((rec) => {
      const d = r.distances?.get(rec.id);
      return d === undefined ? rec : { ...rec, distance_mi: Math.round(d) };
    }),
  };
}

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;

/** One car, read live from the database the way its own page is — so the
 *  price history and the latest price are current, not as of the publish. */
export async function listingByVin(vin: string): Promise<(ApiListingDetail & { as_of: string }) | ApiError> {
  if (!VIN_RE.test(vin)) return { error: "invalid vin", details: ["expected 17 characters"] };
  const l = await findListing(vin.toLowerCase());
  if (!l) return { error: "no live listing for this VIN" };
  const e = enrichListing(l);
  const claim = trimClaim(l);
  const trim = claim.assert ? specTrim(l) : undefined;
  const shown = claim.assert ? displayTrim(l) : undefined;
  const rec = toApiListing(e, {
    realPrice: hasRealPrice(l),
    cut: priceCut(l) ?? undefined,
    loc: await zipCoords(l.zip),
    body: bodyTypeOf(l),
    trim,
    title: `${l.year} ${l.make} ${l.model}${shown ? ` ${shown}` : ""}`,
  });
  return { ...withPriceHistory(rec, l), as_of: new Date().toISOString() };
}

export async function listModels(make?: string): Promise<{ as_of: string; total: number; makes: unknown[] } | ApiError> {
  const m = await apiManifest();
  if (!m) return { error: "inventory data is not available right now" };
  const want = make ? make.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : undefined;
  const makes = want ? m.makes.filter((x) => x.slug === want) : m.makes;
  return { as_of: m.as_of, total: m.total, makes };
}
