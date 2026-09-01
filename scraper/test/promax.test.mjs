// ProMax (CX5). Fixtures are trimmed from pages fetched 2026-08-31; the
// rooftop and path are cited on each one. Nothing here reaches the network.
import test from "node:test";
import assert from "node:assert/strict";
import {
  isProMax,
  proMaxSeeds,
  proMaxNextPageUrl,
  proMaxEntries,
  proMaxVehicles,
  proMaxFacetSeeds,
  proMaxLotCount,
} from "../lib/platforms/promax.mjs";
import { fingerprint } from "../lib/fingerprint.mjs";
import { extractVehicles } from "../lib/jsonld.mjs";
import { normalize } from "../lib/normalize.mjs";
import { publishedCondition } from "../lib/condition.mjs";

// www.bradleyautofinance.com/inventory — two of the ten tiles, each a
// <script type="application/ld+json"> beside the anchor its sku keys.
// "0" in the price slot is the platform's no-price state (7 of bradley's 10).
const BRADLEY_SRP = `<!doctype html><html><head>
<link rel="stylesheet" href="/cssLib/CX5_Front_Inventory_Search2.css?v=2026.08.18.01">
</head><body>
<div class="comparearea"><span id="countarea" data-count="44">44 Results</span></div>
<div id="searchpage" data-last="0"><div id="searchresults">
<div class="inventory_result" id="vehicle_result_53219725">
  <a href="//www.bradleyautofinance.com/VehicleDetails/7438/146370/Hudson-NH-2023-Chevrolet-Silverado-1500-4WD-Crew-Cab-147%22-LTZ-USED" order="146370" class="stickerlink">
    <div class="resultlabel"><span class="labelnewused">USED</span> 2023 Chevrolet Silverado 1500 4WD</div></a>
  <div class="photo" stk="146370" did="7438"><img data-src="https://imageserver.promaxinventory.com/7438/image/"></div>
  <script type="application/ld+json">{
    "@context": "http://schema.org/", "@type": "Vehicle",
    "mileageFromOdometer" : "113486", "vehicleEngine":"5.3L ECOTEC3 V8",
    "vehicleIdentificationNumber":"2GCUDGED3P1146370",
    "brand":"Chevrolet", "color":"Black", "itemCondition":"UsedCondition",
    "model":"Silverado 1500 4WD",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency":"USD" },
    "productID":"2GCUDGED3P1146370", "releaseDate":"2023", "sku":"146370",
    "image":"https://imageserver.promaxinventory.com/7438/image/",
    "name":"2023 Chevrolet Silverado 1500 4WD Crew Cab 147&quot; LTZ"
  }</script>
</div>
<div class="inventory_result" id="vehicle_result_53219733">
  <a href="//www.bradleyautofinance.com/VehicleDetails/7438/L28336/Hudson-NH-2020-Jeep-Renegade-4d-SUV-4WD-Latitude-USED" order="L28336" class="stickerlink">x</a>
  <script type="application/ld+json">{
    "@context": "http://schema.org/", "@type": "Vehicle",
    "mileageFromOdometer" : "66432", "vehicleEngine":"2.4L I4 ZERO EVAP M-AIR",
    "vehicleIdentificationNumber":"ZACNJBBB4LPL28336",
    "brand":"Jeep", "color":"BLUE", "itemCondition":"UsedCondition", "model":"Renegade",
    "offers": { "@type": "Offer", "price": "17295", "priceCurrency":"USD" },
    "productID":"ZACNJBBB4LPL28336", "releaseDate":"2020", "sku":"L28336",
    "image":"https://imageserver.promaxinventory.com/7438/image/",
    "name":"2020 Jeep Renegade 4d SUV 4WD Latitude"
  }</script>
</div>
</div>
<div id="cx5_inventory_loadmore">Load Next Page</div>
</div>
<a href="https://www.promaxunlimited.com">Dealer Websites by ProMax</a>
</body></html>`;

// bradleymotors.com/ — the registry domain. Every inventory button points at
// the SISTER domain, protocol-relative, which is how ProMax writes a
// rooftop's own canonical host. The outbound links carry an explicit scheme.
const BRADLEY_HOME = `<html><head>
<link rel="stylesheet" href="/cssLib/CX5_Front_Inventory_Search-ie.css?v=2026.08.18.01"></head><body>
<a href="//www.bradleyautofinance.com/">Home</a>
<a href="//www.bradleyautofinance.com/inventory">View Inventory</a>
<a href="//www.bradleyautofinance.com/featured-vehicles">Featured Vehicles</a>
<a href="//www.bradleyautofinance.com/credit-application">Apply</a>
<a href="//www.bradleyautofinance.com/hours-directions">Hours</a>
<a href="//www.bradleyautofinance.com/about-us">About</a>
<a href="https://www.facebook.com/BradleyMotors/">Facebook</a>
<a href="https://bradleyautofinance.repay.io/">Pay</a>
<a href="tel:(603) 883-6829">Call</a>
<a href="https://www.promaxunlimited.com">ProMax</a>
</body></html>`;

// www.ollenburgmotors.com/ — the facet slugs are the whole point: the used
// lot is 18 cars and /used-cars- + /used-suvs- + /used-trucks- is 2+9+7.
// /new-inventory-garner and /vehicle-finder are NOT search pages.
const OLLENBURG_HOME = `<html><head>
<link rel="stylesheet" href="/cssLib/CX5_Front_Inventory_Search2.css?v=2026.08.18.01"></head><body>
<a href="//www.ollenburgmotors.com/new-vehicles-garner">New Vehicles</a>
<a href="//www.ollenburgmotors.com/new-inventory-garner">New Inventory</a>
<a href="//www.ollenburgmotors.com/new-chevy-equinox">Equinox</a>
<a href="//www.ollenburgmotors.com/new-vehicle-specials">New Specials</a>
<a href="//www.ollenburgmotors.com/used-vehicles-garner">Used Vehicles</a>
<a href="//www.ollenburgmotors.com/used-cars-for-sale-in-garner">Used Cars</a>
<a href="//www.ollenburgmotors.com/used-suvs-for-sale-in-garner">Used SUVs</a>
<a href="//www.ollenburgmotors.com/used-trucks-for-sale-in-ganer">Used Trucks</a>
<a href="//www.ollenburgmotors.com/used-vehicles-14995-or-less">Under $15k</a>
<a href="//www.ollenburgmotors.com/vehicle-finder">Vehicle Finder</a>
<a href="//www.ollenburgmotors.com/value-your-trade">Trade</a>
<a href="//www.ollenburgmotors.com/service">Service</a>
<a href="//www.ollenburgmotors.com/get-pre-approved">Financing</a>
</body></html>`;

// www.nourseezcredit.com/ — ProMax, no inventory of its own; the only
// inventory links it carries are absolute, to another company's site.
const NOURSE_HOME = `<html><head>
<link rel="stylesheet" href="/cssLib/CX5_Front_Inventory_Search.css?v=2026.08.18.01"></head><body>
<a href="//www.nourseezcredit.com/locations">Locations</a>
<a href="//www.nourseezcredit.com/why-nourse-ez-credit">Why Us</a>
<a href="https://www.nourse.com/new-inventory/index.htm">New Inventory</a>
<a href="https://www.nourse.com/used-inventory/index.htm">Used Inventory</a>
</body></html>`;

test("fingerprinted on the vendor's stylesheet library and image server, never the word", () => {
  assert.ok(isProMax('<link href="/cssLib/CX5_Front_Inventory_Search2.css">'));
  assert.ok(isProMax('<img src="https://imageserver.promaxinventory.com/7438/image/">'));
  assert.ok(isProMax('<a href="https://www.promaxunlimited.com">sites by promax</a>'));
  // Prose is not a platform. A lot may call itself ProMax Auto Sales.
  assert.equal(isProMax("<p>ProMax Motors — promax quality, promaxed pricing</p>"), false);
  assert.equal(isProMax(undefined), false);
  assert.equal(isProMax(null), false);
  // Byte-agreement with lib/fingerprint.mjs's promax entry, both directions.
  assert.equal(fingerprint(BRADLEY_SRP), "promax");
  assert.equal(fingerprint('<img src="https://imageserver.promaxinventory.com/7954/image/x.jpg">'), "promax");
  assert.notEqual(fingerprint("<p>ProMax Motors of Dayton</p>"), "promax");
});

test("seeds: the SRP link off the homepage, including onto a sister domain", () => {
  // bradleymotors.com redirects to the sister host, so in the crawl this is
  // already same-host — but the hrefs are written protocol-relative either
  // way, and the seed must come out absolute on the host that serves them.
  assert.deepEqual(proMaxSeeds(BRADLEY_HOME, "https://bradleymotors.com/"), [
    "https://www.bradleyautofinance.com/inventory",
    "https://www.bradleyautofinance.com/featured-vehicles",
  ]);
  assert.deepEqual(proMaxSeeds(BRADLEY_HOME, "https://www.bradleyautofinance.com/"), [
    "https://www.bradleyautofinance.com/inventory",
    "https://www.bradleyautofinance.com/featured-vehicles",
  ]);
});

test("seeds: whole-lot slugs first, facet slugs after, non-search pages never", () => {
  const seeds = proMaxSeeds(OLLENBURG_HOME, "https://www.ollenburgmotors.com/");
  assert.deepEqual(seeds.slice(0, 3), [
    "https://www.ollenburgmotors.com/new-vehicles-garner",
    "https://www.ollenburgmotors.com/new-inventory-garner",
    "https://www.ollenburgmotors.com/used-vehicles-garner",
  ]);
  // The facet slugs that get past the ten-car page-one cap are all seeded.
  for (const p of [
    "/new-chevy-equinox",
    "/new-vehicle-specials",
    "/used-cars-for-sale-in-garner",
    "/used-suvs-for-sale-in-garner",
    "/used-trucks-for-sale-in-ganer",
    "/used-vehicles-14995-or-less",
  ]) {
    assert.ok(seeds.includes(`https://www.ollenburgmotors.com${p}`), p);
  }
  // Pages that carry an inventory word and are not a search page.
  for (const p of ["/vehicle-finder", "/value-your-trade", "/service", "/get-pre-approved"]) {
    assert.equal(seeds.includes(`https://www.ollenburgmotors.com${p}`), false, p);
  }
});

test("seeds: an absolute link to another company is never a seed", () => {
  // nourseezcredit.com is a ProMax lead-capture site with no lot of its own.
  // Its only inventory links are nourse.com's, absolute — seeding one would
  // publish another dealer's cars under this registry row.
  assert.deepEqual(proMaxSeeds(NOURSE_HOME, "https://www.nourseezcredit.com/"), []);
  // Same shape, same answer, when the path would otherwise qualify.
  const cross = '<link href="/cssLib/CX5_Front_Inventory.css"><a href="https://www.someotherdealer.com/inventory">Inv</a>';
  assert.deepEqual(proMaxSeeds(cross, "https://www.outtencars.com/"), []);
});

test("seeds: junk in, nothing out", () => {
  assert.deepEqual(proMaxSeeds(undefined, "https://x.com"), []);
  assert.deepEqual(proMaxSeeds("", "https://x.com"), []);
  // Not a ProMax page: an inventory link on someone else's site is not ours.
  assert.deepEqual(proMaxSeeds('<a href="/inventory">Inventory</a>', "https://x.com"), []);
  assert.deepEqual(proMaxSeeds(BRADLEY_HOME, "not a url"), []);
  // A VDP path is three segments and can never be mistaken for an SRP slug.
  assert.deepEqual(
    proMaxSeeds(
      '<link href="/cssLib/CX5_Front_Inventory.css"><a href="/VehicleDetails/7438/146370/Hudson-NH-2023-Chevrolet-USED">c</a>',
      "https://www.bradleyautofinance.com/",
    ),
    [],
  );
});

test("no next page: the pager is a session POST, not a url", () => {
  // The control test that earned this. bradley's /inventory says 44 Results
  // and renders 10; its "Load Next Page" button POSTs
  // {doWhat:inventorySearch, func:getNextPage} to index.php with no page
  // number, and ?page= ?pg= ?p= ?start= ?offset= ?last= all returned
  // byte-identical page one (2026-08-31). Reaching car 11 is the sitemap's
  // job — every rooftop lists every VDP — and the facet seeds above.
  assert.equal(proMaxNextPageUrl(BRADLEY_SRP, "https://www.bradleyautofinance.com/inventory"), null);
  assert.equal(proMaxNextPageUrl(BRADLEY_SRP, "https://www.bradleyautofinance.com/inventory?page=2"), null);
  assert.equal(proMaxNextPageUrl(undefined, "https://x.com"), null);
  assert.equal(proMaxNextPageUrl("<p>promax</p>", "https://x.com"), null);
});

// The year facet the filter menu prints, as tecforce's /inventory does
// (2026-08-31): eleven checkboxes, one per model year in the 47-car lot.
const YEAR_FACETS = `
  <input type="checkbox" name="check_year_2024" id="check_year_2024" myval="2024" displayname="2024">
  <input type="checkbox" name="check_year_2023" id="check_year_2023" myval="2023" displayname="2023">
  <input type="checkbox" name="check_year_2020" id="check_year_2020" myval="2020" displayname="2020">`;

test("facet seeds: the lot's remaining years, only when there is more to reach", () => {
  const srp = "https://www.bradleyautofinance.com/inventory";
  assert.equal(proMaxLotCount(BRADLEY_SRP), 44);
  // 44 in the lot, 2 tiles in this fixture: there is more, so seed the years.
  assert.deepEqual(proMaxFacetSeeds(BRADLEY_SRP + YEAR_FACETS, srp), [
    `${srp}?year=2024`,
    `${srp}?year=2023`,
    `${srp}?year=2020`,
  ]);
  // A page that rendered its whole result set needs no facet fetches.
  const whole = (BRADLEY_SRP + YEAR_FACETS).replace('data-count="44"', 'data-count="2"');
  assert.deepEqual(proMaxFacetSeeds(whole, srp), []);
  assert.equal(proMaxLotCount(whole), 2);
});

test("facet seeds: a year facet never seeds another one", () => {
  // The loop guard. Without it every ?year= page would re-seed all eleven.
  assert.deepEqual(
    proMaxFacetSeeds(BRADLEY_SRP + YEAR_FACETS, "https://www.bradleyautofinance.com/inventory?year=2023"),
    [],
  );
  assert.deepEqual(proMaxFacetSeeds(undefined, "https://x.com/i"), []);
  assert.deepEqual(proMaxFacetSeeds("<p>promax</p>", "https://x.com/i"), []);
  assert.deepEqual(proMaxFacetSeeds(BRADLEY_SRP + YEAR_FACETS, "not a url"), []);
  // No counter, no claim about what is missing — and so no seeds.
  assert.equal(proMaxLotCount("<div>promax</div>"), null);
  assert.equal(proMaxLotCount(undefined), null);
  assert.deepEqual(
    proMaxFacetSeeds((BRADLEY_SRP + YEAR_FACETS).replace(/data-count="44"/, ""), "https://x.com/i"),
    [],
  );
});

test("entries: each tile's own VDP, paired to its JSON-LD by sku", () => {
  const entries = proMaxEntries(BRADLEY_SRP, "https://www.bradleyautofinance.com/inventory");
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    url: "https://www.bradleyautofinance.com/VehicleDetails/7438/146370/Hudson-NH-2023-Chevrolet-Silverado-1500-4WD-Crew-Cab-147%22-LTZ-USED",
    // The engine string rides along with the name: it is where a ProMax
    // record says what the car burns, and evishEntry() reads the name.
    name: '2023 Chevrolet Silverado 1500 4WD Crew Cab 147" LTZ 5.3L ECOTEC3 V8',
    vin: "2GCUDGED3P1146370",
  });
  assert.equal(entries[1].vin, "ZACNJBBB4LPL28336");
  assert.ok(entries[1].url.endsWith("/VehicleDetails/7438/L28336/Hudson-NH-2020-Jeep-Renegade-4d-SUV-4WD-Latitude-USED"));
});

test("entries: junk in, nothing out", () => {
  assert.deepEqual(proMaxEntries(undefined, "https://x.com"), []);
  assert.deepEqual(proMaxEntries("<p>promax</p>", "https://x.com"), []);
  // A ProMax page with no tiles (nourseezcredit's homepage) links no cars.
  assert.deepEqual(proMaxEntries(NOURSE_HOME, "https://www.nourseezcredit.com/"), []);
  // A node whose sku has no anchor on the page is a car we cannot reach.
  const orphan = `<link href="/cssLib/CX5_Front_Inventory.css">
    <script type="application/ld+json">{"@type":"Vehicle","sku":"999999",
      "vehicleIdentificationNumber":"ZACNJBBB4LPL28336","name":"2020 Jeep Renegade"}</script>
    <a href="/VehicleDetails/7438/146370/Hudson-NH-2023-Chevrolet-USED">other car</a>`;
  assert.deepEqual(proMaxEntries(orphan, "https://www.bradleyautofinance.com/inventory"), []);
});

// The generic path is what actually reads the cars; these two lock in what it
// does with ProMax's two unusual fields, so a change to either is caught here
// rather than on the site.
test('the generic reader takes the tiles, and "0" is no price claim', () => {
  const vehicles = extractVehicles(BRADLEY_SRP);
  assert.equal(vehicles.length, 2);
  const srp = "https://www.bradleyautofinance.com/inventory";
  const [silverado, renegade] = vehicles.map((v) => normalize(v, { sourceUrl: srp, dealerDomain: "bradleymotors.com" }));
  assert.equal(silverado.vin, "2GCUDGED3P1146370");
  // "0" is the platform's no-price state, not a $0 car.
  assert.equal(silverado.priceUsd, undefined);
  assert.equal(silverado.priceProvenance, undefined);
  assert.equal(renegade.priceUsd, 17295);
  assert.equal(silverado.mileage, 113486);
  // No offers.url on an SRP tile: the record falls back to the search page.
  // This is exactly the gap proMaxEntries closes — the VDP record that
  // follows carries its own url, a trim, and a model year.
  assert.equal(silverado.vdpUrl, undefined);
  assert.equal(silverado.sourceUrl, srp);
  assert.equal(silverado.year, undefined); // the SRP states it as releaseDate
});

test("proMaxVehicles repairs the two fields and nothing else", () => {
  const srp = "https://www.bradleyautofinance.com/inventory";
  const recs = proMaxVehicles(BRADLEY_SRP, srp).map((v) => normalize(v, { sourceUrl: srp, dealerDomain: "bradleymotors.com" }));
  assert.equal(recs.length, 2);
  const [silverado, renegade] = recs;
  // The url the tile already carried, so the car no longer publishes pointing
  // at the search page it was found on.
  assert.equal(
    silverado.sourceUrl,
    "https://www.bradleyautofinance.com/VehicleDetails/7438/146370/Hudson-NH-2023-Chevrolet-Silverado-1500-4WD-Crew-Cab-147%22-LTZ-USED",
  );
  assert.equal(silverado.vdpUrl, silverado.sourceUrl);
  // releaseDate is where ProMax states the model year on an SRP tile.
  assert.equal(silverado.year, 2023);
  assert.equal(renegade.year, 2020);
  // Untouched: "0" is still no price, 17295 is still the price, and the
  // provenance is still the page's own JSON-LD.
  assert.equal(silverado.priceUsd, undefined);
  assert.equal(silverado.priceProvenance, undefined);
  assert.equal(renegade.priceUsd, 17295);
  assert.equal(renegade.priceProvenance, "jsonld");
  assert.equal(silverado.mileage, 113486);
  assert.equal(silverado.condition, "UsedCondition");
  // With the VDP url in hand the condition is settled either way.
  assert.equal(publishedCondition({ condition: silverado.condition, sourceUrl: silverado.sourceUrl }), "used");
});

test("proMaxVehicles: a node the platform DID give a url keeps it; junk yields nothing", () => {
  const withUrl = `<link href="/cssLib/CX5_Front_Inventory.css">
    <a href="/VehicleDetails/7438/146370/Hudson-NH-2023-Chevrolet-USED">tile</a>
    <script type="application/ld+json">{"@type":"Vehicle","sku":"146370","releaseDate":"2023",
      "vehicleModelDate":"2019","vehicleIdentificationNumber":"2GCUDGED3P1146370",
      "offers":{"@type":"Offer","price":"100","url":"https://elsewhere.example/car"}}</script>`;
  const [v] = proMaxVehicles(withUrl, "https://www.bradleyautofinance.com/inventory");
  assert.equal(v.offers.length, 1);
  assert.equal(v.offers[0].url, "https://elsewhere.example/car");
  // A stated vehicleModelDate is never overwritten by releaseDate.
  assert.equal(v.vehicleModelDate, "2019");
  assert.deepEqual(proMaxVehicles(undefined, "https://x.com"), []);
  assert.deepEqual(proMaxVehicles("<p>promax</p>", "https://x.com"), []);
  // A node with no VIN is not a car this lane can key.
  assert.deepEqual(
    proMaxVehicles('<link href="/cssLib/CX5_Front_Inventory.css"><script type="application/ld+json">{"@type":"Vehicle","sku":"1"}</script>', "https://x.com/i"),
    [],
  );
});

test("the VDP's JSON-LD is invalid on any inch-mark trim — the SRP is the source", () => {
  // Verbatim shape of www.bradleyautofinance.com/VehicleDetails/7438/146370/…
  // (2026-08-31): `name` escapes the inch mark, `vehicleConfiguration` does
  // not, so JSON.parse throws and the whole page yields no car. 15 of 36
  // sitemap VDPs sampled across the three stocked rooftops fail this way.
  const brokenVdp = `<link href="/cssLib/CX5_Front_Inventory.css">
    <script type="application/ld+json">{
      "@context":"http://schema.org/", "@type":["Product", "Car"],
      "itemCondition":"UsedCondition", "vehicleModelDate":"2023",
      "name":"2023 Chevrolet Silverado 1500 4WD Crew Cab 147&quot; LTZ",
      "vehicleConfiguration":"Crew Cab 147" LTZ",
      "vehicleIdentificationNumber": "2GCUDGED3P1146370",
      "offers": { "@type": "Offer", "price": 21295, "priceCurrency":"USD" }
    }</script>`;
  assert.deepEqual(extractVehicles(brokenVdp), []);
  assert.deepEqual(proMaxVehicles(brokenVdp, "https://www.bradleyautofinance.com/VehicleDetails/7438/146370/x"), []);
  // The same car off the SRP is complete, which is the point: this VIN still
  // publishes, with its own url, because the tile's node has no
  // vehicleConfiguration field to break on.
  const [srpRec] = proMaxVehicles(BRADLEY_SRP, "https://www.bradleyautofinance.com/inventory").map((v) =>
    normalize(v, { sourceUrl: "https://www.bradleyautofinance.com/inventory", dealerDomain: "bradleymotors.com" }),
  );
  assert.equal(srpRec.vin, "2GCUDGED3P1146370");
  assert.equal(srpRec.year, 2023);
  assert.ok(srpRec.sourceUrl.includes("/VehicleDetails/7438/146370/"));
});

test("itemCondition passes through the generic path", () => {
  const [silverado] = extractVehicles(BRADLEY_SRP).map((v) =>
    normalize(v, { sourceUrl: "https://www.bradleyautofinance.com/inventory", dealerDomain: "bradleymotors.com" }),
  );
  assert.equal(silverado.condition, "UsedCondition");
  assert.equal(publishedCondition({ condition: silverado.condition }), "used");
  // "NewCondition" alone does NOT read as new — \bnew\b needs a boundary the
  // word does not give it, while the used branch matches on a bare substring.
  // The VDP url is what settles a new car, and it always states it.
  assert.equal(publishedCondition({ condition: "NewCondition" }), undefined);
  assert.equal(
    publishedCondition({
      condition: "NewCondition",
      sourceUrl:
        "https://www.ollenburgmotors.com/VehicleDetails/7954/N06175/Garner-IA-2026-Chevrolet-Tahoe-4WD-4dr-LT-NEW",
    }),
    "new",
  );
});
