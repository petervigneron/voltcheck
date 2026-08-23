import { test } from "node:test";
import assert from "node:assert/strict";
import { candidates, squash } from "../lib/dealer-names.mjs";

// Every case below is a real licensed-name → real registry-domain pair, so a
// failing test means the resolver has lost a dealer it used to reach, not
// that a made-up example changed shape.
const has = (name, city, state, want) =>
  assert.ok(candidates(name, city, state).includes(want),
    `${JSON.stringify(name)} should generate ${want}\n  got: ${candidates(name, city, state).join(" ")}`);

test("squash drops legal suffixes and punctuation", () => {
  // The apostrophe becomes a word break, not nothing — "stan s auto sales".
  // Stripping it instead was measured on the 7,432-pair benchmark and made
  // recall very slightly WORSE (69.03% → 68.96%), because contiguous word
  // joins already rebuild "stans" while the extra split gives the generator
  // a "stan" it would not otherwise try. Left as-is deliberately.
  assert.equal(squash("Stan's Auto Sales, LLC"), "stan s auto sales");
  assert.equal(squash("B & B Motors Inc."), "b and b motors");
  assert.equal(squash("Hudson Collision Center (Hudson)"), "hudson collision center");
});

// ── the transforms that were already there ──────────────────────────────────
test("plain name subsets", () => {
  has("Alan Webb Nissan", "Vancouver", "WA", "alanwebbnissan");
  has("Alan Webb Nissan", "Vancouver", "WA", "alanwebb");
});

test("brand abbreviations", () => {
  has("Volkswagen of Orchard Park", "Orchard Park", "NY", "vworchardpark");
  has("Chevrolet of Everett", "Everett", "WA", "chevyeverett");
});

test("'of' is kept as its own variant (the franchise naming convention)", () => {
  has("Toyota of Bay Ridge Brooklyn", "Brooklyn", "NY", "toyotaofbayridge");
  has("Volkswagen of Orchard Park", "Orchard Park", "NY", "vworchardpark");
});

// ── transforms added 2026-08-23, each measured on the registry's own pairs ──
test("the licensed name exactly as written, legal suffix included", () => {
  has("Stan's Auto Sales LLC", null, "WA", "stansautosalesllc");   // stansautosalesllc.com
  has("Certified Auto Brokers LLC", null, "NY", "certifiedautobrokersllc");
  has("Rickie's Auto LLC", null, "WA", "rickiesautollc");
});

test("the state the roll already knows, appended or prefixed", () => {
  has("Nile Auto Sales", null, "NC", "nileautosalesnc");           // nileautosalesnc.com
  has("Liberty Autoland Inc", null, "NY", "libertyautolandny");
  assert.ok(!candidates("Nile Auto Sales", null, null).includes("nileautosalesnc"),
    "no state, no state-suffixed candidate");
});

test("hyphenated two-word forms", () => {
  has("Concord Nissan", "Concord", "CA", "concord-nissan");        // concord-nissan.com
  has("Doherty Ford", null, "PA", "doherty-ford");
});

test("the brand word moves to either end of the name", () => {
  has("GENESIS OF PORTLAND", "Portland", "OR", "portlandgenesis"); // portlandgenesis.com
  has("KIA OF WARRENTON", "Warrenton", "VA", "warrentonkia");
  has("Audi Rochester", "Rochester", "NY", "rochesteraudi");
});

test("singular/plural drift on the whole name", () => {
  has("GREENLINE AUTO", null, "TX", "greenlineautos");             // greenlineautos.com
  has("Indy Auto Import", null, "IN", "indyautoimports");
});

// ── the shapes that were measured and deliberately NOT added ────────────────
// Each of these was tried against the 7,432-pair benchmark and rejected for
// costing far more candidates — i.e. more fetches against other people's
// servers — than the recall it bought. If a future change re-adds them, this
// test should be updated together with a fresh measurement, not deleted.
test("generic word-salad affixes stay out", () => {
  const c = candidates("Prime Motors", "Seattle", "WA");
  for (const junk of ["primemotorscars", "primemotorsonline", "primemotorsusa", "myprimemotors", "shopprimemotors"])
    assert.ok(!c.includes(junk), `${junk} should not be generated`);
});

test("candidate volume per name stays bounded", () => {
  // The whole cost model is candidates × 4 TLDs of DNS, then a polite fetch
  // for each that resolves. A long licensed name is the worst case.
  const c = candidates("Reedman Toll Chrysler Dodge Jeep Ram of Springfield", "Springfield", "PA");
  assert.ok(c.length <= 120, `long name generated ${c.length} candidates`);
  assert.ok(c.every((x) => x.length >= 4 && x.length <= 35));
});

test("a nameless roll row generates nothing", () => {
  assert.deepEqual(candidates("", "Seattle", "WA"), []);
  assert.deepEqual(candidates(null, null, null), []);
});
