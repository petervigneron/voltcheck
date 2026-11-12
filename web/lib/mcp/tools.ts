import type { McpTool } from "./server";
import { searchListings, listingByVin, listModels } from "@/lib/api/search";
import { SORTS, MAX_LIMIT } from "@/lib/api/query";

// The MCP tools are the REST endpoints with a schema on the front: same
// functions, same records, same as_of, so an agent on either door sees the
// same inventory.

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
    kind: { type: "string", enum: ["BEV", "PHEV"], description: "Battery-electric or plug-in hybrid." },
    state: { type: "string", description: 'Comma-separated two-letter state codes, e.g. "CA,OR".' },
    zip: { type: "string", description: "5-digit US ZIP; results are limited to radius_mi of it and sorted by distance unless sort is given." },
    radius_mi: { type: "integer", description: "Search radius around zip, in miles. Default 100." },
    range_min: { type: "integer", description: "Minimum EPA range in miles (electric-only for a plug-in hybrid)." },
    kwh_min: { type: "integer", description: "Minimum battery capacity in kWh." },
    heat_pump: { type: "string", enum: ["yes", "no"], description: "Only cars known to have (yes) or not have (no) a heat pump. Cars where it is not established match neither." },
    charge_port: { type: "string", description: 'Comma-separated: "NACS", "CCS1", "CHAdeMO".' },
    drive: { type: "string", description: 'Comma-separated: "AWD", "RWD", "FWD".' },
    body: { type: "string", description: 'Comma-separated: "suv", "sedan", "truck", "van", "hatchback".' },
    sort: { type: "string", enum: [...SORTS], description: "Result order. distance needs a zip. Default: distance when a zip is given, otherwise price_asc." },
    limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT, description: `Results to return, 1 to ${MAX_LIMIT}. Default 25.` },
    offset: { type: "integer", minimum: 0, description: "Results to skip, for paging. Default 0." },
  },
  additionalProperties: false,
};

// Every tool here reads published listings and nothing else: no writes, no
// accounts, the same answer for the same arguments until the next publish,
// and no reach beyond this site's own data. The annotations say so, because
// a host decides from them whether a call needs the user's say-so.
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export const TOOLS: McpTool[] = [
  {
    name: "search_listings",
    title: "Search EV listings",
    annotations: READ_ONLY,
    description:
      "Search every electric and plug-in hybrid vehicle listed for sale in the United States that Census tracks — new, used and certified, from dealers' own sites and manufacturer inventory. Returns matching listings with price, mileage, location, the dealer's own page, and the EV facts the site stands behind (battery kWh, EPA range, charge port, heat pump, DC fast charging), each marked estimated when it is not the manufacturer's own figure. Inventory is as of the `as_of` timestamp in the result.",
    inputSchema: SEARCH_SCHEMA,
    handler: async (args) => {
      const r = await searchListings(args);
      if ("error" in r) throw new Error(r.error);
      return r;
    },
  },
  {
    name: "get_listing",
    title: "Get one listing by VIN",
    annotations: READ_ONLY,
    description: "One listing by VIN: the search record plus its asking-price history on this seller.",
    inputSchema: { type: "object", properties: { vin: { type: "string", description: "17-character VIN." } }, required: ["vin"], additionalProperties: false },
    handler: async (args) => {
      const r = await listingByVin(String(args.vin ?? ""));
      if ("error" in r) throw new Error(r.error);
      return r;
    },
  },
  {
    name: "list_models",
    title: "List makes and models",
    annotations: READ_ONLY,
    description: "Every make and model with live listings, with counts. Use it to learn the exact make and model spellings before searching.",
    inputSchema: {
      type: "object",
      properties: { make: { type: "string", description: 'Limit the list to one make, e.g. "Kia". Omit for every make.' } },
      additionalProperties: false,
    },
    handler: async (args) => {
      const r = await listModels(args.make === undefined ? undefined : String(args.make));
      if ("error" in r) throw new Error(r.error);
      return r;
    },
  },
];

export const INSTRUCTIONS =
  "Census lists electric and plug-in hybrid vehicles for sale in the United States. Call list_models to learn make and model spellings, search_listings to find cars (give a zip for nearby results), get_listing for one car's price history. Every record carries the dealer's own page in seller.url; send people there to buy. Facts marked estimated are not the manufacturer's own figure. Results are as of the as_of timestamp.";
