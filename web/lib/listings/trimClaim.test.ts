import { test } from "node:test";
import assert from "node:assert/strict";
import { trimClaim } from "./trimClaim";
import { packHidesTrim } from "./comps";
import type { Listing } from "./types";

// Run with the app's TS hook:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs --test lib/listings/trimClaim.test.ts
//
// The Lightning cases below ASSERTED the bare dealer label before the accuracy
// study's fix — a "Pro" chip beside a Lariat truck, a trim the VIN cannot
// support. They are the regression this suite pins: they must now go quiet.

const listing = (p: Partial<Listing>): Listing => ({
  id: "t",
  vin: "",
  year: 2023,
  make: "Ford",
  model: "F-150 Lightning",
  priceUsd: 55_000,
  mileage: 20_000,
  sellerType: "dealer",
  ...p,
});

// ── (a) A trim-less 2022-23 Lightning: the dealer label is the only trim
//        evidence, the VIN encodes none, so we go quiet. ───────────────────────
test("2022 Extended-Range Lightning labelled 'Lariat' suppresses", () => {
  const c = trimClaim(listing({ vin: "1FT6W1EV5NWG00001", year: 2022, trim: "Lariat" }));
  assert.deepEqual(c, { assert: false, reason: "not-vin-encoded" });
});

test("2023 Standard-Range Lightning labelled 'Pro' suppresses", () => {
  const c = trimClaim(listing({ vin: "1FTVW1EL0PWG00002", year: 2023, trim: "Pro" }));
  assert.deepEqual(c, { assert: false, reason: "not-vin-encoded" });
});

test("2023 Lightning labelled 'Platinum' suppresses (VIN can't tell Platinum from any other ER trim)", () => {
  const c = trimClaim(listing({ vin: "1FT6W1EV5PWG00003", year: 2023, trim: "Platinum" }));
  assert.equal(c.assert, false);
});

test("a Lightning a dealer mis-filed as a plain 'F-150' still suppresses (caught by VIN)", () => {
  const c = trimClaim(listing({ vin: "1FTVW1EL4NWG00004", year: 2022, model: "F-150", trim: "Lariat" }));
  assert.deepEqual(c, { assert: false, reason: "not-vin-encoded" });
});

// ── (b) The live guardrail: Mach-E GT, where VIN position 8 = E IS the GT
//        motor, must still assert and override the "Premium" prose. ────────────
test("Mach-E GT (VIN pos-8 E) asserts and beats contradicting 'Premium' prose", () => {
  const c = trimClaim(
    listing({ vin: "3FMTK4SE2PMA38629", make: "Ford", model: "Mustang Mach-E", trim: "GT", trimSuspect: "Premium" })
  );
  assert.deepEqual(c, { assert: true, trim: "GT" });
});

test("Mach-E GT with no prose still asserts (not a trim-less make)", () => {
  const c = trimClaim(listing({ vin: "3FMTK4SE2PMA38629", make: "Ford", model: "Mustang Mach-E", trim: "GT" }));
  assert.deepEqual(c, { assert: true, trim: "GT" });
});

// ── (c) A normal make whose feed trim we have no reason to distrust asserts. ──
test("a normal VIN-encoded trim asserts unchanged", () => {
  const c = trimClaim(listing({ vin: "KNDC3DLC5N5000005", year: 2022, make: "Kia", model: "EV6", trim: "GT-Line" }));
  assert.deepEqual(c, { assert: true, trim: "GT-Line" });
});

// ── Scope guards: the suppression must not creep. ────────────────────────────
test("a 2024 Lightning is out of scope and still asserts its label", () => {
  const c = trimClaim(listing({ vin: "1FT6W1EV5RWG00007", year: 2024, trim: "Lariat" }));
  assert.deepEqual(c, { assert: true, trim: "Lariat" });
});

test("empty / placeholder / cab-style reasons are unchanged", () => {
  assert.deepEqual(trimClaim(listing({ vin: "1FT6W1EV5PWG00009", trim: "" })), { assert: false, reason: "no-trim" });
  assert.deepEqual(trimClaim(listing({ vin: "1FT6W1EV5PWG00010", trim: "SuperCrew" })), {
    assert: false,
    reason: "cab-style",
  });
});

// ── The gate on the whole change: the price-cohort guard that keeps a
//    suppressed Lightning cohort from quoting a mixed wide median as a price. ──
test("packHidesTrim flags the 2022-23 Lightning VIN cohort, and only it", () => {
  assert.equal(packHidesTrim("1FT6W1EV5NWG00001", 2022), true); // ER Lightning
  assert.equal(packHidesTrim("1FTVW1EL0PWG00002", 2023), true); // SR Lightning
  assert.equal(packHidesTrim("1FT6W1EV5RWG00007", 2024), false); // out-of-scope year
  assert.equal(packHidesTrim("5YJ3E1EB5NF000006", 2022), false); // Tesla: pack identity IS its version
  assert.equal(packHidesTrim("KNDC3DLC5N5000005", 2022), false); // ordinary VIN-encoded trim
  assert.equal(packHidesTrim(undefined, 2022), false);
});
