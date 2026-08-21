// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/match.test.ts
//
// Three matching bugs, each capable of putting a WRONG fact on a real
// listing — the failure class this whole site exists to prevent:
//
//   1. "+" is identity on several trims (Mercedes EQE320+ vs EQE320 4MATIC,
//      Leaf S+ vs S) but norm() strips it like punctuation, so a gas CLA
//      "250" and an electric CLA "250+" used to compare equal.
//   2. A listing with no trim string used to satisfy ANY row for its
//      make/model/year, including trim-specific ones — a mild-hybrid CLA
//      with no trim could pick up an electric CLA's battery/charging facts.
//   3. The make filter was exact-equality with no alias table, so a
//      BrightDrop Zevo listed under make "Chevrolet" could never match a
//      BrightDrop-keyed row.
import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment, trimMatches, canonicalMake } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const decode = (over: Partial<VinDecode>): VinDecode => ({ vin: "", usMarket: true, ...over });

// ── Bug 1: "+" is identity, not punctuation ─────────────────────────────────

test("trimMatches: a trailing + distinguishes trims that otherwise norm identically", () => {
  // The exact CLA shape: a gas "250" trim must not satisfy a row keyed to the
  // electric "250+".
  assert.equal(trimMatches("250+", "250"), false);
  assert.equal(trimMatches("250", "250+"), false);
  // The EQE shape: prefixed/suffixed text still can't paper over a "+" that
  // only one side has.
  assert.equal(trimMatches("EQE320+", "EQE320"), false);
  assert.equal(trimMatches("EQE320 4MATIC", "EQE320+"), false);
  // Short trims aren't exempt: Leaf "S+" must not satisfy bare "S".
  assert.equal(trimMatches("S+", "S"), false);
  assert.equal(trimMatches("S", "S+"), false);
});

test("trimMatches: a trailing + still matches itself, and rows that list both forms cover both", () => {
  assert.equal(trimMatches("EQE320+", "EQE320+"), true);
  assert.equal(trimMatches("250+", "CLA 250+"), true);
  // The Leaf 2026 rows key ["S+", "S"] deliberately — both forms are listed
  // explicitly, so this must keep matching either one.
  assert.equal(trimMatches(["S+", "S"], "S"), true);
  assert.equal(trimMatches(["S+", "S"], "S+"), true);
});

test("matchEnrichment: real EQE320/EQE320+ rows no longer cross-match on a bare trim", () => {
  // Real corpus rows: eqe-2026-320-4matic (AWD, WMI W1K, trim "EQE320
  // 4MATIC") and eqe-2026-320-plus-rwd (RWD, WMI W1K, trim "EQE320+") share a
  // WMI and model year, so trim is the only thing that can tell them apart.
  // Before the fix, a bare "EQE320" (no 4MATIC, no +) resolved to an "exact"
  // match on the RWD "+" row via plain post-strip equality — a listing that
  // never said "+" was being told it was the +-trim car.
  const r = matchEnrichment(
    decode({ vin: "W1KEG1CB0TF000000", make: "MERCEDES-BENZ", model: "EQE", modelYear: 2026, trim: "EQE320" }),
    null
  );
  assert.notEqual(r.exact?.id, "eqe-2026-320-plus-rwd");
});

test("matchEnrichment: the real EQE320+ RWD listing still resolves to its own row", () => {
  const r = matchEnrichment(
    decode({ vin: "W1KEG2BB0TF073307", make: "MERCEDES-BENZ", model: "EQE", modelYear: 2026, trim: "320+" }),
    null
  );
  assert.equal(r.exact?.id, "eqe-2026-320-plus-rwd");
});

test("matchEnrichment: the real EQE320 4MATIC listing still resolves to its own row", () => {
  const r = matchEnrichment(
    decode({ vin: "W1KEG1CB0TF073252", make: "MERCEDES-BENZ", model: "EQE", modelYear: 2026, trim: "320 4MATIC" }),
    null
  );
  assert.equal(r.exact?.id, "eqe-2026-320-4matic");
});

// ── Bug 2: a missing trim must not satisfy a trim-specific row ─────────────

test("trimMatches: a trim-agnostic row (no r.trim) still matches an absent listing trim", () => {
  assert.equal(trimMatches(undefined, undefined), true);
  assert.equal(trimMatches(undefined, "anything"), true);
});

test("trimMatches: a trim-specific row does NOT match when the listing states no trim", () => {
  assert.equal(trimMatches("250+", undefined), false);
  assert.equal(trimMatches(["Long Range AWD"], undefined), false);
});

test("matchEnrichment: a no-trim listing on a trim-specific-only model+year now returns nothing, not a guess", () => {
  // Real corpus: 2022-23 Model Y AWD has exactly two rows, both trim-specific
  // ("Long Range AWD" vs "AWD") and sharing vin8 "E", so nothing but trim (or
  // the Tesla plant code, absent here) can tell them apart. Before the fix, a
  // no-trim listing passed trimMatches on both and surfaced them as
  // candidates; a model+year with only ONE such row would have come back
  // "exact" for a trim nobody confirmed. Silence is the correct answer here.
  const r = matchEnrichment(
    decode({ vin: "5YJYGDEE1NF000000", make: "TESLA", model: "Model Y", modelYear: 2022 }),
    null
  );
  assert.equal(r.exact, undefined);
  assert.ok(!r.candidates || r.candidates.length === 0);
});

test("matchEnrichment: the same listing WITH its trim stated still resolves normally", () => {
  const r = matchEnrichment(
    decode({ vin: "5YJYGDEE1NF000000", make: "TESLA", model: "Model Y", modelYear: 2022, trim: "AWD" }),
    null
  );
  assert.equal(r.exact?.id, "model-y-awd-4680-2022-23");
});

// ── Bug 3: make-alias table ─────────────────────────────────────────────────

test("canonicalMake: folds a Chevrolet-labeled Zevo to BrightDrop, but leaves real Chevrolets alone", () => {
  assert.equal(canonicalMake("Chevrolet", "Zevo 600"), "BRIGHTDROP");
  assert.equal(canonicalMake("Chevrolet", "Zevo Van"), "BRIGHTDROP");
  assert.equal(canonicalMake("BrightDrop", "Zevo 600"), "BRIGHTDROP");
  assert.equal(canonicalMake("Brightdrop", "Zevo 600"), "BRIGHTDROP");
  // A real Chevrolet EV must not be swept into the alias.
  assert.equal(canonicalMake("Chevrolet", "Bolt EV"), "CHEVROLET");
  assert.equal(canonicalMake("Chevrolet", "Equinox EV"), "CHEVROLET");
});

test("canonicalMake: Polestar and Genesis have no equivalent make split (checked against the live corpus)", () => {
  assert.equal(canonicalMake("Polestar", "Polestar 2"), canonicalMake("POLESTAR", "2"));
  assert.equal(canonicalMake("Genesis", "GV60"), "GENESIS");
});
