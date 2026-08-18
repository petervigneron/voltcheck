// node --test scraper/test/ev.test.mjs
//
// The VINs here are rows from the 2026-08-16 crawl, not invented examples,
// and the vPIC decodes quoted in the comments were taken 2026-08-18.
import test from "node:test";
import assert from "node:assert/strict";
import { classifyEv, EV_MODEL_RE, EV_ONLY_WMIS } from "../lib/ev.mjs";

test("the Polestar 1 is a plug-in hybrid and its WMI must not settle it", () => {
  // LPS carries both cars. The 1 is a 2.0L petrol front axle plus a pack;
  // vPIC decodes this VIN FuelTypePrimary "Gasoline", ElectrificationLevel
  // "Strong HEV". Four of these reached the feed as high-confidence BEVs
  // while LPS was on the WMI list.
  assert.equal(EV_ONLY_WMIS.has("LPS"), false);
  const p1 = { vehicleIdentificationNumber: "LPSBE0YL8MB001098", name: "2021 Polestar 1", model: "1" };
  assert.deepEqual(classifyEv(p1), { isEv: false });
  // The nameplate path already declined it — "polestar [234]" omits the 1 —
  // and that must stay true, because it is now the only thing standing
  // between a Polestar 1 and the feed when a dealer types no fuel type.
  assert.equal(EV_MODEL_RE.test("2021 Polestar 1 Base"), false);
});

test("a dealer calling a Polestar 1 electric is held, not admitted", () => {
  // Bare "Electric" from a dealer's own data entry is still "high", by
  // design — but with LPS off the list vpic-enrich's fuelTextOnly() now
  // picks this row up (no EV-only WMI, no nameplate match) and vPIC refutes
  // it. That gate is what the WMI entry was skipping.
  const claimed = {
    vehicleIdentificationNumber: "LPSBE0YL8MB001098",
    fuelType: "Electric",
    name: "2021 Polestar 1",
    model: "1",
  };
  assert.deepEqual(classifyEv(claimed), { isEv: true, kind: "BEV", confidence: "high" });
  assert.equal(EV_ONLY_WMIS.has("LPSBE0YL8MB001098".slice(0, 3)), false);
  assert.equal(EV_MODEL_RE.test("2021 Polestar 1"), false);
});

test("the Polestar 2s that shared that WMI keep their claim by nameplate", () => {
  // Same block, a real BEV (vPIC: BEV, FuelTypePrimary "Electric"). It comes
  // back name_match rather than high, so ingest holds it until vPIC promotes
  // it — one decode, the same price the C40 and iX patterns pay.
  const p2 = {
    vehicleIdentificationNumber: "LPSED3KA2NL078778",
    name: "2022 Polestar 2 Long Range Dual Motor",
    model: "2",
  };
  assert.deepEqual(classifyEv(p2), { isEv: true, kind: "BEV?", confidence: "name_match" });
  // Dealers who file the model as the bare digit are covered by the name.
  // 56 YSM Polestar 2s and 6 Polestar 3s are in the feed on exactly this
  // path today, with no WMI support at all.
  assert.ok(EV_MODEL_RE.test("2024 Polestar 2 "));
  assert.ok(EV_MODEL_RE.test("2025 Polestar 3 "));
});

test("Polestar's newer WMIs are not on the list either", () => {
  // YSM/YSR/7SY are Polestar's per vPIC, and every nameplate on them is a
  // BEV today — but the list's promise is "skip the vPIC check", and this is
  // the make that has already run two powertrains through one block.
  for (const wmi of ["YSM", "YSR", "7SY"]) assert.equal(EV_ONLY_WMIS.has(wmi), false);
  // YSP was never a Polestar WMI: vPIC has no such assignment, Polestar's
  // manufacturer listing returns YSM/YSR/7SY only, and no VIN in the
  // 64,436-row snapshot begins with it.
  assert.equal(EV_ONLY_WMIS.has("YSP"), false);
});

test("the makes that do build only EVs still settle on the VIN alone", () => {
  const high = { isEv: true, kind: "BEV", confidence: "high" };
  // One live VIN per remaining block, so a bad edit to the set fails here.
  for (const vin of [
    "5YJ3E1EA7JF006588", // Tesla Model 3
    "7SAYGDEE9PF123456", // Tesla Model Y
    "7G2CEHED9RA012345", // Tesla Cybertruck
    "7FCTGAAA9NN001234", // Rivian R1T
    "7PDSGABA5PN012345", // Rivian R1S
    "50EA1FAA9NA001234", // Lucid Air
  ]) {
    assert.deepEqual(classifyEv({ vehicleIdentificationNumber: vin }), high, vin);
  }
});

test("a hybrid's fuel text is never read as electric", () => {
  assert.deepEqual(classifyEv({ fuelType: "Gas/Electric Hybrid", name: "2015 Toyota Prius Two" }), {
    isEv: false,
  });
  assert.deepEqual(classifyEv({ fuelType: "Plug-in Gas/Electric Hybrid", name: "2023 Jeep Wrangler 4xe" }), {
    isEv: true,
    kind: "PHEV",
    confidence: "high",
  });
});
