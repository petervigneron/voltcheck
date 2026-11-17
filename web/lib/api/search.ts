import { apiIndex, apiManifest, hydrate } from "./artifacts";
import { parseQuery, resolveMake, runQuery } from "./query";
import { toApiListing, withPriceHistory, type ApiListing, type ApiListingDetail, type ApiManifest } from "./records";
import { modelKey, preferredForm } from "@/lib/listings/modelName";
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
  /** Cars that met every other filter but have no answer for `kind`,
   *  `condition` or `heat_pump` when that filter was asked. They are not in
   *  `total`: unknown matches neither side. Present only when non-zero. */
  not_established?: { condition?: number; kind?: number; heat_pump?: number };
  /** Why a search found nothing, when the reason is a name this site does
   *  not file cars under. Present only on an empty result. */
  notes?: string[];
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
  if (query.make) query.make = resolveMake(query.make, m.makes.map((x) => x.slug));
  const r = runQuery(idx.r, query, origin);
  const recs = await hydrate(m, r.page);
  const notes = r.total === 0 ? emptyNotes(m, query.make, query.model) : [];
  return {
    as_of: m.as_of,
    total: r.total,
    offset: query.offset,
    limit: query.limit,
    next_offset: query.offset + query.limit < r.total ? query.offset + query.limit : null,
    ...(Object.keys(r.notEstablished).length ? { not_established: r.notEstablished } : {}),
    ...(notes.length ? { notes } : {}),
    results: recs.map((rec) => {
      const d = r.distances?.get(rec.id);
      return d === undefined ? rec : { ...rec, distance_mi: Math.round(d) };
    }),
  };
}

/** One entry per model, however its sellers typed it: "Prius Plug-in Hybrid",
 *  "Prius Plug-In Hybrid" and "PRIUS PLUG-IN HYBRID" are one car, and the
 *  search has always matched them as one (modelKey). The list said otherwise
 *  — 138 Mercedes-Benz "models", 29 Toyota (audit, 2026-11-17) — while being
 *  the tool an agent is told to learn spellings from. Same fold and same
 *  choice of spelling as the site's own dropdowns (lib/listings/tally.ts). */
export function foldModels(models: Record<string, number>): Record<string, number> {
  const byKey = new Map<string, { n: number; forms: Map<string, number> }>();
  for (const [name, n] of Object.entries(models)) {
    const k = modelKey(name);
    let e = byKey.get(k);
    if (!e) byKey.set(k, (e = { n: 0, forms: new Map() }));
    e.n += n;
    e.forms.set(name, (e.forms.get(name) ?? 0) + n);
  }
  return Object.fromEntries([...byKey.values()].sort((a, b) => b.n - a.n).map((e) => [preferredForm(e.forms), e.n]));
}

// The feed files a make with only its first letter raised. These are the
// ones that is wrong for.
const MAKE_LABELS: Record<string, string> = {
  "land-rover": "Land Rover",
  "alfa-romeo": "Alfa Romeo",
  "rolls-royce": "Rolls-Royce",
  mclaren: "McLaren",
  brightdrop: "BrightDrop",
  vinfast: "VinFast",
};
const makeLabel = (x: { make: string; slug: string }) => MAKE_LABELS[x.slug] ?? x.make;

/** What to tell a caller whose search matched nothing because of a name. */
function emptyNotes(m: ApiManifest, make?: string, model?: string): string[] {
  if (!make) return [];
  const entry = m.makes.find((x) => x.slug === make);
  if (!entry) return [`make: no cars are filed under "${make}". Makes with listings: ${m.makes.map(makeLabel).join(", ")}.`];
  if (!model) return [];
  const models = foldModels(entry.models);
  if (Object.keys(models).some((name) => modelKey(name) === model)) return [];
  const near = Object.keys(models).filter((name) => modelKey(name).includes(model) || model.includes(modelKey(name)));
  const shown = (near.length ? near : Object.keys(models)).slice(0, 25);
  return [`model: no ${makeLabel(entry)} is filed under that model name. ${near.length ? "Closest" : "Models with listings"}: ${shown.join(", ")}.`];
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
  const want = make ? resolveMake(make, m.makes.map((x) => x.slug)) : undefined;
  const makes = (want ? m.makes.filter((x) => x.slug === want) : m.makes).map((x) => ({ ...x, make: makeLabel(x), models: foldModels(x.models) }));
  return { as_of: m.as_of, total: m.total, makes };
}
