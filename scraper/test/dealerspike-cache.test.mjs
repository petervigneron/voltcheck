import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dealerSpikeVehInvUrl,
  parseVehInv,
  dealerSpikeCacheVehicle,
  DEALERSPIKE_OLD_SRP_PATH,
} from "../lib/platforms/dealerspike.mjs";
import { classifyEv } from "../lib/ev.mjs";
import { DEALERSPIKE_CACHE_PRICE } from "../lib/price-provenance.mjs";

// The record shape, trimmed from robertstruck.com's
// /imglib/Inventory/cache/6438/VehInv.js (2026-08-31; 120 records, 120
// distinct VINs, type N×101/U×19, ft D×112/""×8).
const ORIGIN = "https://www.robertstruck.com";
const rec = (over = {}) => ({
  id: "18999261",
  stockno: "184768",
  manuf: "International®",
  model: "HV",
  bike_year: "2027",
  price: "131995",
  color: "WHITE",
  miles: "754",
  type: "N",
  location: "ALBUQUERQUE",
  ft: "D",
  vin: "1HTEDTAR3VS419399",
  retail_price: "",
  sale_price: "",
  discount_price: "0",
  bike_image: "C1F9DD48-6796-4617-976A-CACEADC2F43F.jpeg",
  ...over,
});

test("the shell page names the cache file, entity-encoded or not", () => {
  assert.equal(
    dealerSpikeVehInvUrl(
      '<script src="/imglib/Inventory/cache/6438/VehInv.js?v=4213605"></script>',
      `${ORIGIN}${DEALERSPIKE_OLD_SRP_PATH}`,
    ),
    `${ORIGIN}/imglib/Inventory/cache/6438/VehInv.js?v=4213605`,
  );
  assert.equal(dealerSpikeVehInvUrl("<html>no cache here</html>", ORIGIN), null);
  assert.equal(dealerSpikeVehInvUrl(undefined, ORIGIN), null);
});

test("var Vehicles=[…] parses; anything malformed returns null, not a throw", () => {
  const js = `var Vehicles=[\n${JSON.stringify(rec())}\n,${JSON.stringify(rec({ vin: "1HTEDTAR2VS416865" }))}\n]`;
  assert.equal(parseVehInv(js).length, 2);
  assert.equal(parseVehInv("var Something=[]"), null);
  assert.equal(parseVehInv("var Vehicles=[{broken"), null);
  assert.equal(parseVehInv(undefined), null);
});

test("the whole card comes out of one record, condition from the machine token", () => {
  const v = dealerSpikeCacheVehicle(rec(), ORIGIN);
  assert.equal(v.vehicleIdentificationNumber, "1HTEDTAR3VS419399");
  assert.equal(v.brand, "International");
  assert.equal(v.vehicleModelDate, "2027");
  assert.equal(v.itemCondition, "new");
  assert.equal(dealerSpikeCacheVehicle(rec({ type: "U" }), ORIGIN).itemCondition, "used");
  assert.equal(dealerSpikeCacheVehicle(rec({ type: "" }), ORIGIN).itemCondition, undefined);
  assert.equal(v.mileageFromOdometer.value, 754);
  assert.equal(v.offers.price, 131995);
  assert.equal(v.offers.priceProvenance, DEALERSPIKE_CACHE_PRICE);
  assert.equal(v.offers.url, `${ORIGIN}/default.asp?page=xInventoryDetail&id=18999261`);
  assert.match(v.image[0], /^https:\/\/cdn\.dealerspike\.com\/imglib\/v1\/640x480\/imglib\/Assets\/Inventory\/C1\/F9\//);
});

test("fuel letters are the vendor's own map, and only mapped letters speak", () => {
  assert.equal(dealerSpikeCacheVehicle(rec(), ORIGIN).fuelType, "Diesel");
  const e = dealerSpikeCacheVehicle(rec({ ft: "E" }), ORIGIN);
  assert.equal(e.fuelType, "Electric");
  assert.equal(classifyEv(e).kind, "BEV");
  assert.equal(classifyEv(e).confidence, "high");
  assert.equal(dealerSpikeCacheVehicle(rec({ ft: "" }), ORIGIN).fuelType, undefined);
  assert.equal(dealerSpikeCacheVehicle(rec({ ft: "Z" }), ORIGIN).fuelType, undefined);
  // Diesel is not an EV.
  assert.equal(classifyEv(dealerSpikeCacheVehicle(rec(), ORIGIN)).isEv, false);
});

test("price 0 is the platform's no-price state; an unobserved ladder abstains", () => {
  assert.equal(dealerSpikeCacheVehicle(rec({ price: "0" }), ORIGIN).offers.price, undefined);
  // sale_price and discount_price were "0"/"" on all 120 records seen; a
  // record where one carries a DIFFERENT figure is a shape nobody has
  // characterised, so no price at all.
  assert.equal(dealerSpikeCacheVehicle(rec({ sale_price: "119995" }), ORIGIN).offers.price, undefined);
  assert.equal(dealerSpikeCacheVehicle(rec({ discount_price: "129995" }), ORIGIN).offers.price, undefined);
  // Equal figures are the same number said twice, not a ladder.
  assert.equal(dealerSpikeCacheVehicle(rec({ sale_price: "131995" }), ORIGIN).offers.price, 131995);
});

test("junk in, nothing out", () => {
  assert.equal(dealerSpikeCacheVehicle(rec({ vin: "NOTAVIN" }), ORIGIN), null);
  assert.equal(dealerSpikeCacheVehicle({}, ORIGIN), null);
});
