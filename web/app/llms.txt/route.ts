import { BASE } from "@/lib/sitemap";
import { SHARDS } from "@/lib/listings/pack";
import { FIRST_PAGE_SIZE } from "@/lib/listings/firstPaint";
import { MODEL_HUBS } from "@/lib/listings/modelHubs";

// /llms.txt — the llmstxt.org file: what this site is and which of its URLs an
// agent shopping on someone's behalf should read.
//
// Served the way sitemap.xml is (app/<filename>/route.ts, force-static, a
// constant body) rather than as a file in public/, for the same reason
// robots.ts gives: the counts below — 24 index shards, the model-hub total —
// live in one place each, and a route can import them. A copy in public/
// would be a second hand-maintained index of numbers that change, which is
// the failure mode that orphaned four enrichment row ids in August. It reads
// no data, so it prerenders in milliseconds and stays up whatever the
// database is doing.
//
// COPY: machine-facing documentation, not shopper-facing copy, but every
// sentence is built from words the site already publishes — /methodology's
// source list and its "no default value, no best guess" line, /facts,
// /ev, /vin and /bot's own descriptions, and the root layout's title
// description. Nothing here makes a claim a page doesn't already make.

const BODY = `# Voltcheck

> Every electric and plug-in hybrid car for sale in the United States, new, used and certified, with the real pack, the real range, and what the warranty does for you. Price, mileage, color, location and the link back to the seller's own page come from that seller. Specs come from the manufacturer's spec sheets, press materials and window stickers; EPA range and efficiency from fueleconomy.gov's data; vehicle decode data from NHTSA's vPIC database; battery recalls and complaints from NHTSA; and title records from Washington State DOL. Where no primary source exists we use named secondary sources and mark the figure est. When we can't support a claim, we show nothing: no default value, no best guess, no "typically."

## Pages

- [Browse](${BASE}/): the whole grid, filtered in the browser by make, model, year, price, mileage, range and charging. The cars are not in this page's HTML; they arrive from the JSON under Listing data below.
- [Models](${BASE}/ev): one page per nameplate, electric and plug-in hybrid, new and used. ${MODEL_HUBS.length} of them, and the route from the site's own pages to the listings.
- [Model page](${BASE}/ev/hyundai/ioniq-5): one nameplate's cars, each linking to its own listing page. The path is /ev/{make}/{model}.
- [Listing page](${BASE}/listing/1g1fz6ev2vf106485): one car, for as long as it is for sale. The path is /listing/{VIN in lower case}. Carries schema.org Car JSON-LD — VIN, name, brand, model, year, odometer, condition, fuel type, color, drivetrain, the offer and its seller — plus the battery, range, charge port and heat pump the page itself shows.
- [EV fact sheets](${BASE}/facts): one page per question, sourced to the manufacturer's own documents wherever one exists. Each carries FAQPage JSON-LD.
- [What's my car worth?](${BASE}/worth): a valuation from a make, model, year, trim and odometer reading.
- [VIN check](${BASE}/vin): paste any EV's VIN and get the same report our listings carry: the pack this exact car has, heat pump, fast-charge status, what the warranty does on resale, and the questions to ask the seller. The path is /vin/{VIN}.
- [Where this data comes from](${BASE}/methodology): the manufacturer, EPA, NHTSA and state title sources behind every spec, price and warranty fact.
- [About Voltcheck](${BASE}/about)
- [VoltcheckBot](${BASE}/bot): what our own bot is, how it behaves, and how a site operator can exclude it.
- [Sitemap](${BASE}/sitemap.xml)

## Listing data

The grid's dataset is public JSON, cached at the edge for a day and rewritten by a publish that runs nightly. Read it rather than the grid.

- [${BASE}/api/index/first](${BASE}/api/index/first): \`{ v, day, total, quick, popular, suggestions, makesModels, top }\`. \`total\` is how many cars the site holds. \`day\` is when the body was built, counted in whole UTC days from 1970-01-01. \`top\` is the first ${FIRST_PAGE_SIZE} cards, in the same packed form as a shard.
- [${BASE}/api/index/0](${BASE}/api/index/0) through [${BASE}/api/index/${SHARDS - 1}](${BASE}/api/index/${SHARDS - 1}): the whole feed in ${SHARDS} files. Which file a car is in is fixed by its id, so the ${SHARDS} together are every car, once each.
- [${BASE}/api/index/trims](${BASE}/api/index/trims): the trim names behind the valuation form's dropdown.

A shard body is \`{ v: 1, t, h, r }\`. \`t\` (fact chips) and \`h\` (image origins) each hold one copy of a repeated thing; \`r\` is the cars, pointing into them by index. A car's keys:

\`i\` id, the VIN in lower case · \`q\` a lower-case string of the words the car can be searched by · \`y\` year · \`k\` make · \`o\` model · \`n\` title · \`p\` asking price in dollars · \`f\` present and 0 when that price is not one we could confirm · \`m\` odometer miles · \`cd\` condition, 0 new 1 used 2 certified · \`d\` drive, 0 RWD 1 AWD 2 FWD · \`b\` body, 0 suv 1 sedan 2 truck 3 van 4 hatchback · \`ct\` city · \`st\` state · \`l\` [latitude, longitude] · \`g\` image, [index into \`h\`, the rest of the URL] · \`tr\` trim · \`kw\` battery capacity in kWh · \`rm\` range in miles · \`hp\` heat pump, 0 yes 1 no 2 verify · \`pr\` 1 when this car's battery has been replaced · \`bb\` 1 when the seller's own description discloses a manufacturer repurchase · \`lo\` the date the car appeared on the seller's site · \`c\` the latest price cut, \`{a: amount, t: date, pv: the price before}\` · \`ts\` indices into \`t\`.

How a price compares with the same version listed right now, and which purchase programs a car qualifies for, are part of [Voltcheck Pro](${BASE}/pro) and are not in these files.

Where a key is coded, a seller's own string rides in its place when the seller said something the table doesn't list. An absent key means we don't know, never a default.

## API

For a program that would rather ask than read shards. No key. Inventory moves once a night and every response carries \`as_of\`.

- [${BASE}/api/v1/openapi.json](${BASE}/api/v1/openapi.json): the OpenAPI 3.1 document for everything below.
- [${BASE}/api/v1/listings](${BASE}/api/v1/listings?make=Tesla&model=Model%203&zip=94110&radius_mi=50): search. Parameters: make, model, year_min, year_max, price_min, price_max, mileage_max, condition (new, used, certified), kind (BEV or PHEV), state, zip with radius_mi, range_min, kwh_min, heat_pump, charge_port, drive, body, sort, limit, offset. Each result carries the car, its asking price, the seller's own page, and the battery, range, charge port, heat pump and fast-charge facts the car's page shows, marked estimated where the figure is not the manufacturer's own.
- [${BASE}/api/v1/listings/{vin}](${BASE}/api/v1/listings/5YJ3E1EA4MF099936): one car with its asking-price history.
- [${BASE}/api/v1/models](${BASE}/api/v1/models): every make and model with live listings, with counts.
- [${BASE}/api/mcp](${BASE}/api/mcp): a Model Context Protocol server (Streamable HTTP, POST) with the same three operations as tools: search_listings, get_listing, list_models.

## Terms

- [robots.txt](${BASE}/robots.txt) says what we ask of a bot reading this site. Everything above is allowed.
- Every listing links back to the seller's own page, and that page is where the car is bought.
`;

export const dynamic = "force-static";

export function GET() {
  return new Response(BODY, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
