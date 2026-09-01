import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAutoRevo,
  autoRevoSeeds,
  autoRevoBody,
  autoRevoEntries,
  autoRevoVehicles,
  autoRevoNextPageUrl,
  autoRevoTruncated,
  autoRevoPrices,
  engineFuel,
  ldFuelType,
  plausibleVin,
  AUTOREVO_SRP_PATH,
} from "../lib/platforms/autorevo.mjs";
import { classifyEv } from "../lib/ev.mjs";
import { normalize } from "../lib/normalize.mjs";
import { fingerprint } from "../lib/fingerprint.mjs";
import { EVISH_RE } from "../lib/sitemap.mjs";
import { publishedCondition } from "../lib/condition.mjs";
import { AUTOREVO_PRICE } from "../lib/price-provenance.mjs";

// ── FIXTURES ───────────────────────────────────────────────────────────────
// Every fixture below is trimmed from a page fetched on 2026-08-31; the
// rooftop is named on each one. Nothing here is invented markup.

const VENDOR_HEAD = `<!doctype html><html><head><title>Used Cars</title>
<link rel="dns-prefetch" href="https://x-img.autorevo.com/">
<link rel="dns-prefetch" href="https://x-assets.autorevo-powersites.com/"></head>`;

const PHOTO = (slug, size, id) => `https://cf-img.autorevo.com/${slug}/${size}/${id}-revo.jpg?_=1781030442`;

/** One tile, in the shape every rooftop sampled prints it. */
const tile = ({
  cls = "used_vehicle",
  slug,
  id,
  year,
  make,
  model,
  trim,
  price = "$11,500",
  secondary = "",
  engine,
  mileage,
  vin,
  stock,
  photo = PHOTO("photo-slug", "325x325", "3196124-9"),
  sold = false,
  extra = "",
}) => `
<section class="inventory_item ${cls}">
  <div class="thumb">
    <a href="/${slug}/${id}">
      ${sold ? '<img class="sold_overlay" src="https://x-assets.autorevo-powersites.com/content/assets/sold.png">' : ""}
      <img src="${photo}"
           srcset="${PHOTO("photo-slug", "100x100", "3196124-9")} 374w, ${PHOTO("photo-slug", "640x640", "3196124-9")} 980w"
           alt="${year} ${make} ${model} ${trim}" loading="lazy">
   </a>
  </div>
  <div class="item_details">
    <h3><a href="/${slug}/${id}"><span class="template_title"><span class="year">${year}</span> <span class="make">${make}</span> <span class="model">${model}</span> <span class="trim">${trim}</span> <span class="text">|</span> <span class="city">Batesville</span><span class="text">,</span> <span class="state">Mississippi</span> <span class="text">|</span> <span class="dealership">Stanley's Auto Sales</span></span></a></h3>
    <div class="pricing">
      <h3 class="website_price">Our Price<span>${price}</span></h3>
      ${secondary}
      <p class="srp_estimated_payment"><label>Estimated Payment</label><span>$0</span></p>
      <p class="srp_down_payment"><label>Down Payment</label><span>$0</span></p>
    </div>
    <dl>
      <dt class="exterior_label">Exterior</dt>
      <dd class="exterior_value">Monsoon Gray Metallic</dd>
      <dt class="interior_label">Interior</dt>
      <dd class="interior_value">Black Leather</dd>
      ${engine ? `<dt class="engine_label">Engine</dt><dd class="engine_value">${engine}</dd>` : ""}
      <dt class="transmission_label">Transmission</dt>
      <dd class="transmission_value">Automatic</dd>
      <dt class="drivetrain_label">Drivetrain</dt>
      <dd class="drivetrain_value">Awd</dd>
      <dt class="mileage_label">Mileage</dt>
      <dd class="mileage_value">${mileage}</dd>
      ${vin ? `<dt class="vin_label">VIN</dt><dd class="vin_value">${vin}</dd>` : ""}
      <dt class="warranty_label">Warranty</dt>
      <dd class="warranty_value">Limited Warranty</dd>
      ${stock ? `<dt class="stock_label">Stock</dt><dd class="stock_value">${stock}</dd>` : ""}
      <dt class="location_label parent">Location</dt>
      <dd class="location_value parent"><a href="/vehicles?location=2475" title="See all cars at this location.">Stanley's Auto Sales</a></dd>
    </dl>
  </div>
 <div class="action_items">${extra}
  <span><a class="photos button" href="/${slug}/${id}">Photos (43)</a></span>
</div>
</section>`;

const srp = (tiles, { pager = "", count } = {}) => `${VENDOR_HEAD}<body class="v5 ilp">
<style>.ilp .inventory_item .thumb .sold_overlay{top:0;left:5%}.vdp #pricing h3.website_price{border-bottom:1px solid #454545}</style>
<main id="srp_results">
  <section class="inventory_title"><h1>Used Cars</h1>
  <div id="list_header"><h2><span id="search_results_count">${count ?? tiles.length} matches out of ${count ?? tiles.length} vehicles.</span></h2>
  ${pager}</div></section>
<section id="inventory_list" class="horiz_layout">${tiles.join("\n")}
</section>
</main>
<script>window.site_settings = {"primaryPriceLabel":"Our Price","displayPrimaryPrice":true,"secondaryPriceLabel":"Retail Value","displaySecondaryPrice":true,"strikeThroughSecondaryPrice":true};</script>
<footer id="footer"><p>Powered by AutoRevo</p><p>Call 555-0100 for our $99 down special</p></footer></body></html>`;

// heisermotors.com/vehicles, 2026-08-31: 88 cars, 25 a page, four pages.
const HEISER_PAGER = `<div class="pagination upper"><span><span class="label">Pages: </span>
  <span class="increment prev" disabled><svg viewBox="0 0 17.6 35.45"></svg></span>
  <span class="current">1</span>&nbsp;
  <a href="/vehicles?page=2" rel="noreferrer">2</a>
  <a href="/vehicles?page=3" rel="noreferrer">3</a>
  <a href="/vehicles?page=4" rel="noreferrer">4</a>
  <a href="/vehicles?page=2" class="increment next" rel="noreferrer"><svg viewBox="0 0 17.6 35.45"></svg></a>
</span></div>`;

// stanleyautosales.com/vehicles, 2026-08-31 — the first tile, verbatim shape.
const AUDI = tile({
  slug: "2015-audi-a3-2.0t-quattro-premium-plus-%7C-batesville%2C-mississippi",
  id: "7492327",
  year: "2015",
  make: "Audi",
  model: "A3",
  trim: "2.0T quattro Premium Plus",
  price: "$11,500",
  engine: "2.0L Turbo I4 220hp 258ft. lbs. SULEV",
  mileage: "125,252",
  vin: "WAUEFGFF7F1123559",
  stock: "123559",
});

// bayshoreautomotive.com/vehicles, 2026-08-31. A BEV no nameplate pattern
// knows: the only thing on the page that says so is the engine row.
const FISKER = tile({
  slug: "2023-fisker-ocean-fisker-ocean-sport-carfax-cert-1-owner-serviced",
  id: "7482205",
  year: "2023",
  make: "Fisker",
  model: "Ocean",
  trim: "FISKER OCEAN SPORT CARFAX CERT 1 OWNER SERVICED",
  price: "$18,890",
  engine: "Electric 275hp",
  mileage: "6,359",
  vin: "VCF1SAU2XPG011332",
  stock: "011332",
  photo: PHOTO("2023-fisker-ocean-plant-city-fl-7482205", "640x640", "3188862-7"),
});

// thejeepdepot.com/vehicles, 2026-08-31 — the platform's plug-in wording.
const WRANGLER = tile({
  slug: "2024-jeep-wrangler-high-altitude-4xe",
  id: "7495001",
  year: "2024",
  make: "Jeep",
  model: "Wrangler",
  trim: "High Altitude 4xe",
  price: "$45,500",
  engine: "2.0L Plug-in Hybrid Turbo I4 375hp 470ft. lbs.",
  mileage: "22,145",
  vin: "1C4JJXP62PW123456",
  stock: "123456",
});

// johnbrothersauto.com/vehicles, 2026-08-31: nine of fifteen cars carry this
// filler in the VIN slot and "Call for Price" in the price slot.
const PLACEHOLDER = tile({
  slug: "2006-x-sold-chevrolet-corvette-base",
  id: "7481657",
  year: "2006",
  make: "X Sold Chevrolet",
  model: "Corvette",
  trim: "Base",
  price: "Call for Price",
  engine: "6.0L V8 400hp 400ft. lbs.",
  mileage: "51,000",
  vin: "11111111111111111",
  stock: "C1234",
});

// autoramaauto.com/vehicles, 2026-08-31: two of its 68 tiles are a golf cart
// and a scooter, which print no VIN row at all.
const GOLF_CART = tile({
  slug: "2024-club-car-tempo-gas",
  id: "7474459",
  year: "2024",
  make: "Club Car",
  model: "Tempo",
  trim: "Gas",
  price: "$6,900",
  mileage: "0",
  vin: undefined,
  stock: undefined,
});

// certifiedautoplaza.com, 2026-08-31: the rooftop that prints the second rung.
const SECONDARY = '<p class="secondary_price">Retail Value<span><strike>$35,225</strike></span></p>';
const SILVERADO = tile({
  slug: "2023-chevrolet-silverado-1500-lt-crewcab-4x4-alexandria-minnesota-56308",
  id: "7494653",
  year: "2023",
  make: "Chevrolet",
  model: "Silverado 1500",
  trim: "LT Crewcab 4x4",
  price: "$28,995",
  secondary: SECONDARY,
  engine: "5.3L V8 355hp 383ft. lbs.",
  mileage: "88,120",
  vin: "1GCUDDED0PZ123456",
  stock: "S1234",
});

// certifiedautoplaza.com/new-vehicles, 2026-08-31 — 8 cars classed
// `new_vehicle`, every measurable one contradicted by its own odometer.
const FAKE_NEW = tile({
  cls: "new_vehicle",
  slug: "2024-ford-escape-st-line-awd-alexandria-minnesota-56308",
  id: "7510259",
  year: "2024",
  make: "Ford",
  model: "Escape",
  trim: "ST-Line AWD",
  price: "$18,995",
  engine: "EcoBoost 1.5L Turbo I3 180hp 199ft. lbs.",
  mileage: "97,520",
  vin: "1FMCU9MN6RUA29239",
  stock: "A29239",
});

/** A VDP, in the shape heisermotors and bayshoreautomotive both serve. */
const vdp = ({ vin, year, make, model, trim, price, engine, mileage, fuel, condition = "used", photo, similar = true }) =>
  `${VENDOR_HEAD}<body class="v5 vdp">
<style>.vdp #similar_vehicles ul li a span span{color:#1975bc}.vdp #pricing h3.website_price{border-bottom:1px solid #454545}</style>
<main>
  <section id="vehicle_title"><h1><span class='template_title'><span class='year'>${year}</span> <span class='make'>${make}</span> <span class='model'>${model}</span> <span class='trim'>${trim}</span> <span class='text'>|</span> <span class='city'>Dickinson</span><span class='text'>,</span> <span class='state'>ND</span></span></h1></section>
  <section class="image_wrap">
    <!-- SOLD overlay -->
    <section id="main_image"><img src="${photo}" srcset="${photo} 724w" class="hero_image"></section>
  </section>
  <section id="gallery" class="above_description show_thumbnails"><ul>
    <li><img data-img="1" class="thumbnail" src="${PHOTO("thumbs", "100x100", "3200463-0")}" /></li>
    <li><img data-img="2" class="thumbnail" src="${PHOTO("thumbs", "100x100", "3200463-44")}" /></li>
  </ul></section>
  <section id="pricing">
    <h3 class="website_price"><label>Our Price</label><span>${price}</span></h3>
    <p class="vdp_rebate"><label>Rebate</label><span>$0</span></p>
    <p class="vdp_estimated_payment"><label>Estimated Payment</label><span>$0</span></p>
  </section>
  <section id="topline"><dl>
    <dt class="exterior_label">Exterior</dt><dd class="exterior_value">Diamond Black Clear Coat</dd>
    <dt class="interior_label">Interior</dt><dd class="interior_value">Black Cloth</dd>
    <dt class="engine_label">Engine</dt><dd class="engine_value">${engine}</dd>
    <dt class="transmission_label">Transmission</dt><dd class="transmission_value">Automatic</dd>
    <dt class="drivetrain_label">Drivetrain</dt><dd class="drivetrain_value">Awd</dd>
    <dt class="mileage_label">Mileage</dt><dd class="mileage_value">${mileage}</dd>
    <dt class="vin_label">VIN</dt><dd class="vin_value">${vin}</dd>
    <dt class="stock_label">Stock</dt><dd class="stock_value">C4494</dd>
    <dt class="vdp_title title_label">Title</dt><dd class="vdp_title title_value">Clear</dd>
  </dl></section>
  ${
    similar
      ? `<!-- Similar vehicles -->
  <section id="similar_vehicles"><h2>Similar Vehicles</h2><ul>
    <li><a href="/2018-ram-1500-tradesman/7500627" rel="nofollow"><span><img src="${PHOTO("2018-ram-1500", "100x100", "3209740-0")}"></span><span>2018 Ram 1500 Tradesman <span>$16,995</span></span></a></li>
    <li><a href="/2016-chevrolet-colorado/7499450" rel="nofollow"><span><img src="${PHOTO("2016-chevrolet-colorado", "100x100", "3208880-0")}"></span><span>2016 Chevrolet Colorado <span>$21,995</span></span></a></li>
  </ul></section>`
      : ""
  }
</main>
<script type="application/ld+json">{"@context":"http://schema.org","@type":"AutoDealer","name":"Heiser Motors","priceRange":[5000,29995],"makesOffer":{"@type":"Offer","priceSpecification":{"@type":"UnitPriceSpecification","priceCurrency":"USD","price":"${String(price).replace(/[^0-9]/g, "")}"},"itemOffered":{"@type":"Car","name":"${year} ${make} ${model} ${trim}","releaseDate":"${year}","manufacturer":"${make}","model":"${model}","itemCondition":"${condition}","mileageFromOdometer":"${String(mileage).replace(/[^0-9]/g, "")}","fuelType":"${fuel}","vehicleIdentificationNumber":"${vin}","vehicleEngine":{"@type":"EngineSpecification","engineType":"${engine}"}}}}</script>
</body></html>`;

const CYBERTRUCK_VDP = vdp({
  vin: "7G2CEHED7RA043459",
  year: "2024",
  make: "Tesla",
  model: "Cybertruck",
  trim: "CYBERTRUCK FSD ROOF RACK CLEAN CARFAX CERT",
  price: "$78,890",
  engine: "Electric 593hp 525ft. lbs.",
  mileage: "19,349",
  fuel: "Electric",
  photo: PHOTO("2024-tesla-cybertruck-plant-city-fl-7494750", "640x640", "3200463-0"),
});

const SRP_URL = "https://stanleyautosales.com/vehicles";

// ── FINGERPRINT ────────────────────────────────────────────────────────────

test("the vendor's own hosts fingerprint as autorevo, and this module agrees", () => {
  for (const page of [
    '<link rel="dns-prefetch" href="https://x-assets.autorevo-powersites.com/">',
    '<img src="https://x-img.autorevo.com/2015-audi-a3/325x325/3196124-9-revo.jpg">',
    '<img src="https://cf-img.autorevo.com/2024-tesla-cybertruck/640x640/3200463-0-revo.jpg">',
    '<a href="https://vms.autorevo.com/ebrochure/7502436">Print eBrochure</a>',
  ]) {
    assert.equal(fingerprint(page), "autorevo", page);
    assert.equal(isAutoRevo(page), true, page);
  }
});

// The reason the signature is a host and not a word. Wix serializes an
// internal "excludeFromAutoRevoke" flag into every page it renders, and a
// loose /autorevo/i matched 136 Wix sites in the 2026-08-31 vendor scan.
test("Wix's excludeFromAutoRevoke is not this vendor — module and fingerprint both", () => {
  const wix = `<script>window.viewerModel = {"siteFeatures":["excludeFromAutoRevoke"],"siteAssets":{"clientTopology":{"mediaRootUrl":"https://static.wixstatic.com/media"}}};</script>`;
  assert.equal(isAutoRevo(wix), false);
  assert.notEqual(fingerprint(wix), "autorevo");
  // Nor is a dealer whose own copy happens to say the word.
  const copy = "<p>We are proud to be an AutoRevo powered dealership since 2011.</p>";
  assert.equal(isAutoRevo(copy), false);
  assert.notEqual(fingerprint(copy), "autorevo");
});

test("junk in, nothing out", () => {
  for (const junk of [undefined, null, "", 42, {}, "<html><body>hello</body></html>"]) {
    assert.equal(isAutoRevo(junk), false);
    assert.deepEqual(autoRevoEntries(junk, SRP_URL), []);
    assert.deepEqual(autoRevoVehicles(junk, SRP_URL), []);
  }
  assert.equal(autoRevoNextPageUrl(null, SRP_URL), null);
  assert.equal(autoRevoNextPageUrl(srp([AUDI], { pager: HEISER_PAGER }), "not a url"), null);
  assert.equal(autoRevoTruncated(null), undefined);
  // A page that IS this vendor but lists nothing (ashlandmotorcompany and
  // extremeautoassociates both serve an empty lot) yields nothing, not a throw.
  const empty = srp([], { count: 0 });
  assert.equal(isAutoRevo(empty), true);
  assert.deepEqual(autoRevoVehicles(empty, SRP_URL), []);
  assert.equal(autoRevoTruncated(empty), 0);
});

test("seeds are the lot, and only the lot", () => {
  assert.equal(AUTOREVO_SRP_PATH, "/vehicles");
  assert.deepEqual(autoRevoSeeds("https://heisermotors.com"), ["https://heisermotors.com/vehicles"]);
});

// ── TILE EXTRACTION ────────────────────────────────────────────────────────

test("an SRP tile is a whole car", () => {
  const [v] = autoRevoVehicles(srp([AUDI]), SRP_URL);
  assert.equal(v.vehicleIdentificationNumber, "WAUEFGFF7F1123559");
  assert.equal(v.vehicleModelDate, "2015");
  assert.equal(v.brand, "Audi");
  assert.equal(v.model, "A3");
  assert.equal(v.vehicleConfiguration, "2.0T quattro Premium Plus");
  assert.equal(v.name, "2015 Audi A3 2.0T quattro Premium Plus");
  assert.equal(v.mileageFromOdometer.value, 125252);
  assert.equal(v.color, "Monsoon Gray Metallic");
  assert.equal(v.vehicleInteriorColor, "Black Leather");
  assert.equal(v.driveWheelConfiguration, "Awd");
  assert.equal(v.vehicleTransmission, "Automatic");
  assert.equal(v.sku, "123559");
  assert.equal(v.vehicleEngine.name, "2.0L Turbo I4 220hp 258ft. lbs. SULEV");
  assert.equal(v.offers.price, 11500);
  assert.equal(v.offers.priceProvenance, AUTOREVO_PRICE);
  assert.equal(v.offers.priceCurrency, "USD");
  assert.match(v.offers.url, /^https:\/\/stanleyautosales\.com\/2015-audi-a3.*\/7492327$/);
  // One photo per photo. The tile lists the same picture at three sizes under
  // three paths in its srcset; reading those would publish one car's single
  // image as three.
  assert.deepEqual(v.image, ["https://cf-img.autorevo.com/photo-slug/325x325/3196124-9-revo.jpg"]);
});

test("the record survives normalize with its price provenance intact", () => {
  const [v] = autoRevoVehicles(srp([AUDI]), SRP_URL);
  const rec = normalize(v, { sourceUrl: SRP_URL, dealerDomain: "stanleyautosales.com" });
  assert.equal(rec.vin, "WAUEFGFF7F1123559");
  assert.equal(rec.priceUsd, 11500);
  assert.equal(rec.priceProvenance, AUTOREVO_PRICE);
  assert.equal(rec.mileage, 125252);
  assert.equal(rec.trim, "2.0T quattro Premium Plus");
  // sourceUrl is the car's own page, not the SRP it was read from — which is
  // what keeps a /new-vehicles or /certified-vehicles path out of
  // publishedCondition's URL fallback.
  assert.match(rec.sourceUrl, /\/7492327$/);
});

test("the vendor's own no-photo placeholders are not photos", () => {
  // heisermotors.com, 2026-08-31: a car with no pictures gets this graphic.
  const noPhoto = tile({
    slug: "2009-chevrolet-avalanche-ls",
    id: "7497322",
    year: "2009",
    make: "Chevrolet",
    model: "Avalanche",
    trim: "LS",
    price: "$13,995",
    engine: "Vortec Iron Block 5.3L Flex Fuel V8 310hp 335ft. lbs.",
    mileage: "61,984",
    vin: "3GNFK12089G161428",
    stock: "C4412",
    photo: "https://mothership.autorevo-powersites.com/content/assets/no-photo_300x225_v2.png",
  });
  const [v] = autoRevoVehicles(srp([noPhoto]), "https://heisermotors.com/vehicles");
  assert.equal(v.image, undefined);
});

// ── THE VIN GATE ───────────────────────────────────────────────────────────

test("the placeholder VIN is not a VIN", () => {
  assert.equal(plausibleVin("11111111111111111"), undefined);
  assert.equal(plausibleVin("00000000000000000"), undefined);
  // Shape failures are still failures.
  assert.equal(plausibleVin("180529"), undefined);
  assert.equal(plausibleVin("BN-425920"), undefined);
  assert.equal(plausibleVin(""), undefined);
  assert.equal(plausibleVin(undefined), undefined);
  assert.equal(plausibleVin("WAUEFGFF7F1123559"), "WAUEFGFF7F1123559");
  // The lowest-entropy real VIN in the 450 this cohort printed, and the one
  // the gate has to keep: 8 distinct characters.
  assert.equal(plausibleVin("1c3cccbb2fn661212"), "1C3CCCBB2FN661212");
});

test("nine johnbrothersauto cars share one filler VIN and none of them is published", () => {
  const page = srp([PLACEHOLDER, PLACEHOLDER, AUDI]);
  const vehicles = autoRevoVehicles(page, "https://johnbrothersauto.com/vehicles");
  assert.equal(vehicles.length, 1);
  assert.equal(vehicles[0].vehicleIdentificationNumber, "WAUEFGFF7F1123559");
});

test("a tile with no VIN row at all yields no vehicle", () => {
  assert.deepEqual(autoRevoVehicles(srp([GOLF_CART]), "https://autoramaauto.com/vehicles"), []);
});

test("the same VIN twice on one page is one car", () => {
  const vehicles = autoRevoVehicles(srp([AUDI, AUDI]), SRP_URL);
  assert.equal(vehicles.length, 1);
});

// ── PRICE ──────────────────────────────────────────────────────────────────

test("the price is the designated slot's amount", () => {
  assert.deepEqual(autoRevoPrices('<h3 class="website_price">Our Price<span>$11,500</span></h3>'), [11500]);
  // The VDP wraps the words in a <label>; same slot, same reading.
  assert.deepEqual(
    autoRevoPrices('<h3 class="website_price"><label>Our Price</label><span>$78,890</span></h3>'),
    [78890]
  );
});

test('"Call for Price" abstains rather than reaching for another number', () => {
  // johnbrothersauto, 2026-08-31: nine of fifteen tiles print exactly this.
  const callForPrice = PLACEHOLDER.replace("11111111111111111", "1G1YY22G965123456");
  const [v] = autoRevoVehicles(srp([callForPrice]), "https://johnbrothersauto.com/vehicles");
  assert.equal(v.offers.price, undefined);
  assert.equal(v.offers.priceProvenance, undefined);
  // And the record is still published — an unpriced listing is a state
  // ingest.mjs has always handled.
  assert.equal(v.vehicleIdentificationNumber, "1G1YY22G965123456");
});

test("the struck-through Retail Value rung is never the ask", () => {
  const [v] = autoRevoVehicles(srp([SILVERADO]), "https://certifiedautoplaza.com/vehicles");
  assert.equal(v.offers.price, 28995);
  assert.equal(v.offers.priceProvenance, AUTOREVO_PRICE);
  // The blunt rule — "two distinct amounts in a tile abstains" — would have
  // dropped this price and every other on the two rooftops that print the
  // second rung. What matters is that the DESIGNATED slot holds one number.
  assert.deepEqual(autoRevoPrices(SILVERADO), [28995]);
});

test("payment and rebate lines beside the price are not prices", () => {
  const [v] = autoRevoVehicles(srp([AUDI]), SRP_URL);
  assert.equal(v.offers.price, 11500);
  // $0 estimated payment / $0 down are in the tile and outside the slot.
  assert.equal(autoRevoPrices(AUDI).length, 1);
});

test("two amounts inside the designated slot abstain", () => {
  const laddered = AUDI.replace(
    '<h3 class="website_price">Our Price<span>$11,500</span></h3>',
    '<h3 class="website_price">Our Price<span><strike>$13,500</strike> $11,500</span></h3>'
  );
  const [v] = autoRevoVehicles(srp([laddered]), SRP_URL);
  assert.equal(v.offers.price, undefined);
  assert.equal(v.offers.priceProvenance, undefined);
});

test("the footer's $99 down special is not a car's price", () => {
  const page = srp([AUDI]);
  assert.match(page, /\$99 down special/);
  const [v] = autoRevoVehicles(page, SRP_URL);
  assert.equal(v.offers.price, 11500);
});

// ── CONDITION ──────────────────────────────────────────────────────────────

test("no condition is claimed, in either direction", () => {
  // certifiedautoplaza.com/new-vehicles, 2026-08-31: classed `new_vehicle`,
  // JSON-LD `itemCondition: new`, 97,520 miles on its own odometer. 7 of the
  // 7 measurable cars on that page are contradicted the same way.
  const [fake] = autoRevoVehicles(srp([FAKE_NEW]), "https://certifiedautoplaza.com/new-vehicles");
  assert.equal(fake.itemCondition, undefined);
  assert.equal(fake.mileageFromOdometer.value, 97520);
  const [used] = autoRevoVehicles(srp([AUDI]), SRP_URL);
  assert.equal(used.itemCondition, undefined);
  const [vdpCar] = autoRevoVehicles(CYBERTRUCK_VDP, "https://bayshoreautomotive.com/2024-tesla-cybertruck/7494750");
  assert.equal(vdpCar.itemCondition, undefined);
  // Which is what makes the published row carry no condition rather than a
  // wrong one.
  const rec = normalize(fake, { sourceUrl: fake.offers.url, dealerDomain: "certifiedautoplaza.com" });
  assert.equal(rec.condition, undefined);
});

// Found while control-testing the above, and NOT a defect of this module:
// lib/condition.mjs's publishedCondition() used to merge the condition string
// and the WHOLE source URL — host included — into one haystack, so every car
// certifiedautoplaza.com sells published as certified because the dealer's
// domain name contains the word (25 registry domains carry it, and a
// certification is a warranty claim). Fixed 2026-08-31, same session this
// test pinned it: only the URL's path joins the haystack now.
test("a dealer's own domain name cannot manufacture a certified claim", () => {
  const onACertifiedNamedHost = "https://certifiedautoplaza.com/2024-ford-escape-st-line-awd/7510259";
  const onAnyOtherHost = "https://heisermotors.com/2024-ford-escape-st-line-awd/7510259";
  assert.equal(publishedCondition({ condition: undefined, sourceUrl: onAnyOtherHost }), undefined);
  assert.equal(publishedCondition({ condition: undefined, sourceUrl: onACertifiedNamedHost }), undefined);
  // A certified PATH still speaks — the fallback the haystack exists for.
  assert.equal(
    publishedCondition({ condition: undefined, sourceUrl: "https://x.com/certified-pre-owned/123" }),
    "certified",
  );
});

test("certification is never claimed from a marketing page", () => {
  // autoramaauto.com/certified-vehicles lists 36 cars whose own tiles all say
  // `used_vehicle`, and certifiedautoplaza's mixes used and new. Nothing
  // per-car on this platform says certified, so nothing here does.
  const [v] = autoRevoVehicles(srp([AUDI]), "https://autoramaauto.com/certified-vehicles");
  assert.equal(v.itemCondition, undefined);
  // The tile's own VDP link is what normalize keeps, so the marketing path
  // cannot become a certification claim downstream either.
  const rec = normalize(v, { sourceUrl: "https://autoramaauto.com/certified-vehicles", dealerDomain: "autoramaauto.com" });
  assert.doesNotMatch(rec.sourceUrl, /certified/);
  assert.equal(publishedCondition({ condition: rec.condition, sourceUrl: rec.sourceUrl }), undefined);
  // The same car read straight off the marketing page — no VDP link to
  // stand in for it — is what a /certified-vehicles SEED would produce.
  assert.equal(
    publishedCondition({ condition: undefined, sourceUrl: "https://autoramaauto.com/certified-vehicles" }),
    "certified"
  );
});

// ── SOLD ───────────────────────────────────────────────────────────────────

test("a sold car is not a listing, and the stylesheet that names the overlay is not a sale", () => {
  const soldTile = tile({
    slug: "2015-audi-a3-sold",
    id: "7492328",
    year: "2015",
    make: "Audi",
    model: "A3",
    trim: "Premium Plus",
    price: "$11,500",
    engine: "2.0L Turbo I4 220hp",
    mileage: "125,252",
    vin: "WAUEFGFF7F1123560",
    stock: "123560",
    sold: true,
  });
  const page = srp([soldTile, AUDI]);
  // Every page carries `.thumb .sold_overlay{…}` in its inline CSS whether or
  // not anything is sold — the live car must survive it.
  assert.match(page, /\.sold_overlay\{/);
  const vehicles = autoRevoVehicles(page, SRP_URL);
  assert.equal(vehicles.length, 1);
  assert.equal(vehicles[0].vehicleIdentificationNumber, "WAUEFGFF7F1123559");
  const entries = autoRevoEntries(page, SRP_URL);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((e) => e.sold), [true, false]);
});

// ── ENTRIES VS VEHICLES ────────────────────────────────────────────────────

test("entries bridge the cars the tile could not VIN; vehicles publish the ones it could", () => {
  const page = srp([AUDI, GOLF_CART, PLACEHOLDER]);
  const entries = autoRevoEntries(page, SRP_URL);
  const vehicles = autoRevoVehicles(page, SRP_URL);
  assert.equal(entries.length, 3);
  assert.equal(vehicles.length, 1);
  assert.equal(entries[1].vin, undefined);
  assert.equal(entries[2].vin, undefined);
  for (const e of entries) assert.match(e.url, /^https:\/\/stanleyautosales\.com\/.+\/\d{5,9}$/);
  // The Location row's ?location= link is a filter, not a car.
  for (const e of entries) assert.doesNotMatch(e.url, /\?/);
});

test("an entry name carries the platform's powertrain word and NOT its engine text", () => {
  const [audi] = autoRevoEntries(srp([AUDI]), SRP_URL);
  // The whole reason this is not the tile's raw text: EVISH_RE's BMW branch is
  // /i[45x]\b/, and every four-cylinder car here prints "I4" in engine_value.
  assert.equal(EVISH_RE.test("2.0L Turbo I4 220hp 258ft. lbs. SULEV"), true);
  assert.doesNotMatch(audi.name, /I4/i);
  assert.equal(EVISH_RE.test(`${audi.name} ${audi.url}`), false);

  const [fisker] = autoRevoEntries(srp([FISKER]), "https://bayshoreautomotive.com/vehicles");
  // Nothing but the engine row says this car is electric — not the nameplate,
  // not the slug.
  assert.equal(EVISH_RE.test("2023 Fisker Ocean FISKER OCEAN SPORT CARFAX CERT 1 OWNER SERVICED"), false);
  assert.match(fisker.name, /electric/);
  assert.equal(EVISH_RE.test(`${fisker.name} ${fisker.url}`), true);
});

test("a mild hybrid is not bridged as electrified", () => {
  // abwautos.com, 2026-08-31. The platform's own JSON-LD calls these "Unknown".
  const mild = tile({
    slug: "2021-audi-a4-quattro-premium-40-tfsi",
    id: "7481000",
    year: "2021",
    make: "Audi",
    model: "A4",
    trim: "quattro Premium 40 TFSI",
    price: "$17,985",
    engine: "2.0L Mild Hybrid E-Turbo I4 201hp 236ft. lbs.",
    mileage: "62,000",
    vin: "WAUABAF48MA123456",
    stock: "A1234",
  });
  const [e] = autoRevoEntries(srp([mild]), "https://abwautos.com/vehicles");
  assert.doesNotMatch(e.name, /electric|plug/i);
  const [v] = autoRevoVehicles(srp([mild]), "https://abwautos.com/vehicles");
  assert.equal(v.fuelType, undefined);
  assert.equal(classifyEv(v).isEv, false);
});

// ── FUEL ───────────────────────────────────────────────────────────────────

test("the engine row's powertrain phrase is read, and only where it is unambiguous", () => {
  assert.equal(engineFuel("Electric 593hp 525ft. lbs."), "Electric");
  assert.equal(engineFuel("2.0L Plug-in Hybrid Turbo I4 375hp 470ft. lbs."), "Plug-In Hybrid");
  // Anchored at the start on purpose: both of these contain the word and
  // neither is a BEV.
  assert.equal(engineFuel("2.0L Mild Hybrid E-Turbo I4 201hp 236ft. lbs."), undefined);
  assert.equal(engineFuel("1.8L Hybrid I4 134hp"), undefined);
  assert.equal(engineFuel("Pentastar 3.6L V6 293hp 260ft. lbs."), undefined);
  assert.equal(engineFuel(undefined), undefined);
});

test("the platform's own words classify its EVs off the SRP", () => {
  const [fisker] = autoRevoVehicles(srp([FISKER]), "https://bayshoreautomotive.com/vehicles");
  assert.equal(fisker.fuelType, "Electric");
  assert.deepEqual(classifyEv(fisker), { isEv: true, kind: "BEV", confidence: "high" });
  const [jeep] = autoRevoVehicles(srp([WRANGLER]), "https://thejeepdepot.com/vehicles");
  assert.equal(jeep.fuelType, "Plug-In Hybrid");
  assert.deepEqual(classifyEv(jeep), { isEv: true, kind: "PHEV", confidence: "high" });
});

test("the VDP's own fuelType leads, and its Unknown is an abstention", () => {
  assert.equal(ldFuelType(CYBERTRUCK_VDP), "Electric");
  assert.equal(ldFuelType('{"fuelType":"Unknown"}'), undefined);
  // An SRP carries no itemOffered at all, and two would mean two cars.
  assert.equal(ldFuelType(srp([AUDI])), undefined);
  assert.equal(ldFuelType('{"fuelType":"Electric"},{"fuelType":"Gasoline"}'), undefined);
});

// ── VDP ────────────────────────────────────────────────────────────────────

test("a VDP is one car, cut clear of the Similar Vehicles carousel", () => {
  const url = "https://bayshoreautomotive.com/2024-tesla-cybertruck/7494750";
  const vehicles = autoRevoVehicles(CYBERTRUCK_VDP, url);
  assert.equal(vehicles.length, 1);
  const [v] = vehicles;
  assert.equal(v.vehicleIdentificationNumber, "7G2CEHED7RA043459");
  assert.equal(v.brand, "Tesla");
  assert.equal(v.model, "Cybertruck");
  assert.equal(v.mileageFromOdometer.value, 19349);
  assert.equal(v.offers.price, 78890);
  assert.equal(v.offers.url, url);
  assert.equal(v.fuelType, "Electric");
  // The carousel's two neighbours print their own prices and their own
  // photos. Neither may reach this car.
  assert.match(CYBERTRUCK_VDP, /\$16,995/);
  assert.deepEqual(autoRevoPrices(autoRevoBody(CYBERTRUCK_VDP)), [78890]);
  assert.deepEqual(v.image, [
    "https://cf-img.autorevo.com/2024-tesla-cybertruck-plant-city-fl-7494750/640x640/3200463-0-revo.jpg",
  ]);
  // And a VDP is not a list: it contributes no bridge entries.
  assert.deepEqual(autoRevoEntries(CYBERTRUCK_VDP, url), []);
});

test("the carousel id in the page's stylesheet does not truncate the page", () => {
  // On the live Cybertruck VDP the string `#similar_vehicles` appears four
  // times in inline CSS before the fold — at byte 8,519 of 109,962 — so a cut
  // anchored on the word rather than the opening tag returned nothing at all.
  assert.match(CYBERTRUCK_VDP, /\.vdp #similar_vehicles ul li a span span/);
  assert.match(autoRevoBody(CYBERTRUCK_VDP), /7G2CEHED7RA043459/);
  assert.doesNotMatch(autoRevoBody(CYBERTRUCK_VDP), /2018 Ram 1500 Tradesman/);
});

test("a VDP with no carousel still reads", () => {
  const solo = vdp({
    vin: "1C4RDJAG8KC827257",
    year: "2019",
    make: "Dodge",
    model: "Durango",
    trim: "SXT Plus",
    price: "$18,995",
    engine: "Pentastar 3.6L V6 293hp 260ft. lbs.",
    mileage: "65,779",
    fuel: "Gasoline",
    photo: PHOTO("2019-dodge-durango", "640x640", "3210000-0"),
    similar: false,
  });
  const [v] = autoRevoVehicles(solo, "https://heisermotors.com/2019-dodge-durango-sxt-plus/7502436");
  assert.equal(v.vehicleIdentificationNumber, "1C4RDJAG8KC827257");
  assert.equal(v.offers.price, 18995);
  assert.equal(v.fuelType, "Gasoline");
  assert.equal(classifyEv(v).isEv, false);
});

test("the gallery's 100x100 thumbnails are not the car's photos", () => {
  const [v] = autoRevoVehicles(CYBERTRUCK_VDP, "https://bayshoreautomotive.com/2024-tesla-cybertruck/7494750");
  assert.equal(v.image.length, 1);
  assert.doesNotMatch(v.image[0], /100x100/);
});

// ── PAGINATION AND TRUNCATION ──────────────────────────────────────────────

test("the pager walks to the highest page it offers", () => {
  const page = srp([AUDI], { pager: HEISER_PAGER, count: 88 });
  const base = "https://heisermotors.com/vehicles";
  assert.equal(autoRevoNextPageUrl(page, base), "https://heisermotors.com/vehicles?page=2");
  assert.equal(autoRevoNextPageUrl(page, `${base}?page=2`), "https://heisermotors.com/vehicles?page=3");
  assert.equal(autoRevoNextPageUrl(page, `${base}?page=4`), null);
  // A one-page lot (stanleyautosales, autoramaauto, bayshoreautomotive all
  // render their whole lot on page one) prints no pager.
  assert.equal(autoRevoNextPageUrl(srp([AUDI]), SRP_URL), null);
});

test("the pager URL is emitted whatever robots.txt says about it", () => {
  // 14 of the 16 cohort rooftops ship the vendor's default robots.txt, which
  // disallows `/*?*` — so on those the pager is closed and page one is all a
  // polite walk may read. This function still reports it: a null here would
  // say "this lot ends on page one", which on heisermotors is a lie about 63
  // cars, and the caller needs the truth to report truncation.
  const page = srp([AUDI], { pager: HEISER_PAGER, count: 88 });
  assert.equal(autoRevoNextPageUrl(page, "https://heisermotors.com/vehicles"), "https://heisermotors.com/vehicles?page=2");
});

test("truncation is the platform's own count minus what the page showed", () => {
  const page = srp([AUDI, FISKER], { pager: HEISER_PAGER, count: 88 });
  assert.equal(autoRevoTruncated(page), 86);
  // A lot that fits on one page is not truncated.
  assert.equal(autoRevoTruncated(srp([AUDI, FISKER])), 0);
  // A page that prints no count says nothing rather than zero.
  assert.equal(autoRevoTruncated(`${VENDOR_HEAD}<body class="v5 ilp"></body></html>`), undefined);
});
