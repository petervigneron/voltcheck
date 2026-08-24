import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAutoDealersDigital,
  autoDealersDigitalSeeds,
  autoDealersDigitalEntries,
  autoDealersDigitalVehicles,
  autoDealersDigitalCardCount,
  autoDealersDigitalNextPageUrl,
  renderedPrice,
  ADD_PAGE_SIZE,
} from "../lib/platforms/autodealersdigital.mjs";
import { fingerprint } from "../lib/fingerprint.mjs";
import { classifyEv } from "../lib/ev.mjs";
import { normalize } from "../lib/normalize.mjs";
import { ADD_DISPLAY_PRICE } from "../lib/price-provenance.mjs";

// Two SRPs, structurally faithful to the two live templates. The point of the
// pair is that they put the per-car popup on OPPOSITE sides of the card it
// belongs to — template5 renders the card then its popup, template2 the popup
// then its card — which is the shift a popup-delimited reader gets wrong and
// a link-delimited one does not.
const card5 = ({ id, slug, title, banner, vin, price, sold }) => `
  <div class="listing-vehicles-card inventory-card-1 listing-vehicles-card-2">
    <div class="card-holder-link image-placeholder relative">
      <a href="/vehicles/${id}-${slug}/" class="vehicles-swiper-images">
        <div class="swiper inventory-card-swiper"><div class="swiper-slide">
          ${sold ? '<span class="status-badge">SOLD</span>' : ""}
          <img class="inventory-image" src="https://cdn-thumbor.autodealersdigital.com/unsafe/x.jpg">
        </div></div>
      </a>
    </div>
    <div class="vehicles-data-info">
      <a href="/vehicles/${id}-${slug}/"><h4 class="vehicle-title">${title}</h4></a>
      ${vin ? `<div class="vin-holder display-vin"><p class="vin-text vin"><span>VIN :</span><span>${vin}</span></p></div>` : ""}
      <a href="/vehicles/${id}-${slug}/"><div class="price-holder"><p class="display-price">${price}</p></div></a>
      <p class="banner-listing-tex">${banner}</p>
    </div>
  </div>
  <div class="popup-overlay overlay wt_form_request_vin${id}"><form><h2>Request VIN</h2></form></div>`;

const card2 = ({ id, slug, title, banner, price, sold }) => `
  <div class="popup-overlay overlay wt_form_request_vin${id}"><form><h2>Request VIN</h2></form></div>
  <div class="flex">
    <a class="card-holder-link" href="/vehicles/${id}-${slug}/">
      <div class="swiper inventory-card-swiper"><div class="swiper-slide">
        ${sold ? '<span class="status-badge">SOLD</span>' : ""}
        <img class="inventory-image" src="https://cdn-thumbor.autodealersdigital.com/unsafe/y.jpg">
      </div></div>
    </a>
    <a class="card-holder-link vehicle-info" href="/vehicles/${id}-${slug}/">
      <h4 class="vehicle-title">${title}</h4><p class="banner-listing-tex">${banner}</p>
    </a>
    <div class="price-holder"><p class="display-price">${price}</p></div>
  </div>`;

const page = (bodyClass, cards) => `<!doctype html><html><head>
<link rel="stylesheet" href="/wp-content/themes/website-theme-wp-v2/assets/gulp/build/css/main.css">
</head><body class="page_all-inventory ${bodyClass}">${cards.join("\n")}</body></html>`;

const SRP5 = page("wp-theme-website-theme-wp-v2 template5", [
  card5({
    id: "12051526", slug: "2013-Chevrolet-Tahoe", title: "2013 CHEVY TAHOE LT 4WD",
    banner: "2013 Chevrolet Tahoe 4WD 4dr 1500 LT", vin: "1GNSKBE0XDR234968", price: "$9,996",
  }),
  card5({
    id: "11683708", slug: "2016-Mclaren-675LT", title: "2016 MCLAREN 675LT",
    banner: "2016 Mclaren 675LT 2dr Conv Spider", vin: "SBM11SAA2GW675903", price: "POR", sold: true,
  }),
]);

const SRP2 = page("wp-theme-website-theme-wp-v2 template2", [
  card2({
    id: "8978939", slug: "2008-Dodge-Sprinter", title: "2008 DODGE SPRINTER",
    banner: "2009 Dodge Sprinter 2WD Reg Cab", price: "$12,500",
  }),
  card2({
    id: "8680868", slug: "2012-Nissan-LEAF", title: "2012 NISSAN LEAF",
    banner: "2012 Nissan LEAF 4dr HB SL", price: "$3,950",
  }),
]);

const PAGE_URL = "https://globalautomotorsco.com/all-inventory/";

const vdp = ({ vin, name, price, rendered, avail = "InStock", cond = "NewCondition", mileage = 164520, fuel = "Regular un", sold = false }) =>
  `<!doctype html><html><head>
<link rel="stylesheet" href="/wp-content/themes/website-theme-wp-v2/assets/gulp/build/css/page.css">
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Car",
    vehicleIdentificationNumber: vin,
    name,
    image: "https://cdn-thumbor.autodealersdigital.com/unsafe/z.jpg",
    itemCondition: `https://schema.org/${cond}`,
    brand: { "@type": "Brand", name: "Nissan" },
    model: "LEAF",
    vehicleConfiguration: "FWD Automatic",
    vehicleModelDate: "2012",
    mileageFromOdometer: { "@type": "QuantitativeValue", value: mileage, unitCode: "SMI" },
    color: "Red",
    bodyType: "Sedan",
    driveWheelConfiguration: "https://schema.org/FrontWheelDriveConfiguration",
    vehicleEngine: { "@type": "EngineSpecification", fuelType: fuel },
    vehicleTransmission: "Automatic",
    offers: { "@type": "Offer", availability: `https://schema.org/${avail}`, price, priceCurrency: "USD", itemCondition: `https://schema.org/${cond}` },
  })}</script></head><body>
  ${sold ? '<span class="status-badge">SOLD</span>' : ""}
  <div class="price-holder"><p class="display-price">${rendered}</p></div>
  </body></html>`;

const VDP_URL = "https://globalautomotorsco.com/vehicles/8680868-2012-Nissan-LEAF/";

test("fingerprints on the vendor's hosts and theme, never on its name", () => {
  assert.equal(isAutoDealersDigital(SRP5), true);
  assert.equal(isAutoDealersDigital(SRP2), true);
  assert.equal(isAutoDealersDigital("<html>Auto Dealers Digital is our marketing agency</html>"), false);
  assert.equal(isAutoDealersDigital(undefined), false);
});

test("fingerprint.mjs agrees with the module, so the crawl never seeds a page nothing reads", () => {
  assert.equal(fingerprint(SRP5), "autodealersdigital");
  assert.equal(fingerprint(SRP2), "autodealersdigital");
  assert.equal(fingerprint(vdp({ vin: "JN1AZ0CP6CT021069", name: "x", price: 1, rendered: "$1" })), "autodealersdigital");
});

test("seeds the SRP path the probe's guess table never had", () => {
  assert.deepEqual(autoDealersDigitalSeeds("https://globalautomotorsco.com"), [
    "https://globalautomotorsco.com/all-inventory/",
  ]);
});

// 4 of the 30 rooftops the sweep found do not use /all-inventory/, and on one
// of them the other slug is the only page with the lot on it.
test("seeds also read the rooftop's own inventory slug off its homepage", () => {
  const home =
    '<html><head><link href="/wp-content/themes/website-theme-wp-v2/x.css"></head><body>' +
    '<a href="https://smartbuymalden.com/active-inventory/">Inventory</a>' +
    '<a href="/active-inventory">Inventory</a>' + // slashless: mjlmotorcars links one, and it 404s
    '<a href="/about-us">About</a></body></html>';
  assert.deepEqual(autoDealersDigitalSeeds("https://smartbuymalden.com", home), [
    "https://smartbuymalden.com/all-inventory/",
    "https://smartbuymalden.com/active-inventory/",
  ]);

  // dfatampabay.com links its inventory on ANOTHER domain. Following it would
  // file davidfamilyauto.com's cars under dfatampabay's dealer_domain.
  const offSite =
    '<html><head><link href="/wp-content/themes/website-theme-wp-v2/x.css"></head>' +
    '<body><a href="https://davidfamilyauto.com/used-inventory/">Inventory</a></body></html>';
  assert.deepEqual(autoDealersDigitalSeeds("https://dfatampabay.com", offSite), [
    "https://dfatampabay.com/all-inventory/",
  ]);
});

test("the pager follows whichever slug the rooftop uses", () => {
  assert.equal(
    autoDealersDigitalNextPageUrl("https://smartbuymalden.com/active-inventory/", ADD_PAGE_SIZE),
    "https://smartbuymalden.com/active-inventory/page/2/",
  );
  assert.equal(
    autoDealersDigitalNextPageUrl("https://davidfamilyauto.com/used-inventory/page/2/", ADD_PAGE_SIZE),
    "https://davidfamilyauto.com/used-inventory/page/3/",
  );
});

// The regression this module was rewritten for. A popup-delimited reader
// returns the right COUNT on both templates and mislabels every card on one.
test("entries keep each card's own title and price on both templates", () => {
  const e5 = autoDealersDigitalEntries(SRP5, "https://wildaboutcarsgarage.com/all-inventory/");
  assert.equal(e5.length, 2);
  assert.match(e5[0].name, /2013 CHEVY TAHOE/);
  assert.match(e5[0].name, /2013 Chevrolet Tahoe 4WD/);
  assert.equal(e5[0].vin, "1GNSKBE0XDR234968");
  assert.equal(e5[0].sold, false);
  assert.match(e5[1].name, /675LT/);
  assert.equal(e5[1].sold, true);

  const e2 = autoDealersDigitalEntries(SRP2, PAGE_URL);
  assert.equal(e2.length, 2);
  assert.match(e2[0].name, /Sprinter/);
  assert.equal(e2[0].url, "https://globalautomotorsco.com/vehicles/8978939-2008-Dodge-Sprinter/");
  // The LEAF's name must be the LEAF's, not the Sprinter's shifted along.
  assert.match(e2[1].name, /2012 Nissan LEAF/);
  assert.doesNotMatch(e2[1].name, /Sprinter/);
  assert.equal(e2[1].url, "https://globalautomotorsco.com/vehicles/8680868-2012-Nissan-LEAF/");
});

test("a card links its car several times and still counts once", () => {
  assert.equal(autoDealersDigitalCardCount(SRP2), 2);
  assert.equal(autoDealersDigitalCardCount(SRP5), 2);
  assert.equal(autoDealersDigitalCardCount(undefined), 0);
});

test("pages while a page is full and stops when it is short", () => {
  assert.equal(autoDealersDigitalNextPageUrl(PAGE_URL, ADD_PAGE_SIZE), `${PAGE_URL}page/2/`);
  assert.equal(autoDealersDigitalNextPageUrl(`${PAGE_URL}page/2/`, ADD_PAGE_SIZE), `${PAGE_URL}page/3/`);
  assert.equal(autoDealersDigitalNextPageUrl(PAGE_URL, ADD_PAGE_SIZE - 1), null);
  assert.equal(autoDealersDigitalNextPageUrl("https://x.com/not-inventory/", ADD_PAGE_SIZE), null);
});

test("renderedPrice reads a dollar amount and refuses everything else", () => {
  assert.equal(renderedPrice('<p class="display-price">$9,996</p>'), 9996);
  assert.equal(renderedPrice('<p class="display-price">POR</p>'), undefined);
  assert.equal(renderedPrice('<p class="display-price">Up for Auction on BringaTraile</p>'), undefined);
  assert.equal(renderedPrice('<p class="display-price">$0</p>'), undefined);
  assert.equal(renderedPrice("<p>no price block here</p>"), undefined);
});

test("the VDP's hardcoded NewCondition never reaches a record", () => {
  const [v] = autoDealersDigitalVehicles(
    vdp({ vin: "JN1AZ0CP6CT021069", name: "2012 Nissan LEAF 4dr HB SL", price: 3950, rendered: "$3,950" }),
    VDP_URL,
  );
  assert.equal(v.itemCondition, undefined);
  assert.equal("itemCondition" in v, false);
  // …and stays gone through the generic normaliser, which is the layer that
  // would otherwise read it straight off the page's JSON-LD.
  const rec = normalize(v, { sourceUrl: VDP_URL, dealerDomain: "globalautomotorsco.com" });
  assert.equal(rec.condition, undefined);
  assert.equal(rec.vin, "JN1AZ0CP6CT021069");
  assert.equal(rec.priceUsd, 3950);
  assert.equal(rec.priceProvenance, ADD_DISPLAY_PRICE);
});

test("the rendered number gates the JSON-LD one", () => {
  const priced = autoDealersDigitalVehicles(
    vdp({ vin: "JN1AZ0CP6CT021069", name: "LEAF", price: 3950, rendered: "$3,950" }),
    VDP_URL,
  );
  assert.equal(priced[0].offers.price, 3950);
  assert.equal(priced[0].offers.priceProvenance, ADD_DISPLAY_PRICE);

  // The live McLaren: JSON-LD 359000 under a page that prints "POR".
  const por = autoDealersDigitalVehicles(
    vdp({ vin: "SBM11SAA2GW675903", name: "675LT", price: 359000, rendered: "POR" }),
    VDP_URL,
  );
  assert.equal(por[0].offers.price, undefined);
  assert.equal(por[0].offers.priceProvenance, undefined);

  // The live "$1 Cash" row: both are numbers and they disagree.
  const disagree = autoDealersDigitalVehicles(
    vdp({ vin: "SBM11SAA2GW675903", name: "x", price: 120000, rendered: "$1 Cash" }),
    VDP_URL,
  );
  assert.equal(disagree[0].offers.price, undefined);
});

test("sold cars are dropped on either marker, and only those", () => {
  const live = vdp({ vin: "JN1AZ0CP6CT021069", name: "LEAF", price: 3950, rendered: "$3,950" });
  assert.equal(autoDealersDigitalVehicles(live, VDP_URL).length, 1);

  const outOfStock = vdp({ vin: "JN1AZ0CP6CT021069", name: "LEAF", price: 3950, rendered: "$3,950", avail: "OutOfStock" });
  assert.equal(autoDealersDigitalVehicles(outOfStock, VDP_URL).length, 0);

  // The 5-of-87 case: no availability at all, sold badge on the page.
  const badgeOnly = vdp({ vin: "JN1AZ0CP6CT021069", name: "LEAF", price: 3950, rendered: "$3,950", avail: "InStock", sold: true })
    .replace(/"availability":"https:\/\/schema.org\/InStock",/, "");
  assert.equal(autoDealersDigitalVehicles(badgeOnly, VDP_URL).length, 0);
});

test("a chassis number is not a VIN, and mileage 0 is not a reading", () => {
  const classic = vdp({ vin: "161242", name: "1965 Porsche 356 C", price: 90000, rendered: "$90,000" });
  assert.deepEqual(autoDealersDigitalVehicles(classic, VDP_URL), []);

  const [v] = autoDealersDigitalVehicles(
    vdp({ vin: "JN1AZ0CP6CT021069", name: "LEAF", price: 3950, rendered: "$3,950", mileage: 0 }),
    VDP_URL,
  );
  assert.equal(v.mileageFromOdometer, undefined);
});

test("the EV survives the platform's truncated fuel string", () => {
  const [v] = autoDealersDigitalVehicles(
    vdp({ vin: "JN1AZ0CP6CT021069", name: "2012 Nissan LEAF 4dr HB SL", price: 3950, rendered: "$3,950", fuel: "Electric" }),
    VDP_URL,
  );
  assert.deepEqual(classifyEv(v), { isEv: true, kind: "BEV", confidence: "high" });
  // "Regular unleaded" arrives cut to ten characters; the NAME still carries it.
  const [t] = autoDealersDigitalVehicles(
    vdp({ vin: "JN1AZ0CP6CT021069", name: "2012 Nissan LEAF 4dr HB SL", price: 3950, rendered: "$3,950", fuel: "Regular un" }),
    VDP_URL,
  );
  assert.equal(classifyEv(t).isEv, true);
});

test("a page that is not this platform yields nothing at all", () => {
  assert.deepEqual(autoDealersDigitalEntries("<html><a href='/vehicles/1-a/'>x</a></html>", PAGE_URL), []);
  assert.deepEqual(autoDealersDigitalVehicles("<html>plain</html>", VDP_URL), []);
});
