import { test } from "node:test";
import assert from "node:assert/strict";
import { toRecord, carlineKind, rowConfirms, conditionOf, modelFromTitle, cleanImage } from "../lib/oem/mazda.mjs";

// Fixtures are real records from mazdausa.com's /api/inv/search and
// /api/vehicles/model, trimmed to the fields this lane reads (swept
// 2026-08-23). The VINs are kept because every powertrain case below was
// settled against vPIC by VIN, and that is the argument for the carline gate.
const DEALER = { id: "10131", name: "DOUG'S LYNNWOOD MAZDA", city: "Edmonds", state: "WA", zip: "98026" };
const C9P = { code: "C9P", kind: "PHEV", model: "CX-90 PHEV" };
const M30 = { code: "M30", kind: "BEV", model: "MX-30 EV" };

const newPhev = {
  carlineName: "CX-90 PHEV",
  dealerId: "10131",
  detailUrl: "/shopping-tools/inventory/new/2026-mazda-cx-90-phev?vin=JM3KKCHA8T1389042",
  drivetrain: "AWD",
  engine: "2.5L e-SKYACTIV®-PHEV 4-Cyl",
  extColor: { description: "Rhodium White Premium" },
  intColor: { description: "Black Leather" },
  images: { vehicle: ["https://www.mazdausa.com:443/siteassets/vehicles/2025/x/phev.png"] },
  status: "In-transit",
  trimName: "PHEV Premium Sport",
  vin: "JM3KKCHA8T1389042",
  year: "2026",
  msrp: 58590,
};

const cpoPhev = {
  carlineName: "CX-90 PHEV PREMIUM",
  dealerId: "10131",
  detailUrl: "/shopping-tools/inventory/cpo/2024-mazda-cx-90-phev-premium?vin=JM3KKDHA2R1103233",
  drivetrain: null,
  engine: "2.5L E-SKYACTIV PHEV",
  extColor: { description: "PLATINUM QUARTZ METALLIC" },
  intColor: { description: "GRIEGE LEATHER" },
  images: { vehicle: ["https://mazda.assets.shiftdigitalinventory.com/images/JM3KKDHA2R1103233_1.jpg"] },
  trimName: "PR",
  vin: "JM3KKDHA2R1103233",
  year: "2024",
  cpoPrice: "34455",
  mileage: "36799",
};

test("a new plug-in row becomes a PHEV listing with the maker's MSRP", () => {
  const r = toRecord(newPhev, C9P, DEALER, "n");
  assert.equal(r.vin, "JM3KKCHA8T1389042");
  assert.equal(r.make, "Mazda");
  assert.equal(r.model, "CX-90 PHEV");
  assert.equal(r.trim, "PHEV Premium Sport");
  assert.equal(r.evKind, "PHEV");
  assert.equal(r.condition, "new");
  assert.equal(r.certified, undefined);
  assert.equal(r.priceUsd, 58590);
  assert.equal(r.priceProvenance, "oem-mazda-msrp");
  assert.equal(r.mileage, undefined, "a new car has no odometer to publish");
  assert.equal(r.state, "WA");
  assert.equal(r.dealerName, "Doug's Lynnwood Mazda");
  assert.equal(r.sourceUrl, `https://www.mazdausa.com${newPhev.detailUrl}`);
});

test("a certified row publishes the CPO price and the odometer, on its own tag", () => {
  const r = toRecord(cpoPhev, C9P, DEALER, "c");
  assert.equal(r.condition, "certified");
  assert.equal(r.certified, true);
  assert.equal(r.priceUsd, 34455);
  assert.equal(r.priceProvenance, "oem-mazda-cpo-price");
  assert.equal(r.mileage, 36799);
  // The certified feed mashes model and trim into carlineName and puts a bare
  // code in trimName; the model comes off, so the card does not print it twice.
  assert.equal(r.trim, "PREMIUM");
});

test("the new and certified prices can never pair into a price cut nobody made", () => {
  assert.notEqual(
    toRecord(newPhev, C9P, DEALER, "n").priceProvenance,
    toRecord(cpoPhev, C9P, DEALER, "c").priceProvenance
  );
});

test("cpoPrice \"Contact Dealer\" abstains instead of printing a number", () => {
  // 33 of 464 certified rows in the 2026-08-23 national sweep carry this
  // literal string where a price belongs.
  const r = toRecord({ ...cpoPhev, cpoPrice: "Contact Dealer" }, C9P, DEALER, "c");
  assert.equal(r.priceUsd, undefined, "the car still publishes");
  assert.equal(r.priceProvenance, undefined, "an abstain must not pair in price history");
});

test("a price under the year's junk floor is dropped, not printed", () => {
  // lib/price-floor.mjs: a 2024 certified car's floor is $7,000, so a $499
  // monthly payment in the price slot cannot become a false bargain.
  assert.equal(toRecord({ ...cpoPhev, cpoPrice: "499" }, C9P, DEALER, "c").priceUsd, undefined);
  assert.equal(toRecord({ ...newPhev, msrp: 12000 }, C9P, DEALER, "n").priceUsd, undefined);
});

test("carlineKind reads Mazda's own catalogue, not its marketing category", () => {
  // Real catalogue bodies, 2026-08-23.
  assert.equal(carlineKind({ carlineCode: "C9P", title: "MAZDA CX-90 PHEV", isEvModel: false }), "PHEV");
  assert.equal(carlineKind({ carlineCode: "C7P", title: "MAZDA CX-70 PHEV", isEvModel: false }), "PHEV");
  assert.equal(carlineKind({ carlineCode: "M30", title: "Mazda MX-30 EV", isEvModel: true }), "BEV");
  // The three that must never be claimed. vPIC on sampled VINs: CX-90 and
  // CX-70 decode "Mild HEV", the CX-50 Hybrid "Strong HEV" — and the site's
  // own nav files the CX-50 Hybrid under data-type="electrified", which is
  // exactly why the nav is not the gate.
  assert.equal(carlineKind({ carlineCode: "50H", title: "MAZDA CX-50 HYBRID", isEvModel: false }), undefined);
  assert.equal(carlineKind({ carlineCode: "C90", title: "MAZDA CX-90", isEvModel: false }), undefined);
  assert.equal(carlineKind({ carlineCode: "C70", title: "MAZDA CX-70", isEvModel: false }), undefined);
});

test("rowConfirms re-reads the car, so a drifted filter cannot publish a hybrid", () => {
  assert.equal(rowConfirms(newPhev, "PHEV"), true);
  assert.equal(rowConfirms({ carlineName: "CX-50 Hybrid", engine: "2.5L Hybrid SKYACTIV-G 4-cyl" }, "PHEV"), false);
  assert.equal(rowConfirms({ carlineName: "CX-90", engine: "3.3L e-SKYACTIV®-G Inline 6-Cyl" }, "PHEV"), false);
  // A row that says nothing about itself is dropped rather than assumed: 4 of
  // 20 CX-50 Hybrid rows sampled had both fields null.
  assert.equal(rowConfirms({ carlineName: null, engine: null }, "PHEV"), false);
  // "PHEV" must not read as a battery-electric claim through its own "EV".
  assert.equal(rowConfirms(newPhev, "BEV"), false);
  assert.equal(rowConfirms({ carlineName: "MX-30 EV PP FWD", engine: "E-SKYACTIV EV" }, "BEV"), true);
});

test("condition comes from Mazda's own URL slug and must agree with the lot", () => {
  assert.equal(conditionOf(newPhev, "n"), "new");
  assert.equal(conditionOf(cpoPhev, "c"), "certified");
  // A /cpo/ car returned by the new lot (or the reverse) is one Mazda field
  // contradicting another — the row drops rather than picking a side.
  assert.equal(conditionOf(cpoPhev, "n"), undefined);
  assert.equal(conditionOf(newPhev, "c"), undefined);
  assert.equal(conditionOf({ detailUrl: "/something/else" }, "n"), undefined);
  assert.equal(toRecord(cpoPhev, C9P, DEALER, "n"), null);
});

test("modelFromTitle normalises Mazda's shouting without losing the designation", () => {
  assert.equal(modelFromTitle("MAZDA CX-90 PHEV"), "CX-90 PHEV");
  assert.equal(modelFromTitle("MAZDA CX-70 PHEV"), "CX-70 PHEV");
  assert.equal(modelFromTitle("Mazda MX-30 EV"), "MX-30 EV");
});

test("the MX-30 keeps its battery-electric kind and its own fuel string", () => {
  const r = toRecord(
    { ...cpoPhev, carlineName: "MX-30 EV PP FWD", engine: "E-SKYACTIV EV", trimName: "PP", vin: "JM1DRADB1P0200162", year: "2023", cpoPrice: "19991" },
    M30, DEALER, "c"
  );
  assert.equal(r.evKind, "BEV");
  assert.equal(r.model, "MX-30 EV");
  assert.equal(r.trim, "PP FWD");
  assert.equal(r.fuelType, "Electric");
});

test("Mazda's own :443 asset URLs are repaired and foreign hosts pass through", () => {
  assert.equal(cleanImage("https://www.mazdausa.com:443/siteassets/a.png"), "https://www.mazdausa.com/siteassets/a.png");
  assert.equal(cleanImage("https://mazda.assets.shiftdigitalinventory.com/images/x_1.jpg"), "https://mazda.assets.shiftdigitalinventory.com/images/x_1.jpg");
  assert.equal(cleanImage("http://insecure.example/x.jpg"), undefined);
  assert.equal(toRecord(newPhev, C9P, DEALER, "n").imageUrl, "https://www.mazdausa.com/siteassets/vehicles/2025/x/phev.png");
});

test("a malformed VIN or an impossible year is not a listing", () => {
  assert.equal(toRecord({ ...newPhev, vin: "NOTAVIN" }, C9P, DEALER, "n"), null);
  assert.equal(toRecord({ ...newPhev, year: "1975" }, C9P, DEALER, "n"), null);
});
