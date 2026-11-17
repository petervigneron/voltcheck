import type { McpTool } from "./server";
import { searchListings, listingByVin, listModels, BREAKDOWN_TRIMS, type SearchResponse } from "@/lib/api/search";
import { SORTS, MAX_LIMIT } from "@/lib/api/query";
import { SITE } from "@/lib/api/records";
import { apiHubIndex } from "@/lib/api/artifacts";
import { fetchMarket } from "@/lib/market";
import { fetchSpeed } from "@/lib/listings/speed";
import { batteryWarranty, marketSnapshot } from "./insights";

// The listing tools are the REST endpoints with a schema on the front: same
// functions, same records, same as_of, so an agent on either door sees the
// same inventory. The connector differs from REST in three places only:
// records are labelled (labelled(): our page with ?ref=mcp, the seller link
// through /go), search records are compact unless asked for in full, and a
// search carries a breakdown of every match. battery_warranty and
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
        'How much of each record to return. Default "compact", which leaves out id (the VIN in lower case), image_url, location.zip, location.lat, location.lng, previous_price_usd, price_changed_at, listed_on, first_seen and last_seen. "full" returns every field.',
    },
  },
  additionalProperties: false,
};

/** Fields a compact record leaves out: ids the VIN already is, coordinates
 *  the city, state and distance already say, the picture, and the dates and
 *  previous price behind the history get_listing returns. What an assistant
 *  shows a person about a car (price, miles, year and trim, place, seller,
 *  the EV facts with their estimated flags, a recent cut, our page) stays.
 *  Keep the `detail` description above in step with this list. */
export const COMPACT_OMITS = ["id", "image_url", "previous_price_usd", "price_changed_at", "listed_on", "first_seen", "last_seen"] as const;
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
  const r = await searchListings(query, { breakdown: true });
  // The details are the point: "invalid query" alone does not tell an
  // agent which argument to fix, and the REST door has always said.
  if ("error" in r) throw new Error(r.details?.length ? `${r.error}: ${r.details.join("; ")}` : r.error);
  const { results, breakdown, ...rest } = r;
  return {
    result: sourced({
      ...rest,
      breakdown,
      results: results.map((rec) => (detail === "full" ? labelled(rec) : compact(labelled(rec)))),
    }),
    search: r,
  };
}

export const TOOLS: McpTool[] = [
  {
    name: "search_listings",
    title: "Search EV listings",
    annotations: READ_ONLY,
    description: `Search every electric and plug-in hybrid vehicle listed for sale in the United States that Census tracks — new, used and certified, from dealers' own sites and manufacturer inventory. Returns matching listings with price, mileage, location, the seller's name and website, a seller link that forwards through censusev.com to the dealer's own page for the car, and the EV facts the site stands behind (battery kWh, EPA range, charge port, heat pump, DC fast charging), each marked estimated when it is not the manufacturer's own figure. Also returns a breakdown of every matching car, not only the returned page: cars per model year, cars per trim (top ${BREAKDOWN_TRIMS}, when every match is one model), and the lowest, median and highest asking price. Inventory is as of the \`as_of\` timestamp in the result.`,
    inputSchema: SEARCH_SCHEMA,
    handler: async (args) => (await runSearch(args)).result,
  },
  {
    name: "get_listing",
    title: "Get one listing by VIN",
    annotations: READ_ONLY,
    description:
      "One listing by VIN: every field of the search record plus its asking-price history on this seller. The seller link forwards through censusev.com to the dealer's own page for the car.",
    inputSchema: { type: "object", properties: { vin: { type: "string", description: "17-character VIN." } }, required: ["vin"], additionalProperties: false },
    handler: async (args) => {
      const r = await listingByVin(String(args.vin ?? ""));
      if ("error" in r) throw new Error(r.error);
      return sourced(labelled(r));
    },
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
  "Census EV lists electric and plug-in hybrid vehicles for sale in the United States. Call list_models to learn make and model spellings; search_listings to find cars (give a zip for nearby results; its breakdown summarises every match, and detail=full returns every field); get_listing for one car's full record and price history; battery_warranty for a model year's battery warranty and whether it is in force at a mileage; market_snapshot for a model's counts, median asking prices by year and price trend. A car's seller.url forwards through censusev.com to the dealer's own page, which is where the car is bought; seller.name and seller.domain say where it leads. Facts marked estimated are not the manufacturer's own figure, and an absent field is one the site does not know. Results are as of the as_of timestamp.";
