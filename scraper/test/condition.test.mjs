// From scraper/:  node --test "test/*.test.mjs"
//
// The condition a listing publishes, across the two platform API extractors
// that are ~87% of the working registry. Both used to end in "used" — an
// else-branch, not a reading — so a card whose condition field was absent, or
// spelled in a language other than English, asserted "used" on a listing
// surface from no evidence. The Spanish case is not hypothetical:
// es.fordofkendall.com serves VehicleCondition "Nuevo" on its 678-car new lot
// and published every one of them, 34 EVs among them, as used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { conditionToken, publishedCondition } from "../lib/condition.mjs";
import { vehicleNode } from "../lib/platforms/dealeron-api.mjs";
import { mapRecord } from "../lib/platforms/dealercom-api.mjs";

const ORIGIN = "https://es.fordofkendall.com";
const VIN_NEW = "3FMTK1R48TMA08718";
const VIN_USED = "3FMTK1R41PMB07239";

// ── the token table ───────────────────────────────────────────────────────

test("every display string seen live in a 171-rooftop sample resolves", () => {
  // dealer.com, 115 rooftops / 5,509 records, 2026-08-22.
  assert.equal(conditionToken("New"), "new");
  assert.equal(conditionToken("Used"), "used");
  assert.equal(conditionToken("USED"), "used");
  assert.equal(conditionToken("Pre-Owned"), "used");
  assert.equal(conditionToken("Certified Pre-Owned"), "used");
  assert.equal(conditionToken("Certified Used"), "used");
  assert.equal(conditionToken("BMW Certified"), "used");
  assert.equal(conditionToken("Certified by Volvo"), "used");
  // DealerOn, 55 rooftops / 1,912 records, same day.
  assert.equal(conditionToken("Nuevo"), "new");
  assert.equal(conditionToken("Usado"), "used");
  // The machine tokens both platforms carry alongside them.
  assert.equal(conditionToken("new"), "new");
  assert.equal(conditionToken("used"), "used");
});

test("certified is a used car here — the warranty claim rides on the CPO flag", () => {
  // Not a third answer: dealeron.mjs's long-standing rule is that
  // certification comes from the feed's own flag, never from a marketing
  // string, because two rooftops stamp "cpo" on cars their own Product schema
  // calls used. ingest.mjs promotes the row from the flag.
  assert.equal(conditionToken("Certified Pre-Owned"), "used");
  assert.equal(conditionToken("Certificado"), "used");
});

test("seminuevo is a used car, not a nuevo one", () => {
  assert.equal(conditionToken("Seminuevo"), "used");
  assert.equal(conditionToken("seminuevos"), "used");
});

test("a value that says nothing returns nothing, rather than 'used'", () => {
  assert.equal(conditionToken(""), undefined);
  assert.equal(conditionToken("   "), undefined);
  assert.equal(conditionToken(undefined), undefined);
  assert.equal(conditionToken(null), undefined);
  // An availability status is not a condition, and must not be read as one.
  assert.equal(conditionToken("In Stock"), undefined);
  assert.equal(conditionToken("Available"), undefined);
});

// ── DealerOn ──────────────────────────────────────────────────────────────

const card = (over) => ({
  VehicleVin: VIN_NEW,
  VehicleYear: 2026,
  VehicleMake: "Ford",
  VehicleModel: "Mustang Mach-E",
  VehicleTrim: "Select",
  VehicleFuelType: "Electric Fuel System",
  ...over,
});

test("DealerOn: a Spanish new lot is new, not used (es.fordofkendall.com, live)", () => {
  // The exact record shape that rooftop serves: the machine token is English
  // and correct, the display string is Spanish. Reading the display string
  // first is what published 34 EVs as used.
  const n = vehicleNode(card({ VehicleCondition: "Nuevo", VehicleType: "new", VehicleCpo: false }), ORIGIN);
  assert.equal(n.itemCondition, "new");
});

test("DealerOn: the same rooftop's Spanish used lot stays used", () => {
  const n = vehicleNode(
    card({ VehicleVin: VIN_USED, VehicleCondition: "Usado", VehicleType: "used", VehicleMileage: 24118 }),
    ORIGIN
  );
  assert.equal(n.itemCondition, "used");
});

test("DealerOn: a card that states no condition publishes none", () => {
  const n = vehicleNode(card({}), ORIGIN);
  assert.equal("itemCondition" in n, false);
  assert.equal(n.itemCondition, undefined);
});

test("DealerOn: certification still comes only from the CPO flag", () => {
  const n = vehicleNode(card({ VehicleCondition: "Certified Pre-Owned", VehicleType: "used", VehicleCpo: true }), ORIGIN);
  assert.equal(n.itemCondition, "used");
  assert.equal(n.certified, true);
});

// ── dealer.com ────────────────────────────────────────────────────────────

const rec = (over) => ({
  vin: "YV4EK3ZK3T2614407",
  year: 2026,
  make: "Volvo",
  model: "EX30",
  trim: "Twin Motor Plus",
  fuelType: "Electric",
  link: "/commercial-used/Volvo/2026-Volvo-EX30-0c67194.htm",
  ...over,
});

test("dealer.com: the machine token decides, whatever the storefront prints", () => {
  assert.equal(mapRecord(rec({ type: "new", condition: "New" }), {}, ORIGIN).node.itemCondition, "new");
  assert.equal(mapRecord(rec({ type: "used", condition: "Certified by Volvo", certified: true }), {}, ORIGIN).node.itemCondition, "used");
  // A rooftop serving a Spanish storefront: display Spanish, token English.
  assert.equal(mapRecord(rec({ type: "new", condition: "Nuevo" }), {}, ORIGIN).node.itemCondition, "new");
});

test("dealer.com: a record that states no condition publishes none", () => {
  const { node, ddc } = mapRecord(rec({}), {}, ORIGIN);
  assert.equal("itemCondition" in node, false);
  // enrichFromDdc reads `d.newOrUsed ?? rec.condition`, so this has to be
  // undefined rather than a string, or the fallthrough asserts for it.
  assert.equal(ddc.newOrUsed, undefined);
});

test("dealer.com: a stated condition still reaches the DDC shape the resolver reads", () => {
  assert.equal(mapRecord(rec({ type: "new", condition: "New" }), {}, ORIGIN).ddc.newOrUsed, "new");
  assert.equal(mapRecord(rec({ type: "used", condition: "Used" }), {}, ORIGIN).ddc.newOrUsed, "used");
});

test("dealer.com: a dealer's own 'used' on a current-year car is reported, not overruled", () => {
  // volvocarsbrooklyn.com files 29 fleet EX30s under condition "Used",
  // type "used", classification "fleet", URL /commercial-used/, with no
  // odometer and a 2025/2026 model year. Every layer of the source says used.
  // The model-year-versus-odometer smell is real and it is still not ours to
  // act on: overruling the seller's own statement would be the same class of
  // error, pointed the other way.
  const { node } = mapRecord(rec({ type: "used", condition: "Used", certified: false }), {}, ORIGIN);
  assert.equal(node.itemCondition, "used");
  assert.equal(node.mileageFromOdometer, undefined);
});

// ── the published answer: flag, then feed, then URL ───────────────────────

test("the CPO flag outranks everything, as it always has", () => {
  assert.equal(publishedCondition({ certified: true, condition: "used", sourceUrl: "https://x.com/used/1" }), "certified");
});

test("a Spanish VDP path answers when the feed didn't", () => {
  // The HTML fallback path has no machine token to read, so the slug is the
  // last signal standing. es.fordofkendall.com's split is exact.
  const nuevo = "https://es.fordofkendall.com/nuevo-Kendall-2026-Ford-Mustang+Mach+E-Select-3FMTK1R48TMA08718";
  const semi = "https://es.fordofkendall.com/seminuevo-Kendall-2023-Ford-Mustang+Mach+E-GT-3FMTK4SX1PMA65340";
  assert.equal(publishedCondition({ sourceUrl: nuevo }), "new");
  assert.equal(publishedCondition({ sourceUrl: semi }), "used");
});

test("seminuevo is never read as nuevo, whichever way the tests are ordered", () => {
  assert.equal(publishedCondition({ condition: "seminuevo", sourceUrl: "https://x.com/seminuevo-1" }), "used");
});

test("the English paths and words still land where they did", () => {
  assert.equal(publishedCondition({ sourceUrl: "https://x.com/new-inventory/index.htm" }), "new");
  assert.equal(publishedCondition({ sourceUrl: "https://x.com/used-inventory/index.htm" }), "used");
  assert.equal(publishedCondition({ condition: "new" }), "new");
  assert.equal(publishedCondition({ condition: "used" }), "used");
  // volvocarsbrooklyn.com's fleet bucket: the seller says used at every layer.
  assert.equal(publishedCondition({ condition: "used", sourceUrl: "https://volvocarsbrooklyn.com/commercial-used/Volvo/2026-Volvo-EX30-0c67.htm" }), "used");
});

test("nothing stated anywhere publishes nothing", () => {
  assert.equal(publishedCondition({ sourceUrl: "https://x.com/vehicle/12345" }), undefined);
  assert.equal(publishedCondition({}), undefined);
  assert.equal(publishedCondition(), undefined);
});
