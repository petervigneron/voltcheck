import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isVehica,
  vehicaVin,
  vehicaPrice,
  vehicaMileage,
  vehicaImages,
  vehicaTaxonomyNames,
  vehicaTaxonomyRoles,
  vehicaIsLive,
  vehicaVehicle,
} from "../lib/platforms/vehica.mjs";
import { fingerprint } from "../lib/fingerprint.mjs";
import { classifyEv } from "../lib/ev.mjs";
import { normalize } from "../lib/normalize.mjs";
import { VEHICA_PRICE } from "../lib/price-provenance.mjs";

const ORIGIN = "https://www.getusedtesla.com";

// The live shapes, from getusedtesla.com's /wp-json/wp/v2/{taxonomies,cars},
// 2026-08-24. The numeric field ids are per-install on purpose — nothing in
// the extractor may depend on these particular numbers.
const TAXONOMIES = {
  category: { name: "Categories", types: ["post"] },
  vehica_18710: { name: "Offer Type", types: ["vehica_car"] },
  vehica_6659: { name: "Make", types: ["vehica_car"] },
  vehica_6660: { name: "Model", types: ["vehica_car"] },
  vehica_17429: { name: "Year", types: ["vehica_car"] },
  vehica_6666: { name: "Color", types: ["vehica_car"] },
  vehica_17425: { name: "Battery", types: ["vehica_car"] },
  vehica_6654: { name: "Condition", types: ["vehica_car"] },
};

const TERMS = new Map([
  ["vehica_18710", new Map([[2501, "SOLD"], [2502, "ACTIVE"], [2503, "PENDING"]])],
  ["vehica_6659", new Map([[2454, "Tesla"]])],
  ["vehica_6660", new Map([[2458, "Model Y"]])],
  ["vehica_17429", new Map([[2504, "2021"]])],
  ["vehica_6666", new Map([[2328, "White"]])],
  ["vehica_17425", new Map([[2460, "Long Range AWD"]])],
  ["vehica_6654", new Map([[2073, "Excellent"]])],
]);

const roles = () => vehicaTaxonomyRoles(vehicaTaxonomyNames(TAXONOMIES), TERMS);

const rec = (over = {}) => ({
  id: 25757,
  status: "publish",
  link: "https://www.getusedtesla.com/tesla/25757/",
  title: { rendered: "2021 Tesla Model Y Long Range AWD" },
  vehica_18710: [],
  vehica_6659: [2454],
  vehica_6660: [2458],
  vehica_17429: [2504],
  vehica_6666: [2328],
  vehica_17425: [2460],
  vehica_6654: [2073],
  vehica_6664: "69442",
  vehica_6671: "5YJYGDEE1MF087036",
  vehica_17574: { vehica_currency_17574_2316: 26900 },
  vehica_6673: [
    "https://www.getusedtesla.com/wp-content/uploads/2026/08/a.jpg",
    "https://www.getusedtesla.com/wp-content/uploads/2026/08/b.jpg",
  ],
  vehica_16721: "",
  ...over,
});

test("fingerprinted on the theme's own asset paths, not the brand word", () => {
  assert.ok(isVehica('<link href="/wp-content/themes/vehica/style.css">'));
  assert.ok(isVehica("<script src='/wp-content/plugins/vehica-core/app.js'>"));
  assert.equal(isVehica("<html>Vehica Auto Group of Boise</html>"), false);
  assert.equal(isVehica(undefined), false);
  assert.equal(fingerprint('src="/wp-content/plugins/vehica-core/a.js"'), "vehica");
});

test("taxonomies are resolved by the platform's own published names", () => {
  const names = vehicaTaxonomyNames(TAXONOMIES);
  // Only the car post type's taxonomies — WordPress's own Categories is not one.
  assert.equal(names.has("category"), false);
  assert.equal(names.get("vehica_6659"), "Make");
  const r = roles();
  assert.equal(r.make.slug, "vehica_6659");
  assert.equal(r.model.slug, "vehica_6660");
  assert.equal(r.year.slug, "vehica_17429");
  assert.equal(r.offer.slug, "vehica_18710");
  assert.equal(r.condition.slug, "vehica_6654");
});

test("VIN, price and mileage are found by shape, never by a pinned field id", () => {
  assert.equal(vehicaVin(rec()), "5YJYGDEE1MF087036");
  assert.equal(vehicaPrice(rec()), 26900);
  assert.equal(vehicaMileage(rec()), 69442);
  // The same record with completely different field numbers still reads.
  const renumbered = {
    status: "publish",
    vehica_1: "5YJYGDEE1MF087036",
    vehica_2: "12345",
    vehica_3: { vehica_currency_3_9: 31000 },
  };
  assert.equal(vehicaVin(renumbered), "5YJYGDEE1MF087036");
  assert.equal(vehicaMileage(renumbered), 12345);
  assert.equal(vehicaPrice(renumbered), 31000);
});

test("two candidates for a field is an abstention, not a coin flip", () => {
  // Two currency fields: which one is the ask? Unknown, so no price.
  assert.equal(
    vehicaPrice(rec({ vehica_9999: { vehica_currency_9999_1: 24500 } })),
    undefined,
  );
  // Two plain integers: which one is the odometer? Unknown, so no mileage.
  assert.equal(vehicaMileage(rec({ vehica_16721: "2021" })), undefined);
  // Two VIN-shaped fields: no VIN, so the row never ships.
  assert.equal(vehicaVin(rec({ vehica_9998: "7SAYGDEE7TF529593" })), undefined);
});

test("photos are pinned to the rooftop's own origin", () => {
  assert.equal(vehicaImages(rec(), ORIGIN).length, 2);
  assert.deepEqual(
    vehicaImages(rec({ vehica_6673: ["https://evil.example/a.jpg"] }), ORIGIN),
    [],
  );
  assert.deepEqual(vehicaImages(rec(), "not a url"), []);
});

test("a SOLD car is in the feed, is on the site, and must not reach ours", () => {
  const r = roles();
  assert.equal(vehicaIsLive(rec(), r), true);
  assert.equal(vehicaIsLive(rec({ vehica_18710: [2502] }), r), true); // ACTIVE
  assert.equal(vehicaIsLive(rec({ vehica_18710: [2501] }), r), false); // SOLD
  // PENDING is not a car we will claim is for sale — the rule is positive.
  assert.equal(vehicaIsLive(rec({ vehica_18710: [2503] }), r), false);
  assert.equal(vehicaIsLive(rec({ status: "draft" }), r), false);
});

test("reads the whole car, and refuses a quality grade as a condition", () => {
  const v = vehicaVehicle(rec(), ORIGIN, roles());
  assert.equal(v.vehicleIdentificationNumber, "5YJYGDEE1MF087036");
  assert.equal(v.brand, "Tesla");
  assert.equal(v.model, "Model Y");
  assert.equal(v.vehicleModelDate, "2021");
  assert.equal(v.vehicleConfiguration, "Long Range AWD");
  assert.equal(v.color, "White");
  assert.equal(v.mileageFromOdometer.value, 69442);
  assert.equal(v.offers.price, 26900);
  assert.equal(v.offers.priceProvenance, VEHICA_PRICE);
  assert.equal(v.offers.url, "https://www.getusedtesla.com/tesla/25757/");
  // The Condition taxonomy says "Excellent" — a quality grade, not a
  // new/used token, so it becomes no condition claim at all.
  assert.equal(v.itemCondition, undefined);
  // A rooftop that DOES use the field for a real token reaches the right answer.
  const terms = new Map(TERMS);
  terms.set("vehica_6654", new Map([[2073, "Used"]]));
  const withCond = vehicaVehicle(rec(), ORIGIN, vehicaTaxonomyRoles(vehicaTaxonomyNames(TAXONOMIES), terms));
  assert.equal(withCond.itemCondition, "used");
});

test("an EV record classifies and normalizes", () => {
  const v = vehicaVehicle(rec(), ORIGIN, roles());
  assert.deepEqual(classifyEv(v), { isEv: true, kind: "BEV", confidence: "high" });
  const r = normalize(v, { sourceUrl: v.offers.url, dealerDomain: "getusedtesla.com" });
  assert.equal(r.vin, "5YJYGDEE1MF087036");
  assert.equal(r.priceUsd, 26900);
  assert.equal(r.priceProvenance, VEHICA_PRICE);
  assert.equal(r.mileage, 69442);
  assert.equal(r.images.length, 2);
});

test("junk in, nothing out", () => {
  assert.equal(vehicaVehicle({ status: "publish" }, ORIGIN, roles()), null);
  assert.equal(vehicaVehicle({}, ORIGIN, {}), null);
  assert.equal(vehicaVin(null), undefined);
  assert.equal(vehicaPrice(null), undefined);
  // No taxonomies at all: the post title still names the car.
  const bare = vehicaVehicle(rec(), ORIGIN, {});
  assert.equal(bare.name, "2021 Tesla Model Y Long Range AWD");
  assert.equal(bare.brand, undefined);
});
