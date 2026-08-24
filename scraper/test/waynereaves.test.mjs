import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isWayneReaves,
  wayneReavesFeedUrl,
  wayneReavesIsLive,
  wayneReavesPrice,
  wayneReavesVdpUrl,
  wayneReavesVehicle,
  wayneReavesVehicles,
} from "../lib/platforms/waynereaves.mjs";
import { classifyEv } from "../lib/ev.mjs";
import { normalize } from "../lib/normalize.mjs";
import { WAYNEREAVES_PRICE } from "../lib/price-provenance.mjs";

const ORIGIN = "https://suncoastqualitycars.com";

// The live record shape, trimmed to the fields this reads. Taken from
// suncoastqualitycars.com/service/inventory/website, 2026-08-23.
const rec = (over = {}) => ({
  id: "2321036",
  accountId: "1204",
  locationId: "1204",
  stockNo: "7051",
  vin: "5UXKR0C5XE0C26934",
  description: "2014 BMW X5 XDrive35i suv with 73k miles. Excellent condition.",
  year: 2014,
  make: "BMW",
  model: "X5",
  trim: "Xdrive35i",
  body: null,
  style: "4d SUV",
  interiorColor: "White",
  exteriorColor: "White",
  engine: "3.0l I6 Peizo INJ Dohc TC",
  transmission: "Automatic",
  driveTrain: "",
  fuel: "Gas",
  used: true,
  special: false,
  certified: false,
  forWeb: true,
  mileage: 73596,
  price: "14600.00",
  specialPrice: null,
  soldOn: null,
  deletedAt: null,
  accountNo: "35411",
  pictures: [
    { sortOrder: 2, url: "https://suncoastqualitycars.com/service/picture/35411/7051/bbb" },
    { sortOrder: 1, url: "https://suncoastqualitycars.com/service/picture/35411/7051/aaa" },
  ],
  ...over,
});

test("recognised only by the footer credit — every asset here is same-origin", () => {
  assert.ok(isWayneReaves('<a href="https://waynereaves.com/"><img alt="Wayne Reaves Automotive Dealer Websites"></a>'));
  assert.ok(isWayneReaves("<html>…waynereaves.net…</html>"));
  assert.equal(isWayneReaves("<html>Wayne's Auto Sales, Reaves Motors</html>"), false);
  assert.equal(isWayneReaves(undefined), false);
  assert.equal(wayneReavesFeedUrl("https://x.com/"), "https://x.com/service/inventory/website");
});

test("reads the whole car out of one feed record", () => {
  const v = wayneReavesVehicle(rec(), ORIGIN);
  assert.equal(v.vehicleIdentificationNumber, "5UXKR0C5XE0C26934");
  assert.equal(v.vehicleModelDate, "2014");
  assert.equal(v.brand, "BMW");
  assert.equal(v.model, "X5");
  assert.equal(v.vehicleConfiguration, "Xdrive35i");
  assert.equal(v.itemCondition, "used");
  assert.equal(v.mileageFromOdometer.value, 73596);
  assert.equal(v.bodyType, "4d SUV");
  assert.equal(v.sku, "7051");
  assert.equal(v.offers.price, 14600);
  assert.equal(v.offers.priceProvenance, WAYNEREAVES_PRICE);
  // Photos in the platform's own order, not the array's.
  assert.match(v.image[0], /aaa$/);
  assert.match(v.offers.url, /\/inventory\/35411\/view\/7051\//);
});

test("a sold car is in the feed and must not reach the site", () => {
  // 31 of 136 records across the six rooftops sampled carry soldOn — 27 of 28
  // on cawleymotorsports.com, whose own page stamps each of them SOLD.
  const feed = JSON.stringify([
    rec(),
    rec({ vin: "WP0CB29808U730748", stockNo: "267", soldOn: "2026-03-04" }),
    rec({ vin: "1G1JC5SH3D4202043", stockNo: "268", deletedAt: "2026-01-01" }),
    rec({ vin: "1C3CCBBB3DN550515", stockNo: "269", forWeb: false }),
  ]);
  const out = wayneReavesVehicles(feed, ORIGIN);
  assert.deepEqual(out.map((v) => v.vehicleIdentificationNumber), ["5UXKR0C5XE0C26934"]);
  assert.equal(wayneReavesIsLive(rec({ soldOn: "2026-03-04" })), false);
  assert.equal(wayneReavesIsLive(rec()), true);
});

test("condition is the machine boolean, and certified stays a separate claim", () => {
  assert.equal(wayneReavesVehicle(rec({ used: false }), ORIGIN).itemCondition, "new");
  assert.equal(wayneReavesVehicle(rec({ used: null }), ORIGIN).itemCondition, undefined);
  const cert = wayneReavesVehicle(rec({ certified: true }), ORIGIN);
  assert.equal(cert.itemCondition, "used", "a certified car is a used car");
  assert.equal(cert.certified, true);
});

test("price abstains on a ladder no rooftop has been seen to resolve", () => {
  assert.equal(wayneReavesPrice(rec()), 14600);
  // The one live special had specialPrice === price, so agreement is safe.
  assert.equal(wayneReavesPrice(rec({ special: true, specialPrice: "14600.00" })), 14600);
  // Disagreement is the case nobody has observed. Do not pick a rung.
  assert.equal(wayneReavesPrice(rec({ special: true, specialPrice: "12900.00" })), undefined);
  // "Contact Us" is stored as no price — a real state, not a parse failure.
  assert.equal(wayneReavesPrice(rec({ price: "0.00" })), undefined);
  assert.equal(wayneReavesPrice(rec({ price: null })), undefined);
  const v = wayneReavesVehicle(rec({ price: null }), ORIGIN);
  assert.equal(v.offers.price, undefined);
  assert.equal(v.offers.priceProvenance, undefined);
});

test("an EV record classifies and normalizes", () => {
  const ev = rec({
    vin: "5YJ3E1EB2KF510708",
    year: 2019,
    make: "Tesla",
    model: "Model 3",
    trim: "Long Range",
    fuel: "Electric",
    engine: "Electric",
    price: "23500.00",
  });
  const v = wayneReavesVehicle(ev, ORIGIN);
  assert.equal(classifyEv(v).isEv, true);
  const n = normalize(v, { sourceUrl: ORIGIN, dealerDomain: "suncoastqualitycars.com" });
  assert.equal(n.vin, "5YJ3E1EB2KF510708");
  assert.equal(n.priceUsd, 23500);
  assert.equal(n.priceProvenance, WAYNEREAVES_PRICE);
  assert.equal(n.mileage, 73596);
});

test("junk in, nothing out", () => {
  assert.equal(wayneReavesVehicles("<!doctype html>", ORIGIN), null);
  assert.equal(wayneReavesVehicles('{"error":"nope"}', ORIGIN), null);
  assert.deepEqual(wayneReavesVehicles("[]", ORIGIN), []);
  assert.equal(wayneReavesVehicle(rec({ vin: "TOOSHORT" }), ORIGIN), null);
  assert.equal(wayneReavesVdpUrl(rec({ accountNo: null, accountId: null }), ORIGIN), undefined);
  // Duplicate VINs collapse rather than becoming two listings.
  const dup = JSON.stringify([rec(), rec({ stockNo: "7052" })]);
  assert.equal(wayneReavesVehicles(dup, ORIGIN).length, 1);
});
