import { test } from "node:test";
import assert from "node:assert/strict";
import { toRecord, modelKind, rowConfirms, vdpUrl } from "../lib/oem/mitsubishi.mjs";

// Fixtures are real records from clickshop.mitsubishicars.com's AutoFi BFF,
// trimmed to the fields this lane reads (swept 2026-08-23). The VINs are kept
// because each powertrain case was settled against vPIC by VIN.
const DEALER = { name: "CHERRY HILL MITSUBISHI", city: "CHERRY HILL", state: "NJ", zip: "08002" };

const phev = {
  id: 9705375336,
  age: "new",
  bodyType: "SUV",
  dealerCode: "CAWD",
  dealerName: "CHERRY HILL MITSUBISHI",
  make: "Mitsubishi",
  model: "Outlander PHEV",
  trim: "BLACK EDITION S-AWC",
  year: 2026,
  vin: "JA4T5WA95TZ037201",
  mileage: 7,
  sellingPrice: 57105,
  msrp: 58395,
  fuelType: "Hybrid",
  engine: "4 Cyl",
  driveTrain: "AWD",
  color: "White",
  colorInterior: "Black",
  photoUrl: ["https://img.vast.com/7143137608724975842/1/640x480", "https://img.vast.com/7143137608724975842/2/640x480"],
};

test("an Outlander PHEV row becomes a PHEV listing on the dealer's selling price", () => {
  const r = toRecord(phev, "PHEV", DEALER);
  assert.equal(r.vin, "JA4T5WA95TZ037201");
  assert.equal(r.make, "Mitsubishi");
  assert.equal(r.model, "Outlander PHEV");
  assert.equal(r.trim, "BLACK EDITION S-AWC");
  assert.equal(r.evKind, "PHEV");
  assert.equal(r.condition, "new");
  assert.equal(r.priceUsd, 57105);
  assert.equal(r.priceProvenance, "oem-mitsubishi-selling-price");
  assert.equal(r.driveLine, "AWD");
  assert.equal(r.state, "NJ");
  assert.equal(r.city, "Cherry Hill");
  assert.equal(r.dealerName, "Cherry Hill Mitsubishi");
  assert.equal(r.imageUrl, phev.photoUrl[0]);
});

test("the price ladder tags the rung, so a car that moves rungs stays quiet", () => {
  const noSelling = toRecord({ ...phev, sellingPrice: null }, "PHEV", DEALER);
  assert.equal(noSelling.priceUsd, 58395);
  assert.equal(noSelling.priceProvenance, "oem-mitsubishi-msrp");
  assert.notEqual(noSelling.priceProvenance, toRecord(phev, "PHEV", DEALER).priceProvenance);
});

test("a number under the new-car junk floor is dropped, not printed", () => {
  // lib/price-floor.mjs: no new EV lists under $15,000, so a $599 payment in
  // the price slot cannot become a false bargain.
  const r = toRecord({ ...phev, sellingPrice: 599, msrp: null }, "PHEV", DEALER);
  assert.equal(r.priceUsd, undefined);
  assert.equal(r.priceProvenance, undefined);
});

test("modelKind reads Mitsubishi's own model facet", () => {
  assert.equal(modelKind("Outlander PHEV"), "PHEV");
  // The five that must never be claimed. vPIC on sampled VINs: the
  // conventional Outlander decodes "Mild HEV", the Eclipse Cross plain
  // Gasoline — both refuted by lib/ev.mjs, and neither returned by the
  // "Outlander PHEV" query.
  assert.equal(modelKind("Outlander"), undefined);
  assert.equal(modelKind("Outlander Sport"), undefined);
  assert.equal(modelKind("Eclipse Cross"), undefined);
  assert.equal(modelKind("Mirage"), undefined);
  assert.equal(modelKind("Mirage G4"), undefined);
  // Announced but not yet shipping; the lane picks it up without an edit.
  assert.equal(modelKind("Eclipse Sportback EV"), "BEV");
});

test("rowConfirms re-reads the car, and Mitsubishi's own fields must agree", () => {
  assert.equal(rowConfirms(phev, "PHEV"), true);
  // A drifted server-side filter must not publish a conventional Outlander.
  assert.equal(rowConfirms({ model: "Outlander", fuelType: "Gasoline" }, "PHEV"), false);
  // Two of the maker's own fields contradicting each other: the plug-in
  // nameplate with a bare petrol fuel string. Drop the car rather than pick
  // the field we like.
  assert.equal(rowConfirms({ model: "Outlander PHEV", fuelType: "Gasoline" }, "PHEV"), false);
  // "Hybrid" is not a plug-in claim, and it is not a refutation either — the
  // nameplate is what carries the claim here.
  assert.equal(rowConfirms({ model: "Outlander PHEV", fuelType: "Hybrid" }, "PHEV"), true);
  assert.equal(rowConfirms({ model: "", fuelType: "Hybrid" }, "PHEV"), false);
  // A plug-in must never fall through to the battery-electric branch.
  assert.equal(rowConfirms(phev, "BEV"), false);
});

test("condition is the feed's machine token, and an unknown one publishes nothing", () => {
  assert.equal(toRecord(phev, "PHEV", DEALER).condition, "new");
  // lib/condition.mjs returns undefined for a value it cannot stand behind,
  // and this lane drops the row rather than defaulting to a condition.
  assert.equal(toRecord({ ...phev, age: "" }, "PHEV", DEALER), null);
  assert.equal(toRecord({ ...phev, age: "aged-90-plus" }, "PHEV", DEALER), null);
});

test("a car with no resolved dealer keeps its name and carries no state", () => {
  const r = toRecord(phev, "PHEV", undefined);
  assert.equal(r.dealerName, "Cherry Hill Mitsubishi");
  assert.equal(r.state, undefined);
  assert.equal(r.city, undefined);
  assert.equal(r.zip, undefined);
});

test("the source URL is the store's own path, escaped", () => {
  assert.equal(
    vdpUrl(phev),
    "https://clickshop.mitsubishicars.com/vehicle/9705375336/new/2026/Mitsubishi/Outlander%20PHEV/BLACK%20EDITION%20S-AWC/JA4T5WA95TZ037201"
  );
  assert.equal(vdpUrl({ ...phev, id: null }), undefined);
  assert.equal(toRecord({ ...phev, id: null }, "PHEV", DEALER).sourceUrl, "https://clickshop.mitsubishicars.com/cars");
});

test("a malformed VIN or an impossible year is not a listing", () => {
  assert.equal(toRecord({ ...phev, vin: "NOTAVIN" }, "PHEV", DEALER), null);
  assert.equal(toRecord({ ...phev, year: 1975 }, "PHEV", DEALER), null);
});
