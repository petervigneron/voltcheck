// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/cayenne-electric-ppv-spectre-revuelto.test.ts
//
// The four nameplates in lib/enrichment/data21.ts are keyed on the vehicle
// descriptor (VIN positions 4-8), read off every live VIN on 2026-09-10.
// What has to hold, on all four: a real VIN prefix resolves to exactly one
// row; a dealer's trim string cannot override what the VIN says; a VIN
// outside the researched patterns matches none of these rows rather than a
// neighbouring one; and a car with no trim at all still lands right.
//
// Two of these are guards against a specific wrong answer rather than a
// missing one:
//
//   - the Blazer EV PPV shares VIN position 8 ("L") with the retail Blazer EV
//     SS, so only the descriptor keeps a police car off the SS's 102 kWh and
//     302 miles — and, in the other direction, keeps a retail Blazer off the
//     police rows even though those rows alias the bare "Blazer EV";
//   - the Lamborghini Revuelto shares its WMI with the MY2026 Temerario
//     (ZHWUC1ZC against the Revuelto's ZHWUC1ZM), which no row here covers.

import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const d = (over: Partial<VinDecode>): VinDecode => ({ vin: "", usMarket: true, ...over });

// ── Porsche Cayenne Electric, MY2026 ────────────────────────────────────────

test("each of the six live Cayenne Electric descriptors resolves to its own row, with Porsche's pack, port and range", () => {
  const cases: [string, string, string, number][] = [
    // vin (real live prefixes), feed model, expected row id, Porsche's range
    ["WP1AA2X14TD000457", "Cayenne Electric", "cayenne-electric-2026", 317],
    ["WP1AB2X16TD100153", "Cayenne Electric", "cayenne-s-electric-2026", 299],
    ["WP1AD2X15TD150312", "Cayenne Electric", "cayenne-turbo-electric-2026", 298],
    ["WP1BA2X1XTD200134", "Cayenne Coupe Electric", "cayenne-coupe-electric-2026", 326],
    ["WP1BB2X13TD300167", "Cayenne Coupe Electric", "cayenne-s-coupe-electric-2026", 316],
    ["WP1BD2X13TD350108", "Cayenne Coupe Electric", "cayenne-turbo-coupe-electric-2026", 302],
  ];
  for (const [vin, model, id, mi] of cases) {
    const r = matchEnrichment(d({ vin, make: "Porsche", model, modelYear: 2026, driveType: "AWD" }), null);
    assert.equal(r.exact?.id, id, `${vin} → ${r.exact?.id ?? "no exact"}`);
    assert.equal(r.exact?.battery?.packGrossKwh?.value, 113);
    assert.equal(r.exact?.charging?.portStandard?.value, "NACS");
    // Porsche's own figure, not an EPA record: fueleconomy.gov carries no
    // 2026 Cayenne Electric, so it lives in mfrRangeMi.
    assert.equal(r.exact?.range?.mfrRangeMi?.value, mi);
    assert.equal(r.exact?.range?.epaRangeMi, undefined);
  }
});

test("the Cayenne Electric VIN wins over whatever the dealer typed in the trim field", () => {
  // All four are real live trim strings on WP1AD2X1 (Turbo Electric) cars.
  for (const trim of ["Turbo", "Turbo Electric", "New 2026 Porsche Cayenne", undefined]) {
    const r = matchEnrichment(
      d({ vin: "WP1AD2X15TD150312", make: "Porsche", model: "Cayenne Electric", modelYear: 2026, trim, driveType: "AWD" }),
      null
    );
    assert.equal(r.exact?.id, "cayenne-turbo-electric-2026", `trim ${JSON.stringify(trim)}`);
  }
});

test("a plug-in hybrid Cayenne cannot reach an electric Cayenne row", () => {
  // Real live MY2026 Cayenne E-Hybrid descriptor. The electric rows are keyed
  // to A[ABD]2X1 / B[ABD]2X1 and this is AE2AY, so even under the model string
  // the electric rows answer to, nothing here matches it.
  const r = matchEnrichment(
    d({ vin: "WP1AE2AY0TDA00001", make: "Porsche", model: "Cayenne Electric", modelYear: 2026, driveType: "AWD" }),
    null
  );
  assert.equal(r.exact, undefined);
  assert.equal(r.candidates?.length ?? 0, 0);
});

// ── Chevrolet Blazer EV Police Pursuit Vehicle ──────────────────────────────

test("the police descriptor resolves per model year, and only 2025 carries a range figure", () => {
  const cases: [string, number, string, number | undefined][] = [
    ["3GNKDFRL4RS266583", 2024, "blazer-ev-ppv-2024", undefined],
    ["3GNKDFRL1SS193498", 2025, "blazer-ev-ppv-2025", 297],
    ["3GNKDFRL3TS152677", 2026, "blazer-ev-ppv-2026", undefined],
  ];
  for (const [vin, year, id, mi] of cases) {
    const r = matchEnrichment(
      d({ vin, make: "Chevrolet", model: "Blazer EV Police Package", modelYear: year, driveType: "AWD" }),
      null
    );
    assert.equal(r.exact?.id, id, `${vin} → ${r.exact?.id ?? "no exact"}`);
    assert.equal(r.exact?.range?.mfrRangeMi?.value, mi);
    assert.equal(r.exact?.range?.epaRangeMi, undefined);
    // GM's port for every MY2024-26 Blazer EV, police car included.
    assert.equal(r.exact?.charging?.portStandard?.value, "CCS1");
  }
});

test("a police VIN filed under the bare model string still reads as a police car, trim or no trim", () => {
  // Two MY2024 PPVs arrive in the feed as model "Blazer EV" with trims a
  // retail car would wear; the descriptor is what settles them.
  for (const trim of ["Police", "2FL Police", "2FL", undefined]) {
    const r = matchEnrichment(
      d({ vin: "3GNKDFRL4RS281830", make: "Chevrolet", model: "Blazer EV", modelYear: 2024, trim, driveType: "AWD" }),
      null
    );
    assert.equal(r.exact?.id, "blazer-ev-ppv-2024", `trim ${JSON.stringify(trim)}`);
  }
});

test("no retail Blazer EV can reach a police row, and the police rows change nothing about which row it does get", () => {
  // One live VIN per retail descriptor, with the row data2.ts holds for it.
  const cases: [string, number, string, string][] = [
    ["3GNKDBRJ0RS100001", 2024, "AWD", "blazer-awd-2024"],
    ["3GNKDHRK0RS100001", 2024, "RWD", "blazer-rwd-2024"],
    ["3GNKDARM0SS100001", 2025, "FWD", "blazer-fwd"],
    ["3GNKDERL0SS100001", 2025, "AWD", "blazer-ss-2025"],
    ["3GNKDERL0TS100001", 2026, "AWD", "blazer-ss-2026"],
  ];
  for (const [vin, year, drive, id] of cases) {
    const r = matchEnrichment(d({ vin, make: "Chevrolet", model: "Blazer EV", modelYear: year, driveType: drive }), null);
    assert.equal(r.exact?.id, id, `${vin} → ${r.exact?.id ?? "no exact"}`);
    assert.ok(!/ppv/.test(r.exact?.id ?? ""), `${vin} must not land on a police row`);
  }
});

// ── Rolls-Royce Spectre ─────────────────────────────────────────────────────

test("the Spectre's VIN separates Black Badge from the standard car, and the warranty term moves in MY2026", () => {
  const cases: [string, number, string, number, number][] = [
    // vin, year, row id, EPA range on the 23-inch wheel, warranty years
    ["SCATK2C06RU224658", 2024, "spectre-2024", 266, 10],
    ["SCATK2C0XSU227763", 2025, "spectre-2025", 253, 10],
    ["SCATK2C05TU234217", 2026, "spectre-2026", 253, 15],
    ["SCATK4C07RU220001", 2024, "spectre-black-badge-2024", 264, 10],
    ["SCATK4C09SU230262", 2025, "spectre-black-badge-2025", 251, 10],
    ["SCATK4C06TU233248", 2026, "spectre-black-badge-2026", 251, 15],
  ];
  for (const [vin, year, id, mi, yrs] of cases) {
    const r = matchEnrichment(d({ vin, make: "Rolls-Royce", model: "Spectre", modelYear: year, driveType: "AWD" }), null);
    assert.equal(r.exact?.id, id, `${vin} → ${r.exact?.id ?? "no exact"}`);
    assert.equal(r.exact?.range?.epaRangeMi?.value, mi);
    assert.equal(r.exact?.warranty?.batteryYears?.value, yrs);
    assert.equal(r.exact?.battery?.packUsableKwh?.value, 102); // Rolls-Royce's table: "Net capacity"
    // Rolls-Royce names no connector anywhere; the row says so rather than
    // borrowing a sibling BMW Group figure.
    assert.equal(r.exact?.charging?.portStandard, undefined);
    assert.ok((r.exact?.abstains?.portStandard ?? "").length > 20);
  }
});

test("a dealer's decorative trim string cannot move a Spectre off its VIN's row", () => {
  // Every one of these is a real live trim value on a standard Spectre.
  for (const trim of ["RR", "Lunaflair", "Pebble Beach Special Commission", "Black Badge Spectre", undefined]) {
    const r = matchEnrichment(
      d({ vin: "SCATK2C08RU225570", make: "Rolls-Royce", model: "Spectre", modelYear: 2024, trim, driveType: "AWD" }),
      null
    );
    assert.equal(r.exact?.id, "spectre-2024", `trim ${JSON.stringify(trim)}`);
  }
});

// ── Lamborghini Revuelto ────────────────────────────────────────────────────

test("the Revuelto rows split at MY2026 and carry Lamborghini's own EPA electric range", () => {
  const cases: [string, number, string][] = [
    ["ZHWUC1ZM7RLA01009", 2024, "revuelto-2024-25"],
    ["ZHWUC1ZM4SLA03662", 2025, "revuelto-2024-25"],
    ["ZHWUC1ZM3TLA05064", 2026, "revuelto-2026"],
  ];
  for (const [vin, year, id] of cases) {
    const r = matchEnrichment(d({ vin, make: "Lamborghini", model: "Revuelto", modelYear: year }), null);
    assert.equal(r.exact?.id, id, `${vin} → ${r.exact?.id ?? "no exact"}`);
    assert.equal(r.exact?.range?.epaRangeMi?.value, 5);
    assert.equal(r.exact?.range?.mpgGasoline?.value, 12);
    assert.equal(r.exact?.charging?.portStandard?.value, "J1772");
    assert.equal(r.exact?.plugIn, true);
    assert.equal(r.exact?.packVariant, "PHEV");
    // Lamborghini publishes no capacity for this pack; the row says so.
    assert.equal(r.exact?.battery, undefined);
    assert.ok((r.exact?.abstains?.packUsableKwh ?? "").length > 20);
  }
});

test("a Temerario shares the Revuelto's WMI and must match none of these rows", () => {
  for (const model of ["Temerario", "Revuelto"]) {
    const r = matchEnrichment(d({ vin: "ZHWUC1ZC7TLA00876", make: "Lamborghini", model, modelYear: 2026 }), null);
    assert.equal(r.exact, undefined, `${model} → ${r.exact?.id ?? "no exact"}`);
    assert.equal(r.candidates?.length ?? 0, 0);
  }
});

test("a Revuelto with no trim and no drivetrain still resolves, because nothing here is keyed on either", () => {
  const r = matchEnrichment(d({ vin: "ZHWUC1ZM9TLA04002", make: "Lamborghini", model: "Revuelto", modelYear: 2026 }), null);
  assert.equal(r.exact?.id, "revuelto-2026");
});
