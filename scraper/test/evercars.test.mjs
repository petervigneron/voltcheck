import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isEverCars,
  isEverCarsOrigin,
  everCarsSrpUrl,
  flightPayload,
  everCarsSearchResult,
  everCarsIsLive,
  everCarsVehicle,
  everCarsVehicles,
} from "../lib/platforms/evercars.mjs";
import { fingerprint } from "../lib/fingerprint.mjs";
import { classifyEv } from "../lib/ev.mjs";
import { normalize } from "../lib/normalize.mjs";
import { publishedCondition } from "../lib/condition.mjs";
import { EVERCARS_PRICE } from "../lib/price-provenance.mjs";

const ORIGIN = "https://www.evercars.com";

// The live record shape, trimmed to the fields this reads. Taken from the
// server-rendered search block on www.evercars.com/cars, 2026-08-24.
const rec = (over = {}) => ({
  id: "4766",
  vin: "1FTVW1EL6PWG53923",
  make: "Ford",
  model: "F-150 Lightning",
  trim: "XLT",
  year: 2023,
  price: 43999,
  mileage: 16424,
  purchase_status: "AVAILABLE",
  is_pre_order: false,
  is_listing_new: false,
  monthly_payment: 651,
  featured_image_url: "https://static.production.evercars.live/images/vehicles/4766/b2.jfif",
  interior_image_url: "https://static.production.evercars.live/images/vehicles/4766/e2.jpg",
  city: "Costa Mesa",
  state: "CA",
  location: { id: 4, city: "Costa Mesa", state: "CA", zip_code: "92626", address_1: "3140 Pullman St" },
  ...over,
});

// One RSC chunk, escaped exactly the way the page ships it. The `18\\"` in
// top_features is the literal that broke a naive unescaper.
const page = (result) =>
  `<script>self.__next_f.push([1,${JSON.stringify(`0:{"search_results":${JSON.stringify(result)}}\n`)}])</script>`;

const result = (over = {}) => ({
  vehicles: [rec({ top_features: '18" Mach Black High Gloss Wheels;360 Degree Camera' })],
  total: 1130,
  page: 1,
  page_size: 250,
  has_more: true,
  ...over,
});

test("recognised by marks that contain its own host, and by the host itself", () => {
  assert.ok(isEverCars('{"@id":"https://www.evercars.com/#organization"}'));
  assert.ok(isEverCars('<img src="https://static.production.evercars.live/images/vehicles/1/a.jpg">'));
  assert.equal(isEverCars("<html>Ever Cars of Tulsa — evercarsok.com</html>"), false);
  assert.equal(isEverCars(undefined), false);
  assert.ok(isEverCarsOrigin("https://www.evercars.com"));
  assert.ok(isEverCarsOrigin("https://evercars.com/cars"));
  assert.equal(isEverCarsOrigin("https://evercars.com.evil.example"), false);
  assert.equal(fingerprint('"@id":"https://www.evercars.com/#website"'), "evercars");
});

test("the page size and page number ride in the site's own `f` parameter", () => {
  const u = new URL(everCarsSrpUrl(ORIGIN, { page: 3, pageSize: 250 }));
  assert.equal(u.pathname, "/cars");
  assert.deepEqual([...u.searchParams.keys()], ["f"]);
  assert.deepEqual(JSON.parse(u.searchParams.get("f")), { p: 3, ps: 250 });
  // Never /api — that path is robots-disallowed on this site and stays shut.
  assert.equal(u.pathname.startsWith("/api"), false);
});

test("the flight payload is unescaped as JSON, not by regex", () => {
  const html = page(result());
  assert.match(flightPayload(html), /"search_results":/);
  const parsed = everCarsSearchResult(html);
  assert.equal(parsed.total, 1130);
  assert.equal(parsed.has_more, true);
  assert.equal(parsed.vehicles.length, 1);
  // The quote inside the value survived intact — a `\\"` replace loses it.
  assert.match(parsed.vehicles[0].top_features, /18" Mach Black/);
});

test("the empty initial query state never wins over the filled one", () => {
  const html =
    page({ vehicles: [], total: 0, page: 1, page_size: 32, has_more: false }) + page(result());
  const parsed = everCarsSearchResult(html);
  assert.equal(parsed.vehicles.length, 1);
  assert.equal(parsed.total, 1130);
  assert.equal(everCarsSearchResult("<html>no payload here</html>"), null);
});

test("reads the whole car out of one record", () => {
  const v = everCarsVehicle(rec(), ORIGIN);
  assert.equal(v.vehicleIdentificationNumber, "1FTVW1EL6PWG53923");
  assert.equal(v.vehicleModelDate, "2023");
  assert.equal(v.brand, "Ford");
  assert.equal(v.model, "F-150 Lightning");
  assert.equal(v.vehicleConfiguration, "XLT");
  assert.equal(v.mileageFromOdometer.value, 16424);
  assert.equal(v.offers.price, 43999);
  assert.equal(v.offers.priceProvenance, EVERCARS_PRICE);
  assert.equal(v.offers.url, "https://www.evercars.com/cars/1FTVW1EL6PWG53923");
  assert.equal(v.offers.seller.address.postalCode, "92626");
  assert.equal(v.image.length, 2);
  // The financing estimate that sits beside the price is never a price.
  assert.notEqual(v.offers.price, 651);
});

test("a reserved car is in the payload and must not reach the site", () => {
  assert.equal(everCarsIsLive(rec()), true);
  // PURCHASE_IN_PROGRESS renders a "Reserved" chip and "Get notified if it
  // becomes available" where the buy path would be — 474 of 1,130 on
  // 2026-08-24, and the site counts every one of them.
  assert.equal(everCarsIsLive(rec({ purchase_status: "PURCHASE_IN_PROGRESS" })), false);
  assert.equal(everCarsIsLive(rec({ purchase_status: undefined })), false);
  const out = everCarsVehicles(
    page(result({ vehicles: [rec(), rec({ vin: "5YJ3E1EA1RF811777", purchase_status: "PURCHASE_IN_PROGRESS" })] })),
    ORIGIN,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].vehicleIdentificationNumber, "1FTVW1EL6PWG53923");
});

test("a pre-order car keeps its price and loses its stock render", () => {
  const v = everCarsVehicle(rec({ is_pre_order: true, interior_image_url: undefined }), ORIGIN);
  // It is a real used car with a real ask and a real odometer — it belongs in
  // the feed.
  assert.equal(v.offers.price, 43999);
  assert.equal(v.mileageFromOdometer.value, 16424);
  // But the photo is a manufacturer press shot, and a photo on a listing is a
  // claim about that car.
  assert.equal(v.image, undefined);
});

test("photos are pinned to the platform's own asset host", () => {
  const v = everCarsVehicle(rec({ featured_image_url: "https://evil.example/a.jpg", interior_image_url: "/b.jpg" }), ORIGIN);
  assert.equal(v.image, undefined);
});

test("classifies on the nameplate alone, and claims no condition", () => {
  const v = everCarsVehicle(rec(), ORIGIN);
  // No fuel field exists on this platform, so nothing is asserted for
  // classifyEv to take as the dealer's word.
  assert.equal(v.fuelType, undefined);
  const cls = classifyEv(v);
  assert.equal(cls.isEv, true);
  assert.equal(cls.confidence, "name_match");
  const r = normalize(v, { sourceUrl: v.offers.url, dealerDomain: "evercars.com" });
  assert.equal(r.priceUsd, 43999);
  assert.equal(r.priceProvenance, EVERCARS_PRICE);
  assert.equal(r.city, "Costa Mesa");
  assert.equal(r.state, "CA");
  assert.equal(r.condition, undefined);
  assert.equal(publishedCondition({ condition: r.condition, sourceUrl: r.sourceUrl }), undefined);
  // "Ever Certified" is the retailer's own inspection badge, not a
  // manufacturer CPO warranty, so nothing here ever sets it.
  assert.equal(v.certified, undefined);
});

test("junk in, nothing out", () => {
  assert.equal(everCarsVehicle({ vin: "NOTAVIN" }, ORIGIN), null);
  assert.equal(everCarsVehicle({}, ORIGIN), null);
  assert.equal(everCarsVehicles("<html>nothing</html>", ORIGIN), null);
  assert.equal(flightPayload(undefined), "");
});
