import { test } from "node:test";
import assert from "node:assert/strict";
import { vpicTrim, isChassisCode, isGradeList, isDriveOnly, isJunkTrim } from "../lib/vpic-trim.mjs";

// Every string here is a real Series or Trim value from registry/vpic-cache.json
// (218k VINs, tallied 2026-09-10) or a vPIC decode taken that day.

test("the three ultimatems.com decodes: the junk Series is skipped and the Trim behind it is what the car gets", () => {
  // WP1AE2AY1KDA52205, 2019 Cayenne E-Hybrid
  assert.equal(vpicTrim({ Series: "Type 9YA", Trim: "S E-Hybrid" }, { make: "Porsche", model: "Cayenne" }), "S E-Hybrid");
  // YV4BR0CL6M1765232, 2021 XC90 T8
  assert.equal(vpicTrim({ Series: "FWD/eAWD (T8)", Trim: "Inscription" }, { make: "Volvo", model: "XC90 Plug-In Hybrid" }), "Inscription");
  // JN1DF0BB5PM709978, 2023 Ariya: the Trim is the whole grade list, so nothing
  assert.equal(vpicTrim({ Series: "", Trim: "ENGAGE/EVOLVE/EMPOWER" }, { make: "Nissan", model: "Ariya" }), "");
});

test("real trims pass, including the ones a careless pattern would catch", () => {
  const real = [
    "Tech-1",
    "Luxury 1SE",
    "Sport 1",
    "S E-Hybrid",
    "xDrive50i",
    "xDrive50e",
    "xDrive", // 900+ live BMWs carry this dealer-written; the feed's spelling of the AWD 550e/750e
    "4MATIC",
    "quattro",
    "e-tron quattro Premium Plus",
    "Type-S", // Acura
    "Type S",
    "Type R", // Honda
    "R/T", // Dodge, one word
    "Daytona R/T",
    "R/T Plus",
    "R/T 392",
    "w/DC Fast Charge",
    "SEL w/ Convenience Pkg",
    "SEL W/O Convenience Pkg",
    "e-tron w/ Ultra Package",
    "Standard RWD",
    "Standard (RWD)",
    "AWD Performance",
    "Performance (AWD)",
    "T8 AWD",
    "Inscription",
    "Engage e-4ORCE",
    "Plus (+)",
    "Recharge (Level 3-Ultimate)",
    "4XE",
    "2LT",
    "Work Truck (3WT)",
    "PRO",
    "XLT",
    "Long Range",
    "GT-Line",
  ];
  for (const t of real) assert.equal(isJunkTrim(t), false, `rejected a real trim: ${JSON.stringify(t)}`);
  for (const t of real) assert.equal(vpicTrim({ Series: t, Trim: "" }, { make: "X", model: "Y" }), t);
});

test("a Porsche type code is not a trim", () => {
  for (const t of ["Type 9YA", "Type Y1A", "TYPE Y1A", "Type Y1B", "Type XAB", "Type 971", "Type 95B", "Type 97A"]) {
    assert.equal(isChassisCode(t), true, t);
  }
  for (const t of ["Type-S", "Type S", "Type R", "Type 9YA Premium"]) assert.equal(isChassisCode(t), false, t);
});

test("a list of every grade the pattern covers is not a trim, whichever character joins it", () => {
  const lists = [
    "ENGAGE/EVOLVE/EMPOWER",
    "S/S+", // Leaf S (40 kWh) and S Plus (62 kWh)
    "Pro S / Pro S Plus",
    "Turbo / Turbo S",
    "Three/Four/Four Adv",
    "Plus/Premium/Advanced",
    "Elite/Tour",
    "XL/XLT/Lariat",
    "SEL/LE/GT/BE/SE",
    "B5 / Recharge",
    "E-Hybrid / E-Hybrid Platinum Edition",
    "Prestige / Prestige w/Launch Edition Pkg", // "w/" is not the separator; " / " is
    "Limited (PHEV), Limited w/ Tech (PHEV)",
    "ZVW52L-AHXEBA / ZVW52L-AHXGBA", // Toyota's own type codes, joined
    "ASV50L/GSV50L/AVV50L",
    "Light, Light Long Range, Wind",
    "Light, Wind",
    "Taycan, Taycan 4",
    "Turbo, Turbo S",
    "Limited, Disney 100 Platinum Edition",
    "Summit 4XE, Summit Reserve 4XE",
    "Core, Bright Theme, Dark Theme",
    "50 e-tron quattro Premium Plus, 55 e-tron quattro Premium Plus",
    'Advanced (AWD 19" Wheels); Advanced (AWD 20" Wheels)',
    "EV-e,EV",
    "Inscription Expression (XC60/XC90) R-Design Expression (S60 T8) Momentum (S60 B5)",
  ];
  for (const t of lists) assert.equal(isGradeList(t), true, t);
  for (const t of ["R/T", "Daytona R/T", "w/DC Fast Charge", "SEL w/ Convenience Pkg", "SEL W/O Convenience Pkg", "Plus (+)", "S E-Hybrid"]) {
    assert.equal(isGradeList(t), false, t);
  }
});

test("a drivetrain descriptor is not a trim, but a maker's AWD name and anything that says more both are", () => {
  for (const t of ["FWD/eAWD (T8)", "AWD/eAWD", "AWD/AWD (T8)", "FWD/AWD (T8)", "AWD", "FWD", "RWD", "4WD", "4x4", "e-AWD", "e-FWD", "eAWD"]) {
    assert.equal(isDriveOnly(t), true, t);
  }
  for (const t of ["xDrive", "xDrive50i", "sDrive30i", "quattro", "4MATIC", "e-4ORCE", "Standard RWD", "AWD Performance", "T8 AWD", "Performance (AWD)", "Titanium AWD", "EV 2WD", "AWD MKZ Reserve I"]) {
    assert.equal(isDriveOnly(t), false, t);
  }
});

test("the Lightning cases that started the filter still hold", () => {
  const l = { make: "Ford", model: "F-150 Lightning" };
  assert.equal(vpicTrim({ Series: "", Trim: "SuperCrew" }, l), "");
  assert.equal(vpicTrim({ Series: "PRO", Trim: "" }, l), "PRO");
  assert.equal(vpicTrim({ Series: "F-Series", Trim: "XLT" }, l), "XLT");
  // The model or make restated where the version belongs.
  assert.equal(vpicTrim({ Series: "Type Y1A", Trim: "Taycan" }, { make: "Porsche", model: "Taycan" }), "");
  assert.equal(vpicTrim({ Series: "Type Y1A", Trim: "4S" }, { make: "Porsche", model: "Taycan" }), "4S");
});
