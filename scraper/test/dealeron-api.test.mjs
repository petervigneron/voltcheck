import { test } from "node:test";
import assert from "node:assert/strict";
import { isDealerOnApi, dealerOnTagging, priceFromLibrary, vehicleNode } from "../lib/platforms/dealeron-api.mjs";
import { normalize } from "../lib/normalize.mjs";
import { classifyEv } from "../lib/ev.mjs";

const ORIGIN = "https://www.dublinchevrolet.com";
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

// The tagging block DealerOn inlines on every SRP.
const SRP_TAG = `<script id="dealeron_tagging_data" type="application/json">{"dealerId":"25890","pageId":3160807,"pageType":"itemlist","items":["3GYK3EM50TS160759"],"itemCount":254}</script>`;

// A structurally faithful VehicleCard: the price stack lives base64-encoded in
// VehiclePriceLibrary (VehicleInternetPrice is 0, TaggingPrice is the MSRP), the
// VIN sits on the card and again inside the image carousel, photos are
// root-relative, and drivetrain can be null.
const CARD = {
  VehicleVin: "3GYK3EM50TS160759",
  VehicleYear: 2026,
  VehicleMake: "Cadillac",
  VehicleModel: "OPTIQ",
  VehicleTrim: "Sport",
  VehicleCondition: "Used",
  VehicleFuelType: "Electric Fuel System",
  VehicleMileage: 3083,
  Mileage: "3,083 mi",
  VehicleDriveTrain: null,
  VehicleStockNumber: "R67694",
  ExteriorColorLabel: "Stellar Black Metallic",
  InteriorColorLabel: "Noir",
  VehicleCpo: false,
  VehicleInternetPrice: 0,
  VehicleMsrp: 54998,
  TaggingPrice: "54998",
  VehiclePriceLibrary: b64(
    "MSRP:54998.0;Selling Price:53998.0;Invoice Price:55442.2;dealer_fee:85.0;calc_Savings:1000.0;calc_Dealer Doc Fee:85.0;calc_INTERNET PRICE:54083.0"
  ),
  VehicleDetailUrl: "https://www.dublinchevrolet.com/used-Dublin-2026-Cadillac-OPTIQ-Sport-3GYK3EM50TS160759",
  VehicleImageModel: {
    VehicleImageCarouselModel: { Vin: "3GYK3EM50TS160759", PhotoList: ["/inventoryphotos/20214/x/ip/1.jpg"] },
  },
};

test("isDealerOnApi needs both the vhcliaa storefront and the tagging block", () => {
  assert.equal(isDealerOnApi(`<div>vhcliaa</div>${SRP_TAG}`), true);
  assert.equal(isDealerOnApi(`<div>vhcliaa</div>`), false);
  assert.equal(isDealerOnApi(SRP_TAG), false);
});

test("dealerOnTagging reads dealerId and pageId from an SRP", () => {
  assert.deepEqual(dealerOnTagging(SRP_TAG), { dealerId: "25890", pageId: "3160807" });
});

test("dealerOnTagging ignores a VDP — only itemlist pages seed the SRP endpoint", () => {
  const vdp = `<script id="dealeron_tagging_data" type="application/json">{"dealerId":"25890","pageId":9999999,"pageType":"item"}</script>`;
  assert.equal(dealerOnTagging(vdp), null);
});

test("dealerOnTagging returns null when the block is absent or malformed", () => {
  assert.equal(dealerOnTagging("<html></html>"), null);
  assert.equal(dealerOnTagging(`<script id="dealeron_tagging_data">{not json}</script>`), null);
});

test("priceFromLibrary prefers the calc_INTERNET PRICE line", () => {
  // 54083 = selling 53998 + doc fee 85; the number the VDP JSON-LD published.
  assert.equal(priceFromLibrary(CARD.VehiclePriceLibrary), 54083);
});

test("priceFromLibrary falls back through selling price then MSRP", () => {
  assert.equal(priceFromLibrary(b64("MSRP:41000.0;Selling Price:39500.0")), 39500);
  assert.equal(priceFromLibrary(b64("MSRP:41000.0")), 41000);
});

test("priceFromLibrary is undefined for junk or an absent library", () => {
  assert.equal(priceFromLibrary(""), undefined);
  assert.equal(priceFromLibrary(undefined), undefined);
  assert.equal(priceFromLibrary(b64("dealer_fee:85.0")), undefined);
});

test("vehicleNode carries price, mileage, trim and an absolute VDP + photos", () => {
  const node = vehicleNode(CARD, ORIGIN);
  const rec = normalize(node, { sourceUrl: node.offers.url, dealerDomain: "dublinchevrolet.com" });
  assert.equal(rec.priceUsd, 54083);
  assert.equal(rec.mileage, 3083);
  assert.equal(rec.trim, "Sport");
  assert.equal(rec.vin, "3GYK3EM50TS160759");
  assert.equal(rec.vdpUrl, "https://www.dublinchevrolet.com/used-Dublin-2026-Cadillac-OPTIQ-Sport-3GYK3EM50TS160759");
  assert.equal(rec.images[0], "https://www.dublinchevrolet.com/inventoryphotos/20214/x/ip/1.jpg");
});

test("vehicleNode classifies a Cadillac OPTIQ as a BEV on its declared fuel", () => {
  assert.deepEqual(classifyEv(vehicleNode(CARD, ORIGIN)), { isEv: true, kind: "BEV", confidence: "high" });
});

test("a Gas/Electric Hybrid card is not admitted as an EV", () => {
  const node = vehicleNode({ ...CARD, VehicleFuelType: "Gas/Electric Hybrid" }, ORIGIN);
  assert.equal(classifyEv(node).isEv, false);
});

test("vehicleNode recovers the VIN from the image carousel when the card field is blank", () => {
  const node = vehicleNode({ ...CARD, VehicleVin: null }, ORIGIN);
  assert.equal(node.vehicleIdentificationNumber, "3GYK3EM50TS160759");
});

test("a card with no valid VIN anywhere maps to null", () => {
  const blank = { ...CARD, VehicleVin: null, VehicleImageModel: {} };
  assert.equal(vehicleNode(blank, ORIGIN), null);
});
