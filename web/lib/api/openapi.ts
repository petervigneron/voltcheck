import { SITE } from "./records";
import { SORTS, MAX_LIMIT, DEFAULT_LIMIT, DEFAULT_RADIUS_MI } from "./query";

// The OpenAPI 3.1 document for /api/v1, served at /api/v1/openapi.json.
// Kept beside the code it describes; the parameter list is the one
// lib/api/query.ts parses and the record schema is lib/api/records.ts's
// ApiListing, so a change to either has one more place to land.

const qp = (name: string, description: string, schema: Record<string, unknown> = { type: "string" }) => ({
  name,
  in: "query",
  description,
  schema,
});

const listingSchema = {
  type: "object",
  description:
    "One vehicle listing. Facts marked `estimated: true` are not the manufacturer's own figure. A fact that is absent is one the site could not stand behind, not one that is false.",
  properties: {
    id: { type: "string" },
    vin: { type: "string" },
    url: { type: "string", description: "The car's page on Census." },
    year: { type: "integer" },
    make: { type: "string" },
    model: { type: "string" },
    trim: { type: "string", description: "Present only when the site is willing to stand behind it." },
    title: { type: "string" },
    condition: { type: "string", enum: ["new", "used", "certified"] },
    kind: { type: "string", enum: ["BEV", "PHEV"], description: "Battery-electric or plug-in hybrid." },
    body: { type: "string", enum: ["suv", "sedan", "truck", "van", "hatchback"] },
    drive: { type: "string", enum: ["RWD", "AWD", "FWD"] },
    price_usd: { type: ["integer", "null"], description: "Null when the seller printed something that is not an asking price." },
    previous_price_usd: { type: "integer" },
    price_changed_at: { type: "string", format: "date-time" },
    price_cut: { type: "object", properties: { usd: { type: "integer" }, at: { type: "string" } } },
    mileage: { type: "integer" },
    exterior_color: { type: "string" },
    location: {
      type: "object",
      properties: { city: { type: "string" }, state: { type: "string" }, zip: { type: "string" }, lat: { type: "number" }, lng: { type: "number" } },
    },
    seller: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["dealer", "private"] },
        name: { type: "string" },
        domain: { type: "string" },
        url: { type: "string", description: "The listing on the seller's own site. Send buyers here." },
      },
    },
    image_url: { type: "string" },
    battery: { type: "object", properties: { kwh: { type: "integer" }, basis: { type: "string", enum: ["usable", "total"] }, estimated: { type: "boolean" } } },
    range: {
      type: "object",
      description: "EPA-rated unless estimated. For a plug-in hybrid, the electric-only figure.",
      properties: { mi: { type: "integer" }, estimated: { type: "boolean" }, electric_only: { type: "boolean" } },
    },
    charge_port: { type: "object", properties: { standard: { type: "string", enum: ["NACS", "CCS1", "CHAdeMO", "J1772"] }, estimated: { type: "boolean" } } },
    heat_pump: { type: "string", enum: ["yes", "no"] },
    dc_fast_charge: { type: "string", enum: ["yes", "no"] },
    charge_time_10_80_min: { type: "object", properties: { min: { type: "integer" }, estimated: { type: "boolean" } } },
    battery_replaced: { type: "object", properties: { date: { type: "string" } }, description: "The pack was replaced under a manufacturer campaign." },
    buyback_disclosed: { type: "boolean", description: "The seller's own description discloses a manufacturer repurchase." },
    branded_title_disclosed: { type: "boolean", description: "The seller's own description discloses a branded title (salvage, rebuilt, flood, lemon)." },
    listed_on: { type: "string", format: "date" },
    first_seen: { type: "string", format: "date" },
    last_seen: { type: "string", format: "date" },
    distance_mi: { type: "integer", description: "Miles from the query zip, when one was given." },
  },
  required: ["id", "vin", "url", "year", "make", "model", "title", "price_usd", "location", "seller"],
};

export const OPENAPI = {
  openapi: "3.1.0",
  info: {
    title: "Census API",
    version: "1.0.0",
    description:
      "Every electric and plug-in hybrid vehicle listed for sale in the United States that Census tracks — new, used and certified — read from dealers' own sites and manufacturer inventory. Read-only, no key. Inventory moves once a night; every response carries `as_of`. A Model Context Protocol endpoint with the same three operations is at /api/mcp.",
  },
  servers: [{ url: SITE }],
  paths: {
    "/api/v1/listings": {
      get: {
        operationId: "searchListings",
        summary: "Search listings",
        parameters: [
          qp("make", 'Make, e.g. "Tesla".'),
          qp("model", 'Model, e.g. "Model Y". Spacing and punctuation are ignored.'),
          qp("year_min", "", { type: "integer" }),
          qp("year_max", "", { type: "integer" }),
          qp("price_min", "USD.", { type: "integer" }),
          qp("price_max", "USD. Cars with no real asking price are excluded when a price bound is given.", { type: "integer" }),
          qp("mileage_max", "", { type: "integer" }),
          qp("condition", 'Comma-separated: "new", "used", "certified".'),
          qp("kind", "Battery-electric or plug-in hybrid.", { type: "string", enum: ["BEV", "PHEV"] }),
          qp("state", 'Comma-separated two-letter state codes, e.g. "CA,OR".'),
          qp("zip", "5-digit US ZIP. Results are limited to `radius_mi` of it and, unless `sort` is given, ordered by distance."),
          qp("radius_mi", `Default ${DEFAULT_RADIUS_MI}.`, { type: "integer" }),
          qp("range_min", "Minimum EPA range in miles (electric-only for a plug-in hybrid).", { type: "integer" }),
          qp("kwh_min", "Minimum battery capacity in kWh.", { type: "integer" }),
          qp("heat_pump", "", { type: "string", enum: ["yes", "no"] }),
          qp("charge_port", 'Comma-separated: "NACS", "CCS1", "CHAdeMO".'),
          qp("drive", 'Comma-separated: "AWD", "RWD", "FWD".'),
          qp("body", 'Comma-separated: "suv", "sedan", "truck", "van", "hatchback".'),
          qp("sort", "Default: distance when a zip is given, otherwise price_asc.", { type: "string", enum: [...SORTS] }),
          qp("limit", `1–${MAX_LIMIT}, default ${DEFAULT_LIMIT}.`, { type: "integer" }),
          qp("offset", "For paging; the response's `next_offset` is the next page's value.", { type: "integer" }),
        ],
        responses: {
          "200": {
            description: "A page of listings.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    as_of: { type: "string", format: "date-time" },
                    total: { type: "integer" },
                    offset: { type: "integer" },
                    limit: { type: "integer" },
                    next_offset: { type: ["integer", "null"] },
                    results: { type: "array", items: listingSchema },
                  },
                },
              },
            },
          },
          "400": { description: "A parameter the API does not understand; `details` names it." },
          "503": { description: "No fresh inventory artifact is available." },
        },
      },
    },
    "/api/v1/listings/{vin}": {
      get: {
        operationId: "getListing",
        summary: "One listing by VIN, with its asking-price history on this seller",
        parameters: [{ name: "vin", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "The listing.",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    listingSchema,
                    {
                      type: "object",
                      properties: {
                        as_of: { type: "string", format: "date-time" },
                        price_history: { type: "array", items: { type: "object", properties: { usd: { type: "integer" }, at: { type: "string", format: "date-time" } } } },
                      },
                    },
                  ],
                },
              },
            },
          },
          "404": { description: "No live listing for this VIN." },
        },
      },
    },
    "/api/v1/models": {
      get: {
        operationId: "listModels",
        summary: "Every make and model with live listings, with counts",
        parameters: [qp("make", "Limit to one make.")],
        responses: {
          "200": {
            description: "Makes and models.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    as_of: { type: "string", format: "date-time" },
                    total: { type: "integer" },
                    makes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          make: { type: "string" },
                          slug: { type: "string" },
                          count: { type: "integer" },
                          models: { type: "object", additionalProperties: { type: "integer" } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    // ── The paid tier: a data key (lib/api/paid.ts, /data). Own paths, so a
    // keyed answer can never share a CDN entry with a free one. ──
    "/api/v1/data/listings": {
      get: {
        operationId: "searchListingsPaid",
        summary: "Search listings, with the paid fields (data key)",
        description:
          "Takes every parameter /api/v1/listings takes and returns the same records, plus `ask_vs_similar` and `incentive` on each car that has one.",
        security: [{ dataKey: [] }],
        responses: {
          "200": { description: "As /api/v1/listings, each result a PaidListing.", content: { "application/json": { schema: { type: "object", properties: { results: { type: "array", items: { $ref: "#/components/schemas/PaidListing" } } } } } } },
          "401": { description: "No key, or a key that is not active." },
        },
      },
    },
    "/api/v1/data/listings/{vin}": {
      get: {
        operationId: "getListingPaid",
        summary: "One car with its price history and the paid fields (data key)",
        security: [{ dataKey: [] }],
        parameters: [{ name: "vin", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "The listing.", content: { "application/json": { schema: { $ref: "#/components/schemas/PaidListing" } } } },
          "401": { description: "No key, or a key that is not active." },
          "404": { description: "No live listing for this VIN." },
        },
      },
    },
    "/api/v1/data/export": {
      get: {
        operationId: "exportIndex",
        summary: "The bulk export's index: one file per make (data key)",
        security: [{ dataKey: [] }],
        responses: { "200": { description: "Makes, counts and the URL of each file." }, "401": { description: "No key, or a key that is not active." } },
      },
    },
    "/api/v1/data/export/{make}": {
      get: {
        operationId: "exportMake",
        summary: "Every listing of one make, as NDJSON, with the paid fields (data key)",
        description: "One PaidListing per line. As of the last publish; the `x-as-of` header says when. `x-total` is the line count.",
        security: [{ dataKey: [] }],
        parameters: [{ name: "make", in: "path", required: true, description: "A make slug from /api/v1/data/export.", schema: { type: "string" } }],
        responses: {
          "200": { description: "NDJSON.", content: { "application/x-ndjson": { schema: { $ref: "#/components/schemas/PaidListing" } } } },
          "401": { description: "No key, or a key that is not active." },
          "404": { description: "No such make." },
        },
      },
    },
  },
  components: {
    schemas: {
      Listing: listingSchema,
      PaidListing: {
        allOf: [
          { $ref: "#/components/schemas/Listing" },
          {
            type: "object",
            properties: {
              ask_vs_similar: {
                type: "object",
                description:
                  "The asking price minus the mileage-adjusted median ASKING price of the same variant listed now. Negative is below similar listings. Not a sale price and not a valuation. Absent when fewer than four comparable cars exist or a guardrail withheld it, which is most cars.",
                properties: { delta_usd: { type: "integer" }, peers: { type: "integer" }, trim_matched: { type: "boolean" } },
              },
              incentive: {
                type: "object",
                description: "The state or utility incentive program this car leads with under the site's eligibility policy. Absent means it meets none.",
                properties: {
                  program: { type: "string" },
                  usd: { type: "integer" },
                  over_cap_usd: { type: "integer", description: "How far the asking price sits over the program's price cap, when it does." },
                  programs: { type: "integer", description: "How many programs the car meets." },
                  state: { type: "string" },
                  utility: { type: "boolean" },
                },
              },
            },
          },
        ],
      },
    },
    securitySchemes: {
      dataKey: { type: "http", scheme: "bearer", description: `A data key from ${SITE}/data. Also accepted as an X-Api-Key header. Never in the query string.` },
    },
  },
};
