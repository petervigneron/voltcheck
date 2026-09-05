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
    year_min: { type: "integer" },
    year_max: { type: "integer" },
    price_min: { type: "integer", description: "USD." },
    price_max: { type: "integer", description: "USD. Cars with no real asking price are excluded when a price bound is given." },
    mileage_max: { type: "integer" },
    condition: { type: "string", description: 'Comma-separated: "new", "used", "certified".' },
    kind: { type: "string", enum: ["BEV", "PHEV"], description: "Battery-electric or plug-in hybrid." },
    state: { type: "string", description: 'Comma-separated two-letter state codes, e.g. "CA,OR".' },
    zip: { type: "string", description: "5-digit US ZIP; results are limited to radius_mi of it and sorted by distance unless sort is given." },
    radius_mi: { type: "integer", description: "Default 100." },
    range_min: { type: "integer", description: "Minimum EPA range in miles (electric-only for a plug-in hybrid)." },
    kwh_min: { type: "integer", description: "Minimum battery capacity in kWh." },
    heat_pump: { type: "string", enum: ["yes", "no"] },
    charge_port: { type: "string", description: 'Comma-separated: "NACS", "CCS1", "CHAdeMO".' },
    drive: { type: "string", description: 'Comma-separated: "AWD", "RWD", "FWD".' },
    body: { type: "string", description: 'Comma-separated: "suv", "sedan", "truck", "van", "hatchback".' },
    sort: { type: "string", enum: [...SORTS] },
    limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT, description: "Default 25." },
    offset: { type: "integer", minimum: 0 },
  },
  additionalProperties: false,
};

export const TOOLS: McpTool[] = [
  {
    name: "search_listings",
    description:
      "Search every electric and plug-in hybrid vehicle listed for sale in the United States that Voltcheck tracks — new, used and certified, from dealers' own sites and manufacturer inventory. Returns matching listings with price, mileage, location, the dealer's own page, and the EV facts the site stands behind (battery kWh, EPA range, charge port, heat pump, DC fast charging), each marked estimated when it is not the manufacturer's own figure. Inventory is as of the `as_of` timestamp in the result.",
    inputSchema: SEARCH_SCHEMA,
    handler: async (args) => {
      const r = await searchListings(args);
      if ("error" in r) throw new Error(r.error);
      return r;
    },
  },
  {
    name: "get_listing",
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
    description: "Every make and model with live listings, with counts. Use it to learn the exact make and model spellings before searching.",
    inputSchema: { type: "object", properties: { make: { type: "string" } }, additionalProperties: false },
    handler: async (args) => {
      const r = await listModels(args.make === undefined ? undefined : String(args.make));
      if ("error" in r) throw new Error(r.error);
      return r;
    },
  },
];

export const INSTRUCTIONS =
  "Voltcheck lists electric and plug-in hybrid vehicles for sale in the United States. Call list_models to learn make and model spellings, search_listings to find cars (give a zip for nearby results), get_listing for one car's price history. Every record carries the dealer's own page in seller.url; send people there to buy. Facts marked estimated are not the manufacturer's own figure. Results are as of the as_of timestamp.";
