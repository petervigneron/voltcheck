import { test } from "node:test";
import assert from "node:assert/strict";
import { toRecord } from "../lib/oem/enterprise.mjs";

// The Enterprise lane used to filter server-side on the fuelTypeDescription
// facet, which is a bet that the merchant's own fuel field is right about
// which cars plug in. A DMS-fed retailer measured on 2026-09-05 files 16 of
// its 38 Grand Cherokee 4xe as "Gas" or "Flex Fuel", so that bet loses cars
// wherever it is wrong. The lane now walks every bucket; these tests pin the
// rule that decides what each bucket's rows are worth.
//
// Enterprise itself, measured the same day, files its plug-ins correctly —
// all 1,201 "4xe" docs sit in Hybrid and the fully-walked Gasoline (12,104),
// Diesel (46) and Flex (7) buckets hold nothing electrified. So the cars
// below are shaped like real Enterprise docs but the misfiled ones are the
// failure being guarded against, not a live reading.

const doc = ({ vin = "1C4RJXR62RW291874", year = 2024, make = "Jeep", model = "Wrangler 4xe", trim = "Rubicon 4x4", fuel = "Hybrid" } = {}) => ({
  salePrice: 39998,
  vehicle: {
    vin,
    specification: { year, makeDescription: make, modelDescription: model, trimDescription: trim, fuelTypeDescription: fuel, drivetrainDescription: "4WD" },
    odometer: { unit: "MILE", lastKnownValue: 31245 },
    physicalLocation: { postalCode: "63011" },
  },
});

const sweep = (facet, kind) => ({ facet, kind });

test("Electric bucket ships BEV on the merchant's own structured claim", () => {
  const r = toRecord(doc({ vin: "5YJ3E1EA8PF659302", make: "Tesla", model: "Model 3", trim: "Long Range", fuel: "Electric" }), sweep("Electric", "electric"), new Map());
  assert.equal(r.evKind, "BEV");
  assert.equal(r.evConfidence, "high");
});

test("Hybrid bucket keeps a plug-in wearing the maker's badge, at high confidence", () => {
  // Facet says electrified and Jeep's own "4xe" says it plugs in — two
  // sources, which is the standard a Lyriq's "Electric" already ships under.
  const r = toRecord(doc(), sweep("Hybrid", "hybrid"), new Map());
  assert.equal(r.evKind, "PHEV");
  assert.equal(r.evConfidence, "high");
});

test("Hybrid bucket still drops a conventional or mild hybrid", () => {
  // Every one of the 673 rows this gate dropped on 2026-09-05 was put to
  // vPIC, which called none of them a plug-in. These two are from that pile.
  const drops = new Map();
  assert.equal(toRecord(doc({ vin: "JTDKARFU0J3067890", make: "Toyota", model: "Prius", trim: "LE" }), sweep("Hybrid", "hybrid"), drops), null);
  assert.equal(toRecord(doc({ vin: "WA1EAAFY4P2012345", make: "Audi", model: "Q5", trim: "S line Premium 45 TFSI quattro" }), sweep("Hybrid", "hybrid"), drops), null);
  assert.equal([...drops.values()].reduce((a, b) => a + b, 0), 2);
});

test("a Pacifica whose trim leads Hybrid is the plug-in, and is kept", () => {
  const r = toRecord(doc({ vin: "2C4RC1N77PR612345", make: "Chrysler", model: "Pacifica", trim: "Hybrid Select" }), sweep("Hybrid", "hybrid"), new Map());
  assert.equal(r.evKind, "PHEV");
  assert.equal(r.evConfidence, "high");
});

// ── The reason the sweep was widened ───────────────────────────────────────

test("a 4xe misfiled under Gasoline is admitted, but only at name_match", () => {
  // This is the DriveTime failure arriving at Enterprise. The fuel field
  // actively denies the plug, so the nameplate is the only evidence and by
  // the house rule it never publishes alone: ingest.mjs holds evConfidence
  // "name_match" until vpic-enrich promotes it on an affirmative decode.
  const r = toRecord(doc({ model: "Grand Cherokee 4xe", trim: "Trailhawk", fuel: "Gasoline" }), sweep("Gasoline", "outside"), new Map());
  assert.equal(r.evKind, "PHEV");
  assert.equal(r.evConfidence, "name_match");
  // The merchant's own claim is kept rather than tidied away — it is the
  // disagreement vpic-enrich is being asked to settle.
  assert.equal(r.fuelType, "Gasoline");
});

test("a battery-electric nameplate misfiled under Flex is admitted at name_match", () => {
  const r = toRecord(doc({ vin: "5YJYGDEE6MF233625", make: "Tesla", model: "Model Y", trim: "Long Range", fuel: "Flex" }), sweep("Flex", "outside"), new Map());
  assert.equal(r.evKind, "BEV");
  assert.equal(r.evConfidence, "name_match");
});

test("an ordinary petrol car in a non-electrified bucket is refused", () => {
  // 12,157 of the 12,157 docs walked in Gasoline/Diesel/Flex on 2026-09-05
  // took this path. A widened sweep that admitted on the bucket alone would
  // have shipped every one of them.
  const drops = new Map();
  assert.equal(toRecord(doc({ vin: "1C4HJXDG5LW123456", model: "Wrangler Unlimited", trim: "Sport 4x4", fuel: "Gasoline" }), sweep("Gasoline", "outside"), drops), null);
  assert.equal(toRecord(doc({ vin: "2C4RC1BG9NR123456", make: "Chrysler", model: "Pacifica", trim: "Touring L", fuel: "Gasoline" }), sweep("Gasoline", "outside"), drops), null);
  assert.equal([...drops.values()].reduce((a, b) => a + b, 0), 2);
});

test("the structured guard still refuses a doc whose fuel value is not the one queried", () => {
  // The mapping drifting under us must not be read as a mislabeled car.
  assert.equal(toRecord(doc({ fuel: "Electric" }), sweep("Hybrid", "hybrid"), new Map()), null);
});

test("a misfiled row carries the same identity fields as a correctly filed one", () => {
  // Regression guard: the widening must not produce a second-class record
  // shape that ingest or the site would treat differently.
  const ok = toRecord(doc(), sweep("Hybrid", "hybrid"), new Map());
  const misfiled = toRecord(doc({ fuel: "Gasoline" }), sweep("Gasoline", "outside"), new Map());
  for (const f of ["vin", "year", "make", "model", "trim", "mileage", "zip", "state", "dealerDomain", "sourceUrl", "condition", "evKind"]) {
    assert.equal(misfiled[f], ok[f], `field ${f} differs between a correctly filed and a misfiled row`);
  }
  assert.equal(misfiled.priceUsd, ok.priceUsd);
});
