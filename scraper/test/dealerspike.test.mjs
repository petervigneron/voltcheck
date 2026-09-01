import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDealerSpike,
  dealerSpikeSeeds,
  dealerSpikeSrpLinks,
  dealerSpikeVehicles,
  dealerSpikeNextPageUrl,
  tileAskingPrices,
  DEALERSPIKE_SRP_PATH,
} from "../lib/platforms/dealerspike.mjs";
import { fingerprint } from "../lib/fingerprint.mjs";
import { classifyEv } from "../lib/ev.mjs";
import { normalize } from "../lib/normalize.mjs";
import { DEALERSPIKE_PRICE } from "../lib/price-provenance.mjs";

// Fixtures trimmed from live Dealer Spike SRPs, fetched 2026-08-31. Structure,
// entity encoding and class names are verbatim; only the boilerplate around
// them is dropped. Sources are named per tile.

const tile = (attrs, inner) => `<li class="v7list-results__item" ${attrs}>${inner}</li>`;

// beavertonmotorcycles.com/--inventory, tile 1: one price, one --current span.
const BEAVERTON_TILE = tile(
  `data-unit-id="19142959" data-unit-condition="NEW" data-unit-year="2027" data-unit-make="Beta" data-unit-model="300 RR X-Pro" data-unit-category="Motorcycle &#x2F; Scooter" data-unit-subcategory="Off-Road"`,
  `<a class="vehicle__image b-lazy" href="/NEW-Inventory-2027-Beta-Motorcycle-Scooter-300-RR-X-Pro-Beaverton-Motorcycles-19142959?ref=list"
      data-src="&#x2F;&#x2F;cdn.dealerspike.com&#x2F;imglib&#x2F;v1&#x2F;300x225&#x2F;imglib&#x2F;trimsdb&#x2F;27581841-0-153910481.jpg|&#x2F;&#x2F;cdn.dealerspike.com&#x2F;imglib&#x2F;v1&#x2F;640x480&#x2F;imglib&#x2F;trimsdb&#x2F;27581841-0-153910481.jpg"></a>
   <a class="vehicle-heading__link" href="/NEW-Inventory-2027-Beta-Motorcycle-Scooter-300-RR-X-Pro-Beaverton-Motorcycles-19142959?ref=list" title="2027 Beta 300 RR X-Pro"></a>
   <div class="v7list-vehicle__price-group">
     <a class="v7list-vehicle__price-link" href="/--xt-xInquiry?1=1&oid&#x3D;19142959&condition&#x3D;NEW&stockno&#x3D;BET201589&vin&#x3D;ZD3E4E973V0201589" title="Click for a Quote">
       <span class="vehicle-price vehicle-price--current">
         <span class="vehicle-price__label">Bob's Price</span>
         <span class="vehicle-price__price ">$10,990</span>
       </span>
     </a>
     <div class="psm-pricedrop-srp-widget" data-psm-unitid="19142959" data-psm-unitprice="9995"></div>
   </div>
   <ul class="vehicle-specs__list">
     <li class="vehicle-specs__item vehicle-specs__item--condition"><h5 class="vehicle-specs__label" title="Condition">Condition</h5><span class="vehicle-specs__value" title="Condition: NEW">NEW</span></li>
     <li class="vehicle-specs__item vehicle-specs__item--stock-number"><h5 class="vehicle-specs__label" title="Stock Number">Stock Number</h5><span class="vehicle-specs__value" title="Stock Number: BET201589">BET201589</span></li>
     <li class="vehicle-specs__item vehicle-specs__item--vin"><h5 class="vehicle-specs__label" title="Vin">Vin</h5><span class="vehicle-specs__value" title="Vin: ZD3E4E973V0201589">ZD3E4E973V0201589</span></li>
     <li class="vehicle-specs__item vehicle-specs__item--category"><h5 class="vehicle-specs__label" title="Vehicle Type">Vehicle Type</h5><span class="vehicle-specs__value" title="Vehicle Type: Motorcycle &#x2F; Scooter">Motorcycle &#x2F; Scooter</span></li>
   </ul>`,
);

// clickitrvspokane.com/--inventory, tile 1: the Retail/Our Price/Savings
// ladder. $81,339 is struck through and $21,359 is a difference; only $59,980
// is an ask.
const LADDER_TILE = tile(
  `data-unit-id="19099753" data-unit-condition="NEW" data-unit-year="2027" data-unit-make="Forest River" data-unit-model="305RLOK" data-unit-category="Trailer"`,
  `<a class="vehicle-heading__link" href="/NEW-Inventory-2027-Forest-River-Trailer-305RLOK-WILDWOOD-Spokane-WA-19099753?ref=list" title="2027 Forest River WILDWOOD 305RLOK"></a>
   <div class="v7list-vehicle__price-group">
     <a class="v7list-vehicle__price-link" href="/--xt-xInquiry?1=1&vin&#x3D;4X4TWBG22VU029198">
       <span class="vehicle-price vehicle-price--old"><span class="vehicle-price__label">Retail Price</span><span class="vehicle-price__price strike">$81,339</span></span>
       <span class="vehicle-price vehicle-price--current"><span class="vehicle-price__label">Our Price</span><span class="vehicle-price__price ">$59,980</span></span>
       <span class="vehicle-price vehicle-price--savings"><span class="vehicle-price__label">Savings</span><span class="vehicle-price__price ">$21,359</span></span>
     </a>
   </div>
   <ul class="vehicle-specs__list">
     <li class="vehicle-specs__item vehicle-specs__item--vin"><h5 class="vehicle-specs__label" title="Vin">Vin</h5><span class="vehicle-specs__value" title="Vin: 4X4TWBG22VU029198">4X4TWBG22VU029198</span></li>
     <li class="vehicle-specs__item vehicle-specs__item--status"><h5 class="vehicle-specs__label" title="Availability">Availability</h5><span class="vehicle-specs__value" title="Availability: In Stock">In Stock</span></li>
     <li class="vehicle-specs__item vehicle-specs__item--stock-number"><h5 class="vehicle-specs__label" title="Stock Number">Stock Number</h5><span class="vehicle-specs__value" title="Stock Number: N4876">N4876</span></li>
   </ul>`,
);

// portlandairstream.com/--inventory, tile 1. The case the --current rule was
// written for: a struck-through MSRP, an empty asking slot, and two fees. Any
// figure published here is either a price the dealer crossed out or a fee.
const FEES_TILE = tile(
  `data-unit-id="18781436" data-unit-condition="NEW" data-unit-year="2027" data-unit-make="Airstream" data-unit-model="Atlas 25MS" data-unit-category="Motorhome"`,
  `<a class="vehicle-heading__link" href="/NEW-Inventory-2027-Airstream-Motorhome-Atlas-25MS-Seattle-WA-18781436?ref=list" title="2027 Airstream Atlas 25MS"></a>
   <div class="v7list-vehicle__price-group">
     <a class="v7list-vehicle__price-link" href="/--xt-xInquiry?1=1&vin&#x3D;W1X9N33Y7TN362345">
       <span class="vehicle-price vehicle-price--old"><span class="vehicle-price__label">MSRP</span><span class="vehicle-price__price strike">$354,600</span></span>
       <span class="vehicle-price vehicle-price--current"><span class="vehicle-price__label">Click for a Quote</span></span>
       <span class="vehicle-price vehicle-price--docfee"><span class="vehicle-price__label">Doc Fee</span><span class="vehicle-price__price ">$215</span></span>
       <span class="vehicle-price vehicle-price--elecfee"><span class="vehicle-price__label">Electronic Fee</span><span class="vehicle-price__price">$35</span></span>
     </a>
   </div>
   <ul class="vehicle-specs__list">
     <li class="vehicle-specs__item vehicle-specs__item--vin"><h5 class="vehicle-specs__label" title="Vin">Vin</h5><span class="vehicle-specs__value" title="Vin: W1X9N33Y7TN362345">W1X9N33Y7TN362345</span></li>
   </ul>`,
);

// eastsideharley.com/--inventory, tile 1. The asking slot holds free text
// instead of a price element — "Starting at" is a model's from-price.
const PRICE_TEXT_TILE = tile(
  `data-unit-id="18788612" data-unit-condition="NEW" data-unit-year="2026" data-unit-make="Harley-Davidson&#xAE;" data-unit-model="FLFB &#x2D; Fat Boy&#xAE;" data-unit-category="Motorcycle &#x2F; Scooter"`,
  `<a class="vehicle-heading__link" href="/NEW-Inventory-2026-Harley-Davidson-Motorcycle-Scooter-FLFB-Fat-Boy-Cruiser-Eastside-Harley-Davidson-18788612?ref=list" title="2026 Harley-Davidson&#xAE; FLFB &#x2D; Fat Boy&#xAE;"></a>
   <div class="v7list-vehicle__price-group">
     <a class="v7list-vehicle__price-link" href="/--xt-xInquiry?1=1&vin&#x3D;1HD1YF911TB035262">
       <span class="vehicle-price vehicle-price--current"><span class="vehicle-price__label">Starting at $22,599</span></span>
     </a>
   </div>
   <ul class="vehicle-specs__list">
     <li class="vehicle-specs__item vehicle-specs__item--miles"><h5 class="vehicle-specs__label" title="Odometer">Odometer</h5><span class="vehicle-specs__value" title="Odometer: 6 mi">6 mi</span></li>
     <li class="vehicle-specs__item vehicle-specs__item--color"><h5 class="vehicle-specs__label" title="Color">Color</h5><span class="vehicle-specs__value" title="Color: VIVID BLACK">VIVID BLACK</span></li>
     <li class="vehicle-specs__item vehicle-specs__item--vin"><h5 class="vehicle-specs__label" title="Vin">Vin</h5><span class="vehicle-specs__value" title="Vin: 1HD1YF911TB035262">1HD1YF911TB035262</span></li>
   </ul>`,
);

// beavertonmotorcycles.com/--inventory?condition=pre-owned, tile 1. USED, with
// the previous ask struck through as "Was".
const USED_TILE = tile(
  `data-unit-id="18989484" data-unit-condition="USED" data-unit-year="2026" data-unit-make="Beta" data-unit-model="X" data-unit-category="Motorcycle &#x2F; Scooter"`,
  `<a class="vehicle-heading__link" href="/USED-Inventory-2026-Beta-Motorcycle-Scooter-X-Beaverton-Motorcycles-18989484?ref=list" title="2026 Beta X"></a>
   <div class="v7list-vehicle__price-group">
     <a class="v7list-vehicle__price-link" href="/--xt-xInquiry?1=1&condition&#x3D;USED&vin&#x3D;ZD3E8S269T0100140">
       <span class="vehicle-price vehicle-price--old"><span class="vehicle-price__label">Was</span><span class="vehicle-price__price strike">$6,799</span></span>
       <span class="vehicle-price vehicle-price--current"><span class="vehicle-price__label">Our Price</span><span class="vehicle-price__price ">$5,999</span></span>
     </a>
   </div>
   <ul class="vehicle-specs__list">
     <li class="vehicle-specs__item vehicle-specs__item--miles"><h5 class="vehicle-specs__label" title="Odometer">Odometer</h5><span class="vehicle-specs__value" title="Odometer: 49">49</span></li>
     <li class="vehicle-specs__item vehicle-specs__item--vin"><h5 class="vehicle-specs__label" title="Vin">Vin</h5><span class="vehicle-specs__value" title="Vin: ZD3E8S269T0100140">ZD3E8S269T0100140</span></li>
   </ul>`,
);

// kitsaptractor.net/--inventory: 20 tiles, 0 VINs. Tractors have no VIN row.
const VINLESS_TILE = tile(
  `data-unit-id="18000001" data-unit-condition="NEW" data-unit-year="2025" data-unit-make="Kubota" data-unit-model="L3302" data-unit-category="Tractor"`,
  `<a class="vehicle-heading__link" href="/NEW-Inventory-2025-Kubota-Tractor-L3302-Port-Orchard-WA-18000001?ref=list" title="2025 Kubota L3302"></a>
   <div class="v7list-vehicle__price-group">
     <span class="vehicle-price vehicle-price--current"><span class="vehicle-price__label">Our Price</span><span class="vehicle-price__price ">$28,499</span></span>
   </div>
   <ul class="vehicle-specs__list">
     <li class="vehicle-specs__item vehicle-specs__item--stock-number"><h5 class="vehicle-specs__label" title="Stock Number">Stock Number</h5><span class="vehicle-specs__value" title="Stock Number: K9001">K9001</span></li>
   </ul>`,
);

// Both pagers, verbatim in shape: the visible one is JS-driven and its
// commented-out twin claims 100 pages on every rooftop regardless of lot size.
// The seo list is the crawlable one and names the true last page.
const PAGERS = `
<nav class="v7list-pagination" ds-next-page="2"><span class="v7list-pagination__page">Page 1 of 33</span></nav>
<!--<nav class="v7list-pagination"><span class="v7list-pagination__page">Page 1 of 100</span></nav>-->
<nav aria-label="Inventory pagination"><ol class="v7list-seo-paging">
<li><span aria-current="page">Page 1</span></li>
<li><a data-nav="client" href="/default.asp?page=inventory&sef=motorcycles%2Dfor%2Dsale%2Dbeaverton%2Dportland%2Dor&pg=2">Page 2</a></li>
<li><a data-nav="client" href="/default.asp?page=inventory&sef=motorcycles%2Dfor%2Dsale%2Dbeaverton%2Dportland%2Dor&pg=3">Page 3</a></li>
<li><a data-nav="client" href="/default.asp?page=inventory&sef=motorcycles%2Dfor%2Dsale%2Dbeaverton%2Dportland%2Dor&pg=33">Page 33</a></li>
<li><a rel="next" data-nav="client" href="/default.asp?page=inventory&sef=motorcycles%2Dfor%2Dsale%2Dbeaverton%2Dportland%2Dor&pg=2">Next page</a></li>
</ol></nav>`;

// The last page's pager lists only what is behind it — this is what stops the
// walk, including on a clamped ?pg=34 that re-serves page 33.
const LAST_PAGE_PAGER = `<ol class="v7list-seo-paging">
<li><a href="/default.asp?page=inventory&sef=x&pg=31">Page 31</a></li>
<li><a href="/default.asp?page=inventory&sef=x&pg=32">Page 32</a></li>
<li><span aria-current="page">Page 33</span></li>
</ol>`;

// The nav menu's category links carry pg=1 on every page. They are outside the
// seo list and must not be mistaken for a pager.
const NAV_MENU = `<ul class="menu">
<li><a href="/new-motorcycles-for-sale-beaverton-portland-or--inventory?condition=new&pg=1&subcategory=youth">Youth Units</a></li>
<li><a href="/motorcycles-for-sale-beaverton-portland-or--inventory?pg=1&price=0-5000">Under $5K</a></li>
<li><a href="/motorcycles-for-sale-beaverton-portland-or--inventory">All Inventory</a></li>
</ul>`;

const srp = (tiles, extra = PAGERS) => `<!doctype html><html><head>
<link rel="preconnect" href="https://cdn.dealerspike.com"/>
</head><body>${NAV_MENU}
<div class="v7list-results" id="v7results"><ul class="v7list-results__list">${tiles}</ul></div>
${extra}</body></html>`;

const SRP = srp(`${BEAVERTON_TILE}${LADDER_TILE}${FEES_TILE}${PRICE_TEXT_TILE}${USED_TILE}${VINLESS_TILE}`);
const PAGE_URL = "https://www.beavertonmotorcycles.com/--inventory";
const byVin = (html, vin) =>
  dealerSpikeVehicles(html, PAGE_URL).find((v) => v.vehicleIdentificationNumber === vin);

test("the fingerprint is the vendor's own hosts, not the words 'dealer spike'", () => {
  assert.equal(isDealerSpike(SRP), true);
  assert.equal(fingerprint(SRP), "dealerspike");
  assert.equal(fingerprint('<html><script src="https://modal-widget.services.dealerspike.net/m.js"></script></html>'), "dealerspike");
  const prose = "<html><p>Our site is built by a dealer spike vendor. dealerspike is great.</p></html>";
  assert.equal(isDealerSpike(prose), false);
  assert.notEqual(fingerprint(prose), "dealerspike");
  assert.equal(isDealerSpike(undefined), false);
});

test("dealerSpikeSeeds names both generations' bare doors", () => {
  assert.equal(DEALERSPIKE_SRP_PATH, "/--inventory");
  assert.deepEqual(dealerSpikeSeeds("https://www.beavertonmotorcycles.com"), [
    "https://www.beavertonmotorcycles.com/--inventory",
    "https://www.beavertonmotorcycles.com/--xAllInventory",
  ]);
});

test("dealerSpikeSrpLinks lifts a rooftop's own bare SRP slug, never a filtered facet", () => {
  assert.deepEqual(dealerSpikeSrpLinks(NAV_MENU, "https://www.beavertonmotorcycles.com/"), [
    "https://www.beavertonmotorcycles.com/motorcycles-for-sale-beaverton-portland-or--inventory",
  ]);
  // A link off-origin is another rooftop's lot, not this one's.
  assert.deepEqual(
    dealerSpikeSrpLinks('<a href="https://www.othershop.com/x--inventory">x</a>', "https://www.beavertonmotorcycles.com/"),
    [],
  );
  assert.deepEqual(dealerSpikeSrpLinks(undefined, "https://www.beavertonmotorcycles.com/"), []);
});

test("pagination walks ?pg=N off the seo pager and ignores the commented 'of 100' twin", () => {
  assert.equal(dealerSpikeNextPageUrl(SRP, PAGE_URL), `${PAGE_URL}?pg=2`);
  assert.equal(dealerSpikeNextPageUrl(SRP, `${PAGE_URL}?pg=32`), `${PAGE_URL}?pg=33`);
  // Page 33 of 33: the pager lists 31 and 32 behind it, so the walk ends —
  // and would end the same way on a clamped ?pg=34 serving page 33's body.
  assert.equal(dealerSpikeNextPageUrl(srp("", LAST_PAGE_PAGER), `${PAGE_URL}?pg=33`), null);
  assert.equal(dealerSpikeNextPageUrl(srp("", LAST_PAGE_PAGER), `${PAGE_URL}?pg=34`), null);
  // Never 100: reading "Page 1 of 33" beside its commented "Page 1 of 100"
  // twin would walk 67 pages of re-served last page at every rooftop.
  for (let pg = 34; pg <= 100; pg++) {
    assert.equal(dealerSpikeNextPageUrl(srp("", LAST_PAGE_PAGER), `${PAGE_URL}?pg=${pg}`), null);
  }
  // A lot that fits on one page ships no seo pager, and the nav menu's pg=1
  // category links are not one.
  assert.equal(dealerSpikeNextPageUrl(srp(BEAVERTON_TILE, ""), PAGE_URL), null);
  assert.equal(dealerSpikeNextPageUrl("<html>not dealer spike</html>", PAGE_URL), null);
});

test("a plain tile yields the price the rooftop prints, tagged with its provenance", () => {
  const beta = byVin(SRP, "ZD3E4E973V0201589");
  assert.equal(beta.offers.price, 10990);
  assert.equal(beta.offers.priceProvenance, DEALERSPIKE_PRICE);
  assert.equal(beta.offers.priceCurrency, "USD");
  // Not the price-drop widget's data-psm-unitprice="9995" beside it — that is
  // a third party's number on the dealer's car, the automanager/CarGurus case.
  assert.notEqual(beta.offers.price, 9995);
});

test("on a Retail/Our Price/Savings ladder only the asking rung is published", () => {
  const rv = byVin(SRP, "4X4TWBG22VU029198");
  assert.equal(rv.offers.price, 59980);
  assert.deepEqual(tileAskingPrices(LADDER_TILE), [59980]);
});

test("a struck-through MSRP beside fees and an empty asking slot yields no price", () => {
  const airstream = byVin(SRP, "W1X9N33Y7TN362345");
  assert.deepEqual(tileAskingPrices(FEES_TILE), []);
  assert.equal(airstream.offers.price, undefined);
  assert.equal(airstream.offers.priceProvenance, undefined);
  // The two figures a tile-wide scan would have reached instead.
  assert.notEqual(airstream.offers.price, 354600);
  assert.notEqual(airstream.offers.price, 215);
});

test("'Starting at $22,599' in the label is a from-price, not this VIN's ask", () => {
  const harley = byVin(SRP, "1HD1YF911TB035262");
  assert.deepEqual(tileAskingPrices(PRICE_TEXT_TILE), []);
  assert.equal(harley.offers.price, undefined);
});

test("two distinct asking figures in one tile abstain rather than pick a rung", () => {
  const twoRungs = PRICE_TEXT_TILE.replace(
    '<span class="vehicle-price__label">Starting at $22,599</span>',
    '<span class="vehicle-price__price">$22,599</span></span><span class="vehicle-price vehicle-price--current"><span class="vehicle-price__price">$19,999</span>',
  );
  assert.deepEqual(tileAskingPrices(twoRungs), [22599, 19999]);
  assert.equal(byVin(srp(twoRungs), "1HD1YF911TB035262").offers.price, undefined);
  // The same figure printed twice is one figure, not a ladder.
  assert.deepEqual(
    tileAskingPrices(
      '<span class="vehicle-price vehicle-price--current"><span class="vehicle-price__price">$9,900</span></span>' +
        '<span class="vehicle-price vehicle-price--current"><span class="vehicle-price__price">$9,900</span></span>',
    ),
    [9900],
  );
});

test("condition comes from the platform's own token, and certification is never claimed", () => {
  assert.equal(byVin(SRP, "ZD3E4E973V0201589").itemCondition, "new");
  assert.equal(byVin(SRP, "ZD3E8S269T0100140").itemCondition, "used");
  // Attribute gone: the /USED-Inventory- path segment is the platform's other
  // statement of the same token.
  const pathOnly = USED_TILE.replace(' data-unit-condition="USED"', "");
  assert.equal(byVin(srp(pathOnly), "ZD3E8S269T0100140").itemCondition, "used");
  // Neither stated: no condition, never a defaulted "used".
  const silent = pathOnly.replace(/\/USED-Inventory-/g, "/Inventory-");
  assert.equal(byVin(srp(silent), "ZD3E8S269T0100140").itemCondition, undefined);
  // A certified unit is a used car here; the certification itself is a
  // warranty claim this extractor does not make.
  const cpo = USED_TILE.replace('data-unit-condition="USED"', 'data-unit-condition="CERTIFIED"');
  assert.equal(byVin(srp(cpo), "ZD3E8S269T0100140").itemCondition, "used");
});

test("a VIN-less tile is dropped rather than keyed by the page it shares", () => {
  const vins = dealerSpikeVehicles(SRP, PAGE_URL).map((v) => v.vehicleIdentificationNumber);
  assert.equal(vins.length, 5);
  assert.equal(vins.includes(undefined), false);
  // The whole kitsaptractor.net shape: 20 priced tiles, no VIN row on any.
  assert.deepEqual(dealerSpikeVehicles(srp(VINLESS_TILE.repeat(3)), PAGE_URL), []);
  // A VIN of the wrong length is not a VIN.
  const short = LADDER_TILE.replace(/4X4TWBG22VU029198/g, "4X4TWBG22VU02919");
  assert.deepEqual(dealerSpikeVehicles(srp(short), PAGE_URL), []);
});

test("a unit the rooftop marks sold never becomes a listing", () => {
  const sold = LADDER_TILE.replace("Availability: In Stock\">In Stock", "Availability: Sold\">Sold");
  assert.deepEqual(dealerSpikeVehicles(srp(sold), PAGE_URL), []);
  // "In Transit" is a live state and stays.
  const transit = LADDER_TILE.replace("Availability: In Stock\">In Stock", "Availability: In Transit\">In Transit");
  assert.equal(byVin(srp(transit), "4X4TWBG22VU029198").offers.price, 59980);
});

test("junk in, nothing out", () => {
  assert.deepEqual(dealerSpikeVehicles("<html>dealer.com</html>", PAGE_URL), []);
  assert.deepEqual(dealerSpikeVehicles(undefined, PAGE_URL), []);
  // A Dealer Spike page with no results list — the /src/xInventory404.asp
  // redirect that 15 of 28 cohort rooftops answer /--inventory with.
  assert.deepEqual(
    dealerSpikeVehicles('<html><link href="https://cdn.dealerspike.com/x.css"/><h1>Not Found</h1></html>', PAGE_URL),
    [],
  );
  // The V7 shell with an empty list, which catsexotics.com serves.
  assert.deepEqual(dealerSpikeVehicles(srp(""), PAGE_URL), []);
});

test("page scripts after the last tile are not part of it", () => {
  // dallashonda.com ships this below the results list. Folding it into the
  // final tile would put a second asking-price element in that tile and
  // abstain on a car that has a price.
  const trailing = `<script>
    $('li.v7list-results__item').each(function () {
      $(this).find('.vehicle-price.vehicle-price--current .vehicle-price__label').text('MSRP');
      var discountList = '<span class="vehicle-price vehicle-price--current"><span class="vehicle-price__price">$1,234</span></span>';
    });
  </script>`;
  const withScript = srp(BEAVERTON_TILE, trailing + PAGERS);
  assert.equal(byVin(withScript, "ZD3E4E973V0201589").offers.price, 10990);
});

test("images are the platform's own 640x480 rendition, deduped across sizes", () => {
  const beta = byVin(SRP, "ZD3E4E973V0201589");
  // data-src ships 300x225 and 640x480 of ONE photo, pipe-separated. The size
  // segment is a CDN resizer directive, not photo identity.
  assert.deepEqual(beta.image, [
    "https://cdn.dealerspike.com/imglib/v1/640x480/imglib/trimsdb/27581841-0-153910481.jpg",
  ]);
  // Gallery thumbs ship at 160x120 and are different photos; normalising the
  // segment keeps them distinct and usable.
  const withThumbs = BEAVERTON_TILE.replace(
    "</a>\n   <a class=\"vehicle-heading__link\"",
    '</a><img data-src="&#x2F;&#x2F;cdn.dealerspike.com&#x2F;imglib&#x2F;v1&#x2F;160x120&#x2F;imglib&#x2F;assets&#x2F;inventory&#x2F;B1&#x2F;05&#x2F;B105DF38.jpg"/>\n   <a class="vehicle-heading__link"',
  );
  assert.deepEqual(byVin(srp(withThumbs), "ZD3E4E973V0201589").image, [
    "https://cdn.dealerspike.com/imglib/v1/640x480/imglib/trimsdb/27581841-0-153910481.jpg",
    "https://cdn.dealerspike.com/imglib/v1/640x480/imglib/assets/inventory/B1/05/B105DF38.jpg",
  ]);
  // A tile with no photo carries none, rather than an empty array.
  assert.equal(byVin(SRP, "4X4TWBG22VU029198").image, undefined);
});

test("fuelType passes through only when the rooftop prints one", () => {
  // No sampled rooftop prints a fuel row, and nothing is inferred from the
  // category — a "Motorcycle / Scooter" is not evidence of a fuel.
  const beta = byVin(SRP, "ZD3E4E973V0201589");
  assert.equal(beta.fuelType, undefined);
  assert.equal(classifyEv(beta).isEv, false);
  const electric = BEAVERTON_TILE.replace(
    '<li class="vehicle-specs__item vehicle-specs__item--vin">',
    '<li class="vehicle-specs__item"><h5 class="vehicle-specs__label" title="Fuel Type">Fuel Type</h5><span class="vehicle-specs__value" title="Fuel Type: Electric">Electric</span></li><li class="vehicle-specs__item vehicle-specs__item--vin">',
  );
  const ev = byVin(srp(electric), "ZD3E4E973V0201589");
  assert.equal(ev.fuelType, "Electric");
  assert.deepEqual(classifyEv(ev), { isEv: true, kind: "BEV", confidence: "high" });
});

test("a tile normalizes into the record the pipeline stores", () => {
  const rec = normalize(byVin(SRP, "ZD3E8S269T0100140"), {
    sourceUrl: PAGE_URL,
    dealerDomain: "beavertonmotorcycles.com",
  });
  assert.equal(rec.vin, "ZD3E8S269T0100140");
  assert.equal(rec.year, 2026);
  assert.equal(rec.make, "Beta");
  assert.equal(rec.model, "X");
  assert.equal(rec.name, "2026 Beta X");
  assert.equal(rec.mileage, 49);
  assert.equal(rec.priceUsd, 5999);
  assert.equal(rec.priceProvenance, DEALERSPIKE_PRICE);
  assert.equal(rec.condition, "used");
  // ?ref=list is where the shopper came from, not the car's address.
  assert.equal(
    rec.vdpUrl,
    "https://www.beavertonmotorcycles.com/USED-Inventory-2026-Beta-Motorcycle-Scooter-X-Beaverton-Motorcycles-18989484",
  );
});

test("entity-encoded names and paths decode the way the rooftop renders them", () => {
  const harley = byVin(SRP, "1HD1YF911TB035262");
  assert.equal(harley.name, "2026 Harley-Davidson® FLFB - Fat Boy®");
  assert.equal(harley.brand, "Harley-Davidson®");
  assert.equal(harley.bodyType, "Motorcycle / Scooter");
  assert.equal(harley.color, "VIVID BLACK");
  assert.deepEqual(harley.mileageFromOdometer, { "@type": "QuantitativeValue", value: 6 });
});
