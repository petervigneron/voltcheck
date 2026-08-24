import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isMotorcarSites,
  isRetiredRooftop,
  motorcarSeeds,
  motorcarEntries,
  motorcarVehicle,
  motorcarVehicles,
  motorcarNextPageUrl,
  splitIdentity,
  vdpHead,
  headPrices,
  resolveMotorcarPrice,
  labelledFacts,
  MOTORCAR_SRP_PATH,
} from "../lib/platforms/motorcarsites.mjs";
import { classifyEv } from "../lib/ev.mjs";
import { normalize } from "../lib/normalize.mjs";
import { fingerprint } from "../lib/fingerprint.mjs";
import { EVISH_RE } from "../lib/sitemap.mjs";
import { MOTORCARSITES_PRICE } from "../lib/price-provenance.mjs";

const IMG = (id, n) => `https://www.motorcarsites.com/dealers/images/vehicles/large/image_${id}_${n}.jpg`;

// The "sleek" theme: the tile is wrapped by its own /vehicle/ link, facts sit
// in a <td class="option">Label:</td><td class="spec">Value</td> table, and
// the VIN is printed on the SRP. Trimmed from amgmotorsllc.motorcarsites.com
// (2026-08-24) — three cars, the middle one sold.
const SLEEK_SRP = `<!doctype html><html><head><title>All vehicles for sale in Laurel, MD | all</title>
<link rel="stylesheet" href="/template/sleek/css/ts.css">
<script src="https://www.motorcarsites.com/template/sleek/js/app.js"></script></head><body>
<div class="controls full"><span>Page 1 of 4</span> <a href="?order_by=price&dir=DESC&page_number=2" class="right-arrow">next</a></div>
<div class="car_listings">
  <div class="inventory margin-bottom-20">
    <a class="inventory" href="/vehicle/501001/2021-tesla-model-3-for-sale-in-laurel-md-20724">
    <div class="title">2021 Tesla Model 3 Long Range AWD</div>
    <img src="${IMG(501001, "a")}" class="preview" alt="2021 Tesla Model 3">
    <table class="options-primary">
      <tr><td class="option primary">VIN Number:</td><td class="spec">5YJ3E1EB2MF000001</td></tr>
      <tr><td class="option primary">Mileage:</td><td class="spec">28,400 miles</td></tr>
    </table>
    <div class="price"><b>Price:</b><br /><div class="figure">$31,000<br /></div></div></a>
  </div>
  <div class="inventory margin-bottom-20">
    <div class="angled_badge red"><span>Sold</span></div>
    <a class="inventory" href="/vehicle/501002/2022-dodge-charger-for-sale-in-laurel-md-20724">
    <div class="title">2022 Dodge Charger Scat Pack Widebody</div>
    <img src="${IMG(501002, "b")}" class="preview" alt="2022 Dodge Charger">
    <table class="options-primary">
      <tr><td class="option primary">VIN Number:</td><td class="spec">2C3CDXGJ6NH222056</td></tr>
    </table>
    <div class="price"><b>Price:</b><br /><div class="figure"><span class="price-sold">Sold</span><br /></div></div></a>
  </div>
  <div class="inventory margin-bottom-20">
    <a class="inventory" href="/vehicle/501003/2021-lexus-nx-300-for-sale-in-laurel-md-20724">
    <div class="title">2021 Lexus NX 300 Luxury AWD</div>
    <img src="${IMG(501003, "c")}" class="preview" alt="2021 Lexus NX 300">
    <table class="options-primary">
      <tr><td class="option primary">VIN Number:</td><td class="spec">JTJDARDZ4M2243071</td></tr>
    </table>
    <div class="price"><b>Price:</b><br /><div class="figure">$31,000<br /></div></div></a>
  </div>
</div></body></html>`;

// The "pill" theme: an <li class="mix"> tile whose photo and data attributes
// come BEFORE its link, facts in <div class="pill">/<div class="pill_data">,
// and no VIN anywhere on the SRP. Trimmed from
// megaauto.motorcarsites.com (2026-08-24).
const PILL_SRP = `<!doctype html><html><head><title>All vehicles for sale in Detroit, MI | all</title></head><body>
<div class="button">Page:&nbsp; <strong>1</strong> <a href="?order_by=price&dir=DESC&page_number=2">2</a></div>
<ul id="Grid">
<!-- TESTING ${IMG(441686, 20)} -->
<li class="mix no_cat" data-year="2023" data-make="Ram" data-model="ProMaster" data-price="59950.00">
  <div class="imagebox"><img src="${IMG(441686, 20)}" alt="2023 Ram ProMaster" />
  <a class="seemore" href="/vehicle/441686/2023-ram-promaster-for-sale-in-detroit-mi-48205">See more info</a></div>
  <div class="pill_data asm_vehicle_listing_price"><span class="price-sold">Sold</span> | 5,404 miles</div>
  <ul class="carinfo"><li><div class="pill">Trim</div><div class="pill_data">3500 Van</div></li></ul>
</li>
<li class="mix no_cat" data-year="2021" data-make="Toyota" data-model="RAV4" data-price="32950.00">
  <div class="imagebox"><img src="${IMG(486332, "00")}" alt="2021 Toyota RAV4" />
  <a class="seemore" href="/vehicle/486332/2021-toyota-rav4-for-sale-in-detroit-mi-48205">See more info</a></div>
  <div class="pill_data asm_vehicle_listing_price">$32,950 | 14,588 miles</div>
  <ul class="carinfo"><li><div class="pill">Trim</div><div class="pill_data">Prime XSE</div></li></ul>
</li>
</ul></body></html>`;

// A VDP in the pill theme, with the similar-vehicles carousel underneath it
// rendered in the SAME markup — three more Year/Make/Model/Price groups and
// three more prices. Cutting at that boundary is the whole point.
const PILL_VDP = `<!doctype html><html><head>
<title>2021 Toyota RAV4 for sale in Detroit, MI 48205</title>
<meta property="og:title" content="2021 Toyota RAV4 for sale in Detroit, MI 48205"></head><body>
<h1>Mega Auto</h1>
<h2>2021 Toyota RAV4 Prime XSE</h2>
<img src="${IMG(486332, "00")}" alt="" /><img src="${IMG(486332, "01")}" alt="" />
<ul class="carinfo">
  <li><div class="pill">Year</div><div class="pill_data">2021</div></li>
  <li><div class="pill">Make</div><div class="pill_data">Toyota</div></li>
  <li><div class="pill">Model</div><div class="pill_data">RAV4</div></li>
  <li><div class="pill">Trim</div><div class="pill_data">Prime XSE</div></li>
  <li><div class="pill">Price</div><div class="pill_data price">$32,950</div></li>
  <li><div class="pill">Mileage</div><div class="pill_data">14,588</div></li>
  <li><div class="pill">Fuel Type</div><div class="pill_data">Plug-In Hybrid</div></li>
  <li><div class="pill">Exterior Color</div><div class="pill_data">Blueprint</div></li>
  <li><div class="pill">Drive Type</div><div class="pill_data">All-Wheel Drive</div></li>
  <li><div class="pill">Vehicle_condition</div><div class="pill_data">used</div></li>
  <li><div class="pill">Vin</div><div class="pill_data">JTMEB3FV9MD049110</div></li>
  <li><span data-cg-vin="JTMEB3FV9MD049110" data-cg-price="41000"></span></li>
</ul>
<li class="mix no_cat" data-year="2023" data-make="Infiniti" data-model="QX80" data-price="34950.00">
  <img src="${IMG(532645, "00")}" />
  <a class="seemore" href="/vehicle/532645/2023-infiniti-qx80-for-sale-in-detroit-mi-48205">See more info</a>
  <ul class="carinfo">
    <li><div class="pill">Price</div><div class="pill_data">$34,950</div></li>
    <li><div class="pill">Vin</div><div class="pill_data">JN8AZ2AE5P9307738</div></li>
  </ul>
</li>
<li class="mix no_cat"><img src="${IMG(999111, "00")}" />
  <a class="seemore" href="/vehicle/999111/2013-buick-regal-for-sale-in-detroit-mi-48205">x</a>
  <div class="pill_data">$6,950</div></li>
</body></html>`;

// A VDP in the sleek theme: no Make/Model rows at all, a <td> fact table, and
// the similar-vehicles block behind `recent-vehicles-wrap`.
const SLEEK_VDP = `<!doctype html><html><head>
<title>2021 Lexus NX 300 for sale in Laurel, MD 20724</title>
<meta property="og:title" content="2021 Lexus NX 300 for sale in Laurel, MD 20724">
<link rel="stylesheet" href="/template/sleek/css/ts.css">
<script src="https://www.motorcarsites.com/template/sleek/js/app.js"></script></head><body>
<h1>Inventory Listing</h1>
<h2>2021 Lexus NX 300 Luxury AWD</h2><h2>$31,000</h2>
<!-- <span class="sold_text">Sold</span> -->
<img src="${IMG(501003, "c")}" class="img-responsive">
<table class="table"><tbody>
  <tr><td>miles:</td><td>29,200</td></tr>
  <tr><td>ENGINE:</td><td>2.0-L L-4 DOHC 16V</td></tr>
  <tr><td>VIN #:</td><td>JTJDARDZ4M2243071</td></tr>
  <tr><td>FUEL TYPE:</td><td>Gasoline</td></tr>
  <tr><td>CONDITION:</td><td>USED</td></tr>
</tbody></table>
<span data-cg-vin="JTJDARDZ4M2243071" data-cg-price="34500"></span>
<div class="recent-vehicles-wrap"><h5>Similar Vehicles</h5>
  <a href="/vehicle/415862/2024-volkswagen-tiguan-for-sale-in-laurel-md-20724">
  <img src="${IMG(415862, "t")}"><h6>2024 Volkswagen Tiguan</h6><h5>$29,000</h5></a>
</div></body></html>`;

const SLEEK_URL = "https://amgmotorsllc.motorcarsites.com/vehicle_listings/all/vehicles";
const PILL_URL = "https://megaauto.motorcarsites.com/vehicle_listings/all/vehicles";
const PILL_VDP_URL = "https://megaauto.motorcarsites.com/vehicle/486332/2021-toyota-rav4-for-sale-in-detroit-mi-48205";
const SLEEK_VDP_URL = "https://amgmotorsllc.motorcarsites.com/vehicle/501003/2021-lexus-nx-300-for-sale-in-laurel-md-20724";

test("fingerprints on the vendor's hosts, not on its brand word", () => {
  assert.equal(fingerprint(SLEEK_SRP), "motorcarsites");
  assert.equal(fingerprint(PILL_SRP), "motorcarsites");
  assert.equal(isMotorcarSites(SLEEK_SRP), true);
  // A dealer whose own NAME contains the vendor's is not the vendor.
  assert.equal(isMotorcarSites("<html><h1>Motorcar Sites of Tulsa</h1></html>"), false);
  assert.equal(isMotorcarSites(undefined), false);
});

test("seeds the one SRP path", () => {
  assert.deepEqual(motorcarSeeds("https://amgmotorsllc.motorcarsites.com"), [
    "https://amgmotorsllc.motorcarsites.com" + MOTORCAR_SRP_PATH,
  ]);
});

test("the retired-rooftop placeholder is not a dealership", () => {
  const placeholder = `<html><head><!-- dealership_id: 830 | website_id: 787 -->
    <title>Down For Maintenance</title></head><body>
    <img src="${IMG(1, 1)}"></body></html>`;
  assert.equal(isRetiredRooftop(placeholder), true);
  assert.equal(isRetiredRooftop(SLEEK_SRP), false);
  assert.deepEqual(motorcarEntries(placeholder, "https://x.motorcarsites.com/"), []);
});

test("both themes enumerate the same lot shape, and neither leaks across tiles", () => {
  const sleek = motorcarEntries(SLEEK_SRP, SLEEK_URL);
  assert.equal(sleek.length, 3);
  assert.deepEqual(
    sleek.map((e) => e.vin),
    ["5YJ3E1EB2MF000001", "2C3CDXGJ6NH222056", "JTJDARDZ4M2243071"]
  );
  // The sold badge belongs to the middle car alone. Slicing the page on the
  // link rather than on the platform's numeric id used to spread it.
  assert.deepEqual(sleek.map((e) => e.sold), [false, true, false]);

  const pill = motorcarEntries(PILL_SRP, PILL_URL);
  assert.equal(pill.length, 2);
  assert.deepEqual(pill.map((e) => e.sold), [true, false]);
  // No VIN anywhere on this theme's SRP — which is why the SRP is links only.
  assert.deepEqual(pill.map((e) => e.vin), [undefined, undefined]);
  assert.equal(pill[1].url, "https://megaauto.motorcarsites.com/vehicle/486332/2021-toyota-rav4-for-sale-in-detroit-mi-48205");
});

test("the entry's name is identity, not the tile's whole text", () => {
  // The RAV4 Prime's plug-in badge is in the Trim pill, not the slug. An entry
  // name built from the URL alone would read "2021 toyota rav4" and the car
  // would never be fetched.
  const pill = motorcarEntries(PILL_SRP, PILL_URL);
  assert.match(pill[1].name, /Prime/);
  assert.equal(EVISH_RE.test(pill[1].name), true);
  const sleek = motorcarEntries(SLEEK_SRP, SLEEK_URL);
  assert.match(sleek[0].name, /Tesla/i);
  assert.match(sleek[0].name, /Long Range/);

  // …and the engine designation stays OUT of it. Screening the raw tile text
  // made every four-cylinder car an EV candidate, because EVISH_RE's BMW
  // pattern is `i[45x]\b` and this platform prints engines as "2.0-L I4".
  const withEngine = SLEEK_SRP.replace(
    '<tr><td class="option primary">Mileage:</td><td class="spec">28,400 miles</td></tr>',
    '<tr><td class="option primary">Engine:</td><td class="spec">2.0-L I4 DOHC 16V</td></tr>'
  ).replace("2021 Tesla Model 3 Long Range AWD", "2021 Honda Accord Touring")
    .replace("2021-tesla-model-3-for-sale", "2021-honda-accord-for-sale");
  const accord = motorcarEntries(withEngine, SLEEK_URL)[0];
  assert.equal(accord.name.includes("I4"), false);
  assert.equal(EVISH_RE.test(accord.name), false);

  // A tile that says outright what the car is keeps that word, even when the
  // nameplate means nothing to EVISH_RE.
  const declared = withEngine.replace(
    "<div class=\"title\">2021 Honda Accord Touring</div>",
    '<div class="title">2021 Honda Accord Touring</div><div class="spec">Fuel: Electric</div>'
  );
  assert.equal(EVISH_RE.test(motorcarEntries(declared, SLEEK_URL)[0].name), true);
});

test("an SRP yields no vehicle records — links only", () => {
  assert.deepEqual(motorcarVehicles(SLEEK_SRP, SLEEK_URL), []);
  assert.deepEqual(motorcarVehicles(PILL_SRP, PILL_URL), []);
});

test("pagination walks to the highest page the pager offers", () => {
  assert.equal(motorcarNextPageUrl(SLEEK_SRP, SLEEK_URL), SLEEK_URL + "?page_number=2");
  assert.equal(motorcarNextPageUrl(PILL_SRP, PILL_URL), PILL_URL + "?page_number=2");
  assert.equal(motorcarNextPageUrl(SLEEK_SRP, SLEEK_URL + "?page_number=2"), null);
  assert.equal(motorcarNextPageUrl(undefined, SLEEK_URL), null);
});

test("the similar-vehicles carousel is cut away before anything is read", () => {
  for (const [html, kept, dropped] of [
    [PILL_VDP, "JTMEB3FV9MD049110", "JN8AZ2AE5P9307738"],
    [SLEEK_VDP, "JTJDARDZ4M2243071", "2024 Volkswagen Tiguan"],
  ]) {
    const head = vdpHead(html);
    assert.ok(head.includes(kept));
    assert.equal(head.includes(dropped), false);
  }
  // …and with it, its prices. The neighbours' numbers are what would turn a
  // one-price page into an abstain, or worse, into the wrong price.
  assert.deepEqual(headPrices(vdpHead(PILL_VDP)), [32950]);
  assert.deepEqual(headPrices(vdpHead(SLEEK_VDP)), [31000]);
});

test("the VDP's own facts, in either theme's markup", () => {
  const pill = motorcarVehicle(PILL_VDP, PILL_VDP_URL);
  assert.equal(pill.vehicleIdentificationNumber, "JTMEB3FV9MD049110");
  assert.equal(pill.brand, "Toyota");
  assert.equal(pill.model, "RAV4");
  assert.equal(pill.vehicleConfiguration, "Prime XSE");
  assert.equal(pill.mileageFromOdometer.value, 14588);
  assert.equal(pill.fuelType, "Plug-In Hybrid");
  assert.equal(pill.itemCondition, "used");
  assert.equal(pill.offers.price, 32950);
  assert.equal(pill.offers.priceProvenance, MOTORCARSITES_PRICE);
  assert.equal(pill.image.length, 2);

  const sleek = motorcarVehicle(SLEEK_VDP, SLEEK_VDP_URL);
  assert.equal(sleek.vehicleIdentificationNumber, "JTJDARDZ4M2243071");
  assert.equal(sleek.mileageFromOdometer.value, 29200);
  assert.equal(sleek.fuelType, "Gasoline");
  assert.equal(sleek.itemCondition, "used");
  assert.equal(sleek.offers.price, 31000);
});

test("model and trim come from the vendor's own title/heading split", () => {
  // The sleek VDP prints no Make/Model/Trim rows at all. Reading the split off
  // word position instead would make this "NX" + "300 Luxury AWD" — and a
  // Model 3 into model "Model", which ingest.mjs never repairs.
  const sleek = motorcarVehicle(SLEEK_VDP, SLEEK_VDP_URL);
  assert.equal(sleek.brand, "Lexus");
  assert.equal(sleek.model, "NX 300");
  assert.equal(sleek.vehicleConfiguration, "Luxury AWD");

  assert.deepEqual(splitIdentity("2021 Tesla Model 3 for sale", "2021 Tesla Model 3 Long Range AWD"), {
    year: "2021",
    make: "Tesla",
    model: "Model 3 for sale",
    trim: undefined,
    name: "2021 Tesla Model 3 Long Range AWD",
  });
  assert.deepEqual(splitIdentity("2020 Land Rover Range Rover Sport", "2020 Land Rover Range Rover Sport HSE P400e"), {
    year: "2020",
    make: "Land Rover",
    model: "Range Rover Sport",
    trim: "HSE P400e",
    name: "2020 Land Rover Range Rover Sport HSE P400e",
  });
  // An unrecognised make yields no make and NO MODEL rather than a guess: a
  // make outside lib/makes.mjs can never match an enrichment row anyway.
  const unknown = splitIdentity("2022 Foobar Zed", "2022 Foobar Zed GT");
  assert.equal(unknown.make, undefined);
  assert.equal(unknown.model, undefined);
  assert.equal(unknown.trim, "GT");
});

test("a sold car is not published, and a page with no VIN yields nothing", () => {
  const sold = SLEEK_VDP.replace("<!-- <span class=\"sold_text\">Sold</span> -->", '<span class="sold_text">Sold</span>');
  assert.equal(motorcarVehicle(sold, SLEEK_VDP_URL), null);
  const vinless = SLEEK_VDP.replace("JTJDARDZ4M2243071", "n/a").replace("JTJDARDZ4M2243071", "n/a");
  assert.equal(motorcarVehicle(vinless, SLEEK_VDP_URL), null);
  // An SRP URL is not a VDP however car-shaped its markup looks.
  assert.equal(motorcarVehicle(SLEEK_VDP, SLEEK_URL), null);
});

test("the CarGurus badge never becomes the price, and a second amount abstains", () => {
  // Both fixtures carry a data-cg-price that differs from the dealer's own
  // number ($41,000 vs $32,950; $34,500 vs $31,000). It is a third party's
  // reading of the car, not this listing's ask.
  assert.equal(motorcarVehicle(PILL_VDP, PILL_VDP_URL).offers.price, 32950);
  assert.equal(motorcarVehicle(SLEEK_VDP, SLEEK_VDP_URL).offers.price, 31000);

  // A payment estimate is refused outright rather than counted — counting it
  // would either publish it or, when a real price is beside it, silence a
  // price we could stand behind. Both wordings, and both magnitudes: "$429"
  // is below the amounts this reads at all, "$1,290" is not.
  for (const pmt of ["$429/mo", "$1,290 / mo", "$1,290 per month", "$1,290<span>/month</span>"]) {
    const withPayment = SLEEK_VDP.replace("<h2>$31,000</h2>", `<h2>$31,000</h2><div class='pmt'>${pmt}</div>`);
    assert.equal(motorcarVehicle(withPayment, SLEEK_VDP_URL).offers.price, 31000, pmt);
  }

  // The dealer's own prose is not a price field. Master Auto Group's 2024
  // Cybertruck prints $76,999 in its price heading and "$119,990 Original
  // MSRP" in the description — counting both abstained on a priced car.
  const withMsrpProse = SLEEK_VDP.replace(
    "<table class=\"table\">",
    "<p>ONE OWNER<br />** $119,990 Original MSRP **</p><table class=\"table\">"
  );
  assert.equal(motorcarVehicle(withMsrpProse, SLEEK_VDP_URL).offers.price, 31000);

  // But a ladder inside the designated slot itself abstains where it stands.
  // The car stays; the claim goes quiet.
  const ladder = SLEEK_VDP.replace("<h2>$31,000</h2>", "<h2><s>$34,500</s> $31,000</h2>");
  const v = motorcarVehicle(ladder, SLEEK_VDP_URL);
  assert.equal(v.offers.price, undefined);
  assert.equal(v.offers.priceProvenance, undefined);
  assert.equal(v.vehicleIdentificationNumber, "JTJDARDZ4M2243071");
  // …and it does NOT then go looking elsewhere on the page for a number.
  const ladderPlusProse = ladder.replace("<table class=\"table\">", "<p>$119,990 Original MSRP</p><table class=\"table\">");
  assert.equal(motorcarVehicle(ladderPlusProse, SLEEK_VDP_URL).offers.price, undefined);

  // The pill theme designates its price with a label instead of a heading.
  assert.equal(resolveMotorcarPrice(vdpHead(PILL_VDP)), 32950);
  const soldLabel = PILL_VDP.replace(
    '<div class="pill_data price">$32,950</div>',
    '<div class="pill_data price"><span class="price-sold">Sold</span></div>'
  );
  assert.equal(resolveMotorcarPrice(vdpHead(soldLabel)), undefined);
});

test("an unfamiliar theme abstains on condition rather than defaulting to used", () => {
  const noCondition = SLEEK_VDP.replace("<tr><td>CONDITION:</td><td>USED</td></tr>", "");
  assert.equal(motorcarVehicle(noCondition, SLEEK_VDP_URL).itemCondition, undefined);
  const unreadable = SLEEK_VDP.replace("<td>USED</td>", "<td>Immaculate</td>");
  assert.equal(motorcarVehicle(unreadable, SLEEK_VDP_URL).itemCondition, undefined);
  assert.equal(labelledFacts(vdpHead(SLEEK_VDP)).get("condition"), "USED");
});

test("the VDP's plug-in fuel string reaches classifyEv and normalize", () => {
  const v = motorcarVehicle(PILL_VDP, PILL_VDP_URL);
  assert.deepEqual(classifyEv(v), { isEv: true, kind: "PHEV", confidence: "high" });
  const rec = normalize(v, { sourceUrl: PILL_VDP_URL, dealerDomain: "megaauto.motorcarsites.com" });
  assert.equal(rec.vin, "JTMEB3FV9MD049110");
  assert.equal(rec.make, "Toyota");
  assert.equal(rec.model, "RAV4");
  assert.equal(rec.trim, "Prime XSE");
  assert.equal(rec.priceUsd, 32950);
  assert.equal(rec.priceProvenance, MOTORCARSITES_PRICE);
  assert.equal(rec.condition, "used");
  assert.equal(rec.mileage, 14588);
  // The row's identity is the full subdomain — this vendor hosts every
  // rooftop on its own apex, so an apex-keyed row would merge every dealer it
  // hosts into one.
  assert.equal(rec.dealerDomain, "megaauto.motorcarsites.com");
});
