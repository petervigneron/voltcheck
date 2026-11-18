import type { McpTool } from "./server";
import { searchListings, liveListingByVin, listModels, BREAKDOWN_TRIMS, type SearchResponse } from "@/lib/api/search";
import { SORTS, MAX_LIMIT } from "@/lib/api/query";
import { SITE } from "@/lib/api/records";
import { apiHubIndex } from "@/lib/api/artifacts";
import { hasRealPrice } from "@/lib/listings/price";
import { fetchMarket } from "@/lib/market";
import { fetchSpeed } from "@/lib/listings/speed";
import { batteryWarranty, marketSnapshot, bounded } from "./insights";
import { bucketFor, carBatteryWarranty, similarBands, type BandSet } from "./carSignals";

// The listing tools are the REST endpoints with a schema on the front: same
// functions, same records, same as_of, so an agent on either door sees the
// same inventory. The connector differs from REST in three places only:
// records are labelled (labelled(): our page with ?ref=mcp, the seller link
// through /go), search records are compact unless asked for in full, and a
// search carries a breakdown of every match. Records also carry two answers
// REST does not (lib/mcp/carSignals.ts): the coarse asking_vs_similar band
// the publisher writes into the API index, and, on get_listing and compare_listings, the
// listing page's battery-warranty row for the car. battery_warranty and
// market_snapshot are connector-only and read what /warranty, the model pages
// and /market already print (lib/mcp/insights.ts).

const SEARCH_SCHEMA = {
  type: "object",
  properties: {
    make: { type: "string", description: 'Make, e.g. "Tesla", "Hyundai".' },
    model: { type: "string", description: 'Model, e.g. "Model Y", "Ioniq 5". Punctuation and spacing are ignored.' },
    year_min: { type: "integer", description: "Earliest model year to include, e.g. 2022." },
    year_max: { type: "integer", description: "Latest model year to include." },
    price_min: { type: "integer", description: "Minimum asking price in USD." },
    price_max: { type: "integer", description: "Maximum asking price in USD. Cars with no real asking price are excluded when a price bound is given." },
    mileage_max: { type: "integer", description: "Maximum odometer reading in miles. Cars with no stated mileage are excluded when this is given." },
    condition: { type: "string", description: 'Comma-separated: "new", "used", "certified".' },
    kind: { type: "string", enum: ["BEV", "PHEV"], description: "Battery-electric or plug-in hybrid. A car whose kind is not established matches neither; the result counts those in not_established.kind." },
    state: { type: "string", description: 'Comma-separated two-letter state codes, e.g. "CA,OR".' },
    zip: { type: "string", description: "5-digit US ZIP; results are limited to radius_mi of it and sorted by distance unless sort is given." },
    radius_mi: { type: "integer", description: "Search radius around zip, in miles. Default 100." },
    range_min: { type: "integer", description: "Minimum EPA range in miles (electric-only for a plug-in hybrid)." },
    kwh_min: { type: "integer", description: "Minimum battery capacity in kWh." },
    heat_pump: { type: "string", enum: ["yes", "no"], description: "Only cars known to have (yes) or not have (no) a heat pump. Cars where it is not established match neither, and are counted in not_established.heat_pump." },
    charge_port: { type: "string", description: 'Comma-separated: "NACS", "CCS1", "CHAdeMO".' },
    drive: { type: "string", description: 'Comma-separated: "AWD", "RWD", "FWD".' },
    body: { type: "string", description: 'Comma-separated: "suv", "sedan", "truck", "van", "hatchback".' },
    sort: { type: "string", enum: [...SORTS], description: "Result order. distance needs a zip. Default: distance when a zip is given, otherwise price_asc." },
    limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT, description: `Results to return, 1 to ${MAX_LIMIT}. Default 25.` },
    offset: { type: "integer", minimum: 0, description: "Results to skip, for paging. Default 0." },
    detail: {
      type: "string",
      enum: ["compact", "full"],
      description:
        'How much of each record to return. Default "compact", which leaves out id (the VIN in lower case), image_url, location.zip, location.lat, location.lng, previous_price_usd, price_changed_at, listed_on and first_seen. "full" returns every field.',
    },
  },
  additionalProperties: false,
};

/** Fields a compact record leaves out: ids the VIN already is, coordinates
 *  the city, state and distance already say, the picture, and the dates and
 *  previous price behind the history get_listing returns. What an assistant
 *  shows a person about a car (price, miles, year and trim, place, seller,
 *  the EV facts with their estimated flags, a recent cut, our page) stays,
 *  and so does last_seen since 2026-11-18: the day the car was last seen for
 *  sale is what tells an assistant whether a result is still worth a call to
 *  the dealer, and it is ten characters.
 *  Keep the `detail` description above in step with this list. */
export const COMPACT_OMITS = ["id", "image_url", "previous_price_usd", "price_changed_at", "listed_on", "first_seen"] as const;
export const COMPACT_LOCATION_OMITS = ["zip", "lat", "lng"] as const;

export function compact<T extends object>(record: T): Partial<T> {
  const out: Record<string, unknown> = { ...(record as Record<string, unknown>) };
  for (const k of COMPACT_OMITS) delete out[k];
  if (out.location && typeof out.location === "object") {
    const loc: Record<string, unknown> = { ...(out.location as Record<string, unknown>) };
    for (const k of COMPACT_LOCATION_OMITS) delete loc[k];
    out.location = loc;
  }
  return out as Partial<T>;
}

/** On every connector response, so a host that shows where an answer came
 *  from has the name and address to show. */
export const SOURCE = { name: "Census EV", url: SITE } as const;
const sourced = <T extends object>(r: T) => ({ ...r, source: SOURCE });

// Every tool here reads published listings and nothing else: no writes, no
// accounts, the same answer for the same arguments until the next publish,
// and no reach beyond this site's own data. The annotations say so, because
// a host decides from them whether a call needs the user's say-so.
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

/** The label a visit from a connector result arrives with (lib/visit.ts
 *  visitSrc), so the weekly report can count them. Same device as the embed
 *  card's EMBED_REF. */
export const MCP_REF = "mcp";

/** The seller link a connector result carries: through /go, which counts the
 *  click and forwards to the dealer's own page (lib/go.ts). */
export function goLink(vin: string): string {
  return `${SITE}/go/${vin.toLowerCase()}?ref=${MCP_REF}`;
}

/**
 * A record as the connector returns it: the same record the REST API gives,
 * with its two links labelled.
 *
 * `url`, our own page, gets ?ref=mcp. Why: when an assistant shows a car and
 * the person opens its page here, that visit carried no referrer and no
 * label, so it landed in the weekly report's "direct or unknown" pile with
 * everything else. The owner's question on 2026-11-17 was whether being used
 * by assistants does anything for the site, and without this the honest
 * answer was "no way to tell".
 *
 * `seller.url` becomes /go/<vin>?ref=mcp, which records a dealer_click and
 * answers 302 to the dealer's page for the car (with utm_source=censusev):
 * the only way to see a person go from an assistant to a dealer. The
 * dealer's name and domain stay on the record, so where the link ends is
 * visible before it is followed. A record with no seller URL gets no link.
 *
 * The REST API's records are not labelled: a program that stores them
 * should get the plain addresses. Neither label is a tracker of a person: it
 * is one fixed word, the same for every result, and the listing page's
 * canonical ignores it.
 */
export function labelled<T extends { url?: unknown; vin?: unknown; seller?: unknown }>(record: T): T {
  let out = record;
  if (typeof record.url === "string" && !record.url.includes("?")) out = { ...out, url: `${record.url}?ref=${MCP_REF}` };
  const seller = record.seller as { url?: unknown } | undefined;
  if (seller && typeof seller.url === "string" && typeof record.vin === "string" && record.vin) {
    out = { ...out, seller: { ...seller, url: goLink(record.vin) } };
  }
  return out;
}

/**
 * search_listings, both halves: `result` is what the tool returns (and what
 * the model reads), `search` is the search behind it with its records as the
 * REST API has them, for the in-chat card (lib/mcp/ui/), which needs to know
 * which cars have a photo after compact() has dropped image_url.
 */
export async function runSearch(args: Record<string, unknown>): Promise<{ result: unknown; search: SearchResponse }> {
  const { detail = "compact", ...query } = args;
  if (detail !== "compact" && detail !== "full") throw new Error('invalid query: detail: expected "compact" or "full"');
  // Started with the search, not after it: the bands ride in the same API
  // index the search reads, memoised per publish; on a cold instance the
  // wait is bounded.
  const signals = similarBands();
  const r = await searchListings(query, { breakdown: true });
  // The details are the point: "invalid query" alone does not tell an
  // agent which argument to fix, and the REST door has always said.
  if ("error" in r) throw new Error(r.details?.length ? `${r.error}: ${r.details.join("; ")}` : r.error);
  const { results, breakdown, ...rest } = r;
  const set = await signals;
  return {
    result: sourced({
      ...rest,
      breakdown,
      results: results.map((rec) => {
        const out = withSimilar(labelled(rec), bucketFor(set, r.as_of, rec.id, rec.price_usd));
        return detail === "full" ? out : compact(out);
      }),
    }),
    search: r,
  };
}

const SIMILAR_DESCRIPTION =
  'asking_vs_similar ("below", "typical" or "above") compares the asking price with similar cars on Census EV: the same version and model year within 40,000 miles, adjusted for mileage, counting cars listed now and cars no longer listed in the last 30 days at their last asking price. It compares asking prices and is not an appraisal. "below" and "above" need a gap of at least $1,000 that is also wider than the usual spread of asking prices for that version: for most cars about 3 to 7% over for "above" and about 5 to 9% under for "below", more where few similar cars are known, and "below" must still hold with any one similar car left out. Otherwise it is "typical". Absent when the car could not be compared: new or under 2,000 miles, no asking price or mileage, a disclosed buyback or branded title, fewer than 3 similar cars, similar cars that are not all one version, or an asking price so far under them that the gap is more than 30% of it.';

function withSimilar<T extends object>(rec: T, bucket: string | undefined): T {
  return bucket ? { ...rec, asking_vs_similar: bucket } : rec;
}

/** get_listing's record: the REST record, labelled, with the listing page's
 *  battery-warranty row for this car and the price band where both hold.
 *  The live price must be the price the band was taken at; a car whose
 *  price has moved since the publish gets no band until the next one. */
async function connectorListing(vin: string, ctx: () => Promise<BandSet | null>) {
  // A malformed VIN is answered without starting the price context's reads.
  const pc = /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin) ? ctx() : undefined;
  const r = await liveListingByVin(vin);
  if ("error" in r) return r;
  const { record, listing, enriched } = r;
  let out: typeof record & { battery_warranty?: unknown; asking_vs_similar?: string } = labelled(record);
  const warranty = carBatteryWarranty(enriched.row, listing);
  if (warranty) out = { ...out, battery_warranty: warranty };
  const set = await pc!;
  if (set && hasRealPrice(listing)) out = withSimilar(out, bucketFor(set, set.asOf, listing.id, listing.priceUsd));
  return out;
}

/** `f`, run on its first call only; later calls share its promise. */
function once<T>(f: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | undefined;
  return () => (p ??= f());
}

/** How long compare_listings waits for all of its cars. */
export const COMPARE_WAIT_MS = 25_000;
export const COMPARE_MIN = 2;
export const COMPARE_MAX = 5;

async function compareListings(args: Record<string, unknown>) {
  const raw = args.vins;
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string")) throw new Error("invalid query: vins: expected an array of VINs");
  const vins = [...new Set(raw.map((v: string) => v.trim().toUpperCase()))];
  if (vins.length < COMPARE_MIN || vins.length > COMPARE_MAX) {
    throw new Error(`invalid query: vins: expected ${COMPARE_MIN} to ${COMPARE_MAX} different VINs`);
  }
  // One band set for every car, so the call reads no more than one
  // get_listing per VIN does.
  const ctx = once(() => similarBands());
  const got = await Promise.all(vins.map((v) => bounded(() => connectorListing(v, ctx), COMPARE_WAIT_MS)));
  const listings: unknown[] = [];
  const not_found: string[] = [];
  const unavailable: string[] = [];
  got.forEach((r, i) => {
    if (r === null) unavailable.push(vins[i]);
    else if ("error" in r) not_found.push(vins[i]);
    else {
      const { as_of: _a, ...rec } = r;
      void _a;
      listings.push(rec);
    }
  });
  return sourced({ as_of: new Date().toISOString(), listings, not_found, ...(unavailable.length ? { unavailable } : {}) });
}

export const TOOLS: McpTool[] = [
  {
    name: "search_listings",
    title: "Search EV listings",
    annotations: READ_ONLY,
    description: `Search every electric and plug-in hybrid vehicle listed for sale in the United States that Census tracks — new, used and certified, from dealers' own sites and manufacturer inventory. Returns matching listings with price, mileage, location, the seller's name and website, a seller link that forwards through censusev.com to the dealer's own page for the car, and the EV facts the site stands behind (battery kWh, EPA range, charge port, heat pump, DC fast charging), each marked estimated when it is not the manufacturer's own figure. Also returns a breakdown of every matching car, not only the returned page: cars per model year, cars per trim (top ${BREAKDOWN_TRIMS}, when every match is one model), and the lowest, median and highest asking price. Each record carries last_seen, the day the car was last seen for sale. ${SIMILAR_DESCRIPTION} Inventory is as of the \`as_of\` timestamp in the result.`,
    inputSchema: SEARCH_SCHEMA,
    handler: async (args) => (await runSearch(args)).result,
  },
  {
    name: "get_listing",
    title: "Get one listing by VIN",
    annotations: READ_ONLY,
    description: `One listing by VIN: every field of the search record plus its asking-price history on this seller, and battery_warranty, this car's high-voltage battery warranty as its Census EV page gives it: status (for example "Expired" or "In force · 38,200 mi or 3+ yr left"), in_force, and estimated when the term is not the manufacturer's own figure. battery_warranty is absent where the page gives no verdict for the car. ${SIMILAR_DESCRIPTION} The seller link forwards through censusev.com to the dealer's own page for the car.`,
    inputSchema: { type: "object", properties: { vin: { type: "string", description: "17-character VIN." } }, required: ["vin"], additionalProperties: false },
    handler: async (args) => {
      const r = await connectorListing(String(args.vin ?? ""), once(() => similarBands()));
      if ("error" in r) throw new Error(r.error);
      return sourced(r);
    },
  },
  {
    name: "compare_listings",
    title: "Compare listings",
    annotations: READ_ONLY,
    description: `Two to five listings by VIN, side by side: for each, its full record with its asking-price history, battery_warranty and asking_vs_similar where they exist. VINs with no live listing are returned in not_found, and any that could not be read in time in unavailable. Results are as of the \`as_of\` timestamp.`,
    inputSchema: {
      type: "object",
      properties: {
        vins: {
          type: "array",
          items: { type: "string", description: "17-character VIN." },
          minItems: COMPARE_MIN,
          maxItems: COMPARE_MAX,
          description: `${COMPARE_MIN} to ${COMPARE_MAX} VINs.`,
        },
      },
      required: ["vins"],
      additionalProperties: false,
    },
    handler: compareListings,
  },
  {
    name: "list_models",
    title: "List makes and models",
    annotations: READ_ONLY,
    // A description says what the tool returns and nothing about when to
    // call it or what to call next: a connector directory's policy is that
    // tool descriptions carry no instructions about other tools, and the
    // old second sentence ("Use it ... before searching") was one. The
    // server's own `instructions` field is where that guidance lives.
    description: "Every make and model with live listings, with counts, in the exact spellings the listing search accepts.",
    inputSchema: {
      type: "object",
      properties: { make: { type: "string", description: 'Limit the list to one make, e.g. "Kia". Omit for every make.' } },
      additionalProperties: false,
    },
    handler: async (args) => {
      const r = await listModels(args.make === undefined ? undefined : String(args.make));
      if ("error" in r) throw new Error(r.error);
      return sourced(r);
    },
  },
  {
    name: "battery_warranty",
    title: "Battery warranty by model year",
    annotations: READ_ONLY,
    description:
      "The manufacturer's high-voltage battery warranty for a make, model and model year, as the Census EV warranty checker gives it: the term in years and miles (with the trims each term covers where the terms differ by trim), whether it is still in force at an odometer reading where that can be established, the battery capacity the warranty guarantees, and whether coverage transfers to a later owner. A term is marked estimated when it is not the manufacturer's own figure. Returns established: false and no term when the versions of that model year disagree or have not been researched. Includes the model's battery-warranty fact sheet on censusev.com where one exists.",
    inputSchema: {
      type: "object",
      properties: {
        make: { type: "string", description: 'Make, e.g. "Kia". Case, spacing and common short forms ("Chevy", "VW") are accepted.' },
        model: { type: "string", description: 'Model, e.g. "EV6". Punctuation and spacing are ignored.' },
        year: { type: "integer", description: "Model year, e.g. 2023." },
        mileage: { type: "integer", minimum: 0, description: "Odometer reading in miles. With it, status says whether the warranty is in force where that can be established." },
      },
      required: ["make", "model", "year"],
      additionalProperties: false,
    },
    handler: async (args) => sourced(batteryWarranty(args)),
  },
  {
    name: "market_snapshot",
    title: "Model market snapshot",
    annotations: READ_ONLY,
    description:
      "Figures for one model as Census EV publishes them on its model page and its market page: how many are for sale and as of when; cars for sale and median asking price by model year; the mileage-adjusted asking price of a used one at 40,000 miles with its 30- and 60-day change; and the share of used ones no longer listed 30 days after they appeared, with the window it was measured over. A figure is null or absent where the site prints none, because too few cars stand behind it or it could not be read.",
    inputSchema: {
      type: "object",
      properties: {
        make: { type: "string", description: 'Make, e.g. "Hyundai". Case, spacing and common short forms ("Chevy", "VW") are accepted.' },
        model: { type: "string", description: 'Model, e.g. "Ioniq 5". Punctuation and spacing are ignored.' },
      },
      required: ["make", "model"],
      additionalProperties: false,
    },
    handler: async (args) =>
      sourced(
        await marketSnapshot(args, {
          hubIndex: apiHubIndex,
          market: (signal) => fetchMarket({ signal }),
          speed: (signal) => fetchSpeed({ signal }),
        }),
      ),
  },
];

export const INSTRUCTIONS =
  "Census EV lists electric and plug-in hybrid vehicles for sale in the United States. Call list_models to learn make and model spellings; search_listings to find cars (give a zip for nearby results; its breakdown summarises every match, and detail=full returns every field); get_listing for one car's full record and price history; compare_listings to set two to five cars side by side by VIN; battery_warranty for a model year's battery warranty and whether it is in force at a mileage; market_snapshot for a model's counts, median asking prices by year and price trend. A car's seller.url forwards through censusev.com to the dealer's own page, which is where the car is bought; seller.name and seller.domain say where it leads. last_seen is the day a car was last seen for sale. battery_warranty on a get_listing or compare_listings record is that car's own battery-warranty standing, as its page gives it. asking_vs_similar says whether the asking price is below, typical of or above similar cars on Census EV, listed now or in the last 30 days; it compares asking prices, is not an appraisal, and is absent when a car could not be compared, which includes new cars. Facts marked estimated are not the manufacturer's own figure, and an absent field is one the site does not know. Results are as of the as_of timestamp.";
