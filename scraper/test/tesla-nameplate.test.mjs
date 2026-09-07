import { test } from "node:test";
import assert from "node:assert/strict";
import { splitTeslaModel, teslaVersion } from "../lib/tesla-nameplate.mjs";

// Every string below was live on 2026-09-07 (the nightly enrichment audit's
// 09-06 failure: 121 new make/model gap groups, the bulk of them Teslas whose
// model field carried the version). Sources named where it matters.

const tesla = (model, extra = {}) => splitTeslaModel({ make: "Tesla", model, ...extra });

test("the version moves out of the model and into the trim, the drivetrain to driveLine", () => {
  assert.deepEqual(tesla("Model Y Long Range AWD"), { model: "Model Y", trim: "Long Range", driveLine: "AWD" });
  assert.deepEqual(tesla("Model S Plaid AWD"), { model: "Model S", trim: "Plaid", driveLine: "AWD" });
  assert.deepEqual(tesla("Model 3 Standard Range Plus RWD"), { model: "Model 3", trim: "Standard Range Plus", driveLine: "RWD" });
  assert.deepEqual(tesla("Model 3 Long Range"), { model: "Model 3", trim: "Long Range", driveLine: undefined });
  assert.deepEqual(tesla("Model Y Performance"), { model: "Model Y", trim: "Performance", driveLine: undefined });
  assert.deepEqual(tesla("Model X Long Range Plus AWD"), { model: "Model X", trim: "Long Range Plus", driveLine: "AWD" });
  assert.deepEqual(tesla("Model Y Premium RWD"), { model: "Model Y", trim: "Premium", driveLine: "RWD" });
  assert.deepEqual(tesla("Model 3 Performance Sedan AWD"), { model: "Model 3", trim: "Performance", driveLine: "AWD" });
});

test("a drivetrain alone is not a version: the model folds, the trim stays empty", () => {
  assert.deepEqual(tesla("Model X AWD"), { model: "Model X", trim: undefined, driveLine: "AWD" });
  assert.deepEqual(tesla("Model 3 RWD"), { model: "Model 3", trim: undefined, driveLine: "RWD" });
  assert.deepEqual(tesla("Model Y Dual Motor AWD"), { model: "Model Y", trim: undefined, driveLine: "AWD" });
});

test("Tesla's own 2018-19 pack names and dealer shorthands fold onto the corpus spelling", () => {
  assert.equal(tesla("Model 3 Mid Range Battery RWD").trim, "Mid Range");
  assert.equal(tesla("Model 3 Long Range Battery AWD").trim, "Long Range");
  assert.equal(tesla("MODEL 3 Standard Range Battery Plus RWD").trim, "Standard Range Plus");
  assert.equal(tesla("Model 3 Standard Plus").trim, "Standard Range Plus");
  assert.equal(tesla("Model 3 Standard Range").trim, "Standard Range");
  assert.equal(tesla("Model Y Standard").trim, "Standard");
});

test("Model S/X pack badges are versions, spaces and all", () => {
  assert.deepEqual(tesla("Model S P100D AWD"), { model: "Model S", trim: "P100D", driveLine: "AWD" });
  assert.deepEqual(tesla("Model X 100D"), { model: "Model X", trim: "100D", driveLine: undefined });
  assert.deepEqual(tesla("Model X 75D AWD"), { model: "Model X", trim: "75D", driveLine: "AWD" });
  assert.deepEqual(tesla("Model S 70 D"), { model: "Model S", trim: "70D", driveLine: undefined });
  assert.deepEqual(tesla("Model S 75 RWD"), { model: "Model S", trim: "75", driveLine: "RWD" });
  assert.equal(tesla("Model S P85+").trim, "P85+");
});

test("marketing text folds the model and claims no trim at all", () => {
  const cases = [
    "Model 3 2019 TESLA MODEL 3 AWD PERFORMANCE 1-OWNER 615-730-9991",
    "Model 3 2023 TESLA MODEL 3 4D SEDAN 1-OWNER GREAT-DEAL 615-730-9991",
    "Model S 2016 TESLA MODEL S AWD 75D FREE TESLA SUPERCHARGING 615-730-9991",
    "Model Y LongRange/AWD/AdaptiveCruise/LaneKeepAssist/AutoPilot",
    "Model Y 2021 Tesla Model Y Long Range - Rare 3rd Row Seat Option",
    "Model 3 **MODEL 3 PERFORMANCE AWD**",
    "Model Y **MODEL Y RWD**COMPUTER HARDWARE 4**WHITE INTERIOR**",
    "Model X *MODEL X PLAID 6 PASSENGERS*22\" WHEELS*WHITE INTERIOR*",
    "Model 3 Standard, EV, GLASS ROOF, PEARL WHITE,",
    "Model Y Full-Self Driving Capability",
    "Model Y AWD *Ltd Avail*",
  ];
  for (const s of cases) {
    const r = tesla(s);
    assert.equal(r.model, `Model ${s.match(/^Model (\w)/)[1]}`, s);
    assert.equal(r.trim, undefined, s);
  }
});

test("a version with a word this cannot vouch for beside it abstains rather than picking the word out", () => {
  // Palladium is Tesla's internal name for the 2021 S/X refresh, not a
  // version; "Long Range Palladium" is not "Long Range" plus noise, it is a
  // string this vocabulary does not know.
  assert.deepEqual(tesla("Model X Long Range Palladium"), { model: "Model X", trim: undefined, driveLine: undefined });
  assert.deepEqual(tesla("Model X LONG RANGE PALLADIUM"), { model: "Model X", trim: undefined, driveLine: undefined });
  assert.equal(tesla("Model Y Long Range Launch Series").trim, undefined);
  assert.equal(tesla("Model S Plaid Plus").trim, undefined);
});

test("the record's own trim: restated-model and blurb slots yield, a same-version slot is kept, a different version silences both", () => {
  // AutoManager's data-displaytrim restates the model in front of a feature
  // line (specialtiesauto.com, umcsales.com, 2026-09-07).
  assert.equal(tesla("Model 3 Long Range", { trim: "Model 3 Long Range | RWD | 0" }).trim, "Long Range");
  assert.equal(tesla("Model Y Long Range", { trim: "Model Y Long Range | FSD Capable w/ Acceleration Boost | AWD | 0" }).trim, "Long Range");
  // DealerFire's trim slot holding the dealer's feature blurb (austineautos.com).
  assert.equal(
    tesla("Model Y Long Range AWD", { trim: "*FULL SELF-DRIVING ENABLED, TRAFFIC AWARE CRUISE CONTROL, NAVIGATION, SURROUND VIEW CAMERAS" }).trim,
    "Long Range"
  );
  // A slot that already names the same version keeps the dealer's own words.
  assert.equal(tesla("Model Y Long Range AWD", { trim: "Long Range Sport Utility 4d Awd" }).trim, "Long Range Sport Utility 4d Awd");
  assert.equal(tesla("Model Y Long Range", { trim: "Long Range Launch Series" }).trim, "Long Range Launch Series");
  // Two versions named for one car: neither is claimed.
  assert.equal(tesla("Model 3 Long Range AWD", { trim: "Performance" }).trim, undefined);
  assert.equal(tesla("Model S P100D", { trim: "75D" }).trim, undefined);
});

test("a VIN whose nameplate letter disagrees with the string vetoes the fold", () => {
  const r = tesla("Model Y Long Range AWD", { vin: "5YJ3E1EA0MF921681" }); // a Model 3 VIN
  assert.deepEqual(r, { model: "Model Y Long Range AWD", trim: undefined, driveLine: undefined });
  // And the same VIN on the right nameplate folds as normal — Fremont (5YJ),
  // Austin (7SA) and Shanghai (LRW) all carry the letter in position 4.
  assert.equal(tesla("Model 3 Long Range AWD", { vin: "5YJ3E1EA0MF921681" }).model, "Model 3");
  assert.equal(tesla("Model Y Long Range AWD", { vin: "7SAYGDEE5PA123456" }).model, "Model Y");
  assert.equal(tesla("Model X Plaid AWD", { vin: "7SAXCBE66NF340375" }).model, "Model X");
});

test("everything that is not a variant-bearing Tesla model passes through byte-identical", () => {
  const same = (rec) => assert.deepEqual(splitTeslaModel(rec), { model: rec.model, trim: rec.trim, driveLine: rec.driveLine });
  same({ make: "Tesla", model: "Model 3", trim: "Long Range", driveLine: "RWD" });
  same({ make: "Tesla", model: "Model Y", trim: undefined, driveLine: undefined });
  same({ make: "Tesla", model: "Cybertruck Cyberbeast AWD" });
  same({ make: "Tesla", model: "Roadster" });
  same({ make: "Hyundai", model: "Ioniq 5 SEL Long Range AWD", trim: "SEL" });
  same({ make: "Tesla", model: undefined });
  same({ make: undefined, model: "Model 3 Long Range" });
  // An existing driveLine is the platform's own field and is never overwritten.
  assert.equal(tesla("Model Y Long Range AWD", { driveLine: "RWD" }).driveLine, "RWD");
});

test("teslaVersion on its own: whole-string match, never a substring", () => {
  assert.deepEqual(teslaVersion("Long Range AWD"), { trim: "Long Range", drive: "AWD" });
  assert.deepEqual(teslaVersion("AWD"), { drive: "AWD" });
  assert.deepEqual(teslaVersion(""), { drive: undefined });
  assert.equal(teslaVersion("Long Range Palladium").trim, undefined);
  assert.equal(teslaVersion("Performance tires").trim, undefined);
});
