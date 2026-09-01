import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDealerFront,
  dealerFrontSeeds,
  dealerFrontVehicles,
  dealerFrontNextPageUrl,
} from "../lib/platforms/dealerfront.mjs";
import { fingerprint } from "../lib/fingerprint.mjs";
import { DEALERFRONT_ASKING } from "../lib/price-provenance.mjs";

// Trimmed from metroautooc.com/inventory/ (template A) and
// aamotorsauto.com/inventory/ (template B), 2026-08-31.
const MARK_A = '<link href="//metroautooc.com/wp-content/plugins/dealerfront/assets/css/main.css">';
const MARK_B = '<img src="//cdn/logo.png" alt="powered by dealerfront.com logo">';

const tileA = (over = {}) => {
  const o = {
    vdp: "https://metroautooc.com/inventory/404951687050320-2012-acura-tsx-w-tech/",
    badge: "Used",
    price: "$11,222",
    label: "Asking Price",
    vin: "JH4CU2F66CC002409",
    fuel: "Gasoline",
    miles: "109,184",
    engine: "2.4L V4",
    ...over,
  };
  return `
    <a class="img-overlay" href="${o.vdp}"></a>
    <div class="position-absolute start-0 top-0 pt-3 ps-3"><span class="d-table badge bg-primary">${o.badge}</span></div>
    <div class="col"><div class="bg-warning text-black fw-bold px-3 py-1 d-inline-block rounded fs-5">${o.price}</div>
      <div class="text-muted text-small">${o.label}</div></div>
    <div class="col text-end"><div class="text-muted text-small"><strong>Stock #</strong> CC002409</div>
      <div class="text-muted text-small"><strong>VIN #</strong> ${o.vin}</div></div>
    <div class="col"><span class="fuel-icon"><svg></svg></span><br><small>${o.fuel}</small></div>
    <div class="col"><span class="mileage-icon"><svg></svg></span><br><small>${o.miles}</small></div>
    <div class="col"><span class="engine-icon"><svg></svg></span><br><small>${o.engine}</small></div>
    <h4><a href="${o.vdp}">2012 Acura TSX W/Tech</a></h4>`;
};

const tileB = `
  <div class="result-item format-standard ">
    <div class="carstory-container text-center" data-carstory-vin="19UUB2F6XJA009014"></div>
    <h4><a href="../inventory-details/?iid=885281777573446"><span class="standard-view-ymm">2018 Acura TLX V6 w/Tech w/A-SPEC</span></a></h4>
    <div class="price"><span class="vehicle-cost"><span class="vehicle-meta">Asking Price</span>$19,995</span></div>
  </div>`;

test("fingerprinted on the plugin path / footer credit, never the bare word or CarStory", () => {
  assert.ok(isDealerFront(MARK_A));
  assert.ok(isDealerFront(MARK_B));
  assert.equal(isDealerFront("<p>Welcome to Dealer Front Motors</p>"), false);
  assert.equal(isDealerFront('<div data-carstory-vin="19UUB2F6XJA009014"></div>'), false);
  assert.equal(fingerprint(MARK_A), "dealerfront");
  assert.equal(fingerprint(MARK_B), "dealerfront");
});

test("template A: the whole card comes out of the tile", () => {
  const [v] = dealerFrontVehicles(MARK_A + tileA(), "https://metroautooc.com/inventory/");
  assert.equal(v.vehicleIdentificationNumber, "JH4CU2F66CC002409");
  assert.equal(v.itemCondition, "used");
  assert.equal(v.offers.price, 11222);
  assert.equal(v.offers.priceProvenance, DEALERFRONT_ASKING);
  assert.equal(v.offers.url, "https://metroautooc.com/inventory/404951687050320-2012-acura-tsx-w-tech/");
  assert.equal(v.fuelType, "Gasoline");
  assert.equal(v.mileageFromOdometer.value, 109184);
  assert.equal(v.vehicleEngine.name, "2.4L V4");
});

test("template B: VIN from the CarStory identity attribute, price from the labelled cost", () => {
  const [v] = dealerFrontVehicles(MARK_B + tileB, "https://www.aamotorsauto.com/inventory/");
  assert.equal(v.vehicleIdentificationNumber, "19UUB2F6XJA009014");
  assert.equal(v.name, "2018 Acura TLX V6 w/Tech w/A-SPEC");
  assert.equal(v.offers.price, 19995);
  assert.equal(v.offers.url, "https://www.aamotorsauto.com/inventory-details/?iid=885281777573446");
  // No badge, no path token → no condition claim.
  assert.equal(v.itemCondition, undefined);
});

test("two distinct amounts under the label abstain; a VIN-less card is skipped", () => {
  const two = tileA() + '<div class="fs-5">$9,999</div><div class="text-muted text-small">Asking Price</div>';
  // Both amounts sit in the same overlay chunk → abstain.
  const [v] = dealerFrontVehicles(MARK_A + two, "https://metroautooc.com/inventory/");
  assert.equal(v.offers.price, undefined);
  assert.equal(v.offers.priceProvenance, undefined);
  assert.deepEqual(dealerFrontVehicles(MARK_A + tileA({ vin: "SHORT" }), "https://metroautooc.com/inventory/"), []);
  assert.deepEqual(dealerFrontVehicles(undefined, "https://x.com/"), []);
});

test("pagination: path-style pages on A, query-style on B, and a clean stop", () => {
  const pagerA = MARK_A + '<a href="https://metroautooc.com/inventory/page/2/">2</a><a href="https://metroautooc.com/inventory/page/10/">10</a>';
  assert.equal(
    dealerFrontNextPageUrl(pagerA, "https://metroautooc.com/inventory/"),
    "https://metroautooc.com/inventory/page/2/",
  );
  assert.equal(
    dealerFrontNextPageUrl(pagerA, "https://metroautooc.com/inventory/page/10/"),
    null,
  );
  const pagerB = MARK_B + '<a href="?&page=1">1</a><a href="?&page=2">2</a>';
  assert.equal(
    dealerFrontNextPageUrl(pagerB, "https://www.aamotorsauto.com/inventory/"),
    "https://www.aamotorsauto.com/inventory/?page=2",
  );
  assert.equal(dealerFrontNextPageUrl(pagerB, "https://www.aamotorsauto.com/inventory/?page=2"), null);
  assert.equal(dealerFrontNextPageUrl("<html></html>", "https://x.com/"), null);
});

test("seeds", () => {
  assert.deepEqual(dealerFrontSeeds("https://metroautooc.com"), ["https://metroautooc.com/inventory/"]);
});
