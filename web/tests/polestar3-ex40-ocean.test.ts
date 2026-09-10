// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/polestar3-ex40-ocean.test.ts
//
// The Polestar 3, Volvo EX40 and Fisker Ocean rows (lib/enrichment/data16.ts)
// are keyed on VIN positions 4–5 — the only field on any of these three
// nameplates that a dealer feed cannot blur. Every VIN prefix below was read
// off the live feed on 2026-09-10. What this pins:
//
//   • each live prefix resolves to exactly one row, with the pack and range
//     that version's maker published for it;
//   • a dealer trim string cannot override what the VIN says (32 of the 112
//     live 2025 Polestar 3s carry no trim at all and 12 Performance-pack cars
//     say only "Long range", which is why no row here carries a trim key);
//   • a VIN outside the researched prefixes matches nothing rather than
//     borrowing a neighbour's numbers — the Cadillac Lyriq V-Series failure;
//   • a car with no VIN falls to the drivetrain and lands on the right row or
//     on candidates, never on a wrong single answer.

import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const decode = (over: Partial<VinDecode>): VinDecode => ({ vin: "", usMarket: true, ...over });

// Real VINs from the live feed, one per pattern.
const P3 = {
  "2024 EA": "YSREA3YB3SB003071",
  "2024 EE": "YSREE3YB7SB002025",
  "2025 EA (Charleston)": "7SYEA3YB0SG026952",
  "2025 EA (Chengdu)": "YSREA3YB5SB001726",
  "2025 EE": "7SYEE3YB6SG031979",
  "2025 EJ": "7SYEJ3YBXSG030538",
};
const ps3 = (vin: string, modelYear: number, over: Partial<VinDecode> = {}) =>
  decode({ vin, make: "Polestar", model: "3", modelYear, ...over });

test("Polestar 3: the VIN descriptor picks the version, and every version keeps its own range", () => {
  const cases: [string, number, string, number | undefined, number | undefined][] = [
    // vin, year, row id, epaRangeMi, mfrRangeMi
    // The feed labels nine MY2025 cars "2024" (vPIC: year code S); there is no US MY2024.
    [P3["2024 EA"], 2024, "polestar3-2025-dual", 310, undefined],
    [P3["2024 EE"], 2024, "polestar3-2025-performance", 279, undefined],
    [P3["2025 EA (Charleston)"], 2025, "polestar3-2025-dual", 310, undefined],
    [P3["2025 EA (Chengdu)"], 2025, "polestar3-2025-dual", 310, undefined],
    [P3["2025 EE"], 2025, "polestar3-2025-performance", 279, undefined],
    [P3["2025 EJ"], 2025, "polestar3-2025-single", 342, undefined],
  ];
  for (const [vin, year, id, epaMi, mfrMi] of cases) {
    const r = matchEnrichment(ps3(vin, year), null);
    assert.equal(r.exact?.id, id, `${vin} → ${r.exact?.id ?? "no exact"}`);
    assert.equal(r.exact?.battery?.packGrossKwh?.value, 111);
    assert.equal(r.exact?.range?.epaRangeMi?.value, epaMi, `${id} EPA range`);
    assert.equal(r.exact?.range?.mfrRangeMi?.value, mfrMi, `${id} maker range`);
    // Polestar 3s take a NACS adapter; the port itself is CCS1 in every year.
    assert.equal(r.exact?.charging?.portStandard?.value, "CCS1");
    assert.equal(r.exact?.charging?.superchargerAccess?.value, "adapter");
    assert.equal(r.exact?.thermal?.heatPump?.value, "standard");
    assert.equal(r.exact?.warranty?.batteryMiles?.value, 100_000);
  }
});


test("Polestar 3: the dealer's trim cannot turn a Performance car into an ordinary one, or the reverse", () => {
  // Both strings are real feed values on this nameplate.
  for (const trim of ["Long range", "", "Long Range Pilot Plus", "Performance"]) {
    assert.equal(
      matchEnrichment(ps3(P3["2025 EE"], 2025, { trim, driveType: "AWD" }), null).exact?.id,
      "polestar3-2025-performance",
      `EE VIN with trim "${trim}"`
    );
    assert.equal(
      matchEnrichment(ps3(P3["2025 EA (Charleston)"], 2025, { trim, driveType: "AWD" }), null).exact?.id,
      "polestar3-2025-dual",
      `EA VIN with trim "${trim}"`
    );
  }
});

test("Polestar 3: a descriptor we did not research matches nothing", () => {
  // "EB" is not one of the three live codes; a version we never looked up
  // must not inherit the Long range Dual motor's 310 miles.
  const r = matchEnrichment(ps3("7SYEB3YB0SG026952", 2025), null);
  assert.equal(r.exact, undefined);
  assert.equal(r.candidates?.length ?? 0, 0);
  // Nor may a MY2026 car pick up the MY2025 figures: EPA rates it differently.
  const y26 = matchEnrichment(ps3(P3["2025 EA (Charleston)"], 2026), null);
  assert.equal(y26.exact, undefined);
  assert.equal(y26.candidates?.length ?? 0, 0);
});

test("Polestar 3: with no VIN, RWD is the Single motor and AWD is two candidates, never one wrong number", () => {
  const rwd = matchEnrichment(decode({ make: "Polestar", model: "3", modelYear: 2025, driveType: "RWD" }), null);
  assert.equal(rwd.exact?.id, "polestar3-2025-single");
  const awd = matchEnrichment(decode({ make: "Polestar", model: "3", modelYear: 2025, driveType: "AWD" }), null);
  assert.equal(awd.exact, undefined);
  assert.deepEqual(
    (awd.candidates ?? []).map((c) => c.id).sort(),
    ["polestar3-2025-dual", "polestar3-2025-performance"]
  );
});

// ── Volvo EX40 ────────────────────────────────────────────────────────────

const EX40 = {
  "2025 EH": "YV4EH3HJ3S2544946", // Core, RWD
  "2025 EH Plus": "YV4EH3HK3S2566924",
  "2025 ER": "YV4ER3HJXS2560171", // Core, AWD
  "2025 ER Ultra": "YV4ER3HL7S2450566",
  "2026 EH": "YV4EH3HKXT2712320",
  "2026 ER": "YV4ER3HK7T2820228",
  "2026 ER Black Edition": "YV4ER3HD2T2759646",
};
const ex40 = (vin: string, modelYear: number, over: Partial<VinDecode> = {}) =>
  decode({ vin, make: "Volvo", model: "EX40", modelYear, ...over });

test("Volvo EX40: EH is the Single Motor and ER the Twin, in both model years, whatever grade the VIN's eighth character names", () => {
  const cases: [string, number, string, number][] = [
    [EX40["2025 EH"], 2025, "ex40-2025-single", 296],
    [EX40["2025 EH Plus"], 2025, "ex40-2025-single", 296],
    [EX40["2025 ER"], 2025, "ex40-2025-twin", 260],
    [EX40["2025 ER Ultra"], 2025, "ex40-2025-twin", 260],
    [EX40["2026 EH"], 2026, "ex40-2026-single", 296],
    [EX40["2026 ER"], 2026, "ex40-2026-twin", 260],
    [EX40["2026 ER Black Edition"], 2026, "ex40-2026-twin", 260],
  ];
  for (const [vin, year, id, mi] of cases) {
    const r = matchEnrichment(ex40(vin, year), null);
    assert.equal(r.exact?.id, id, `${vin} → ${r.exact?.id ?? "no exact"}`);
    assert.equal(r.exact?.range?.epaRangeMi?.value, mi);
    assert.equal(r.exact?.battery?.packGrossKwh?.value, 82);
    assert.equal(r.exact?.charging?.portStandard?.value, "CCS1");
    // Volvo's own US surfaces disagree about the heat pump; the row says so.
    assert.equal(r.exact?.thermal?.heatPump, undefined);
    assert.ok((r.exact?.abstains?.heatPump ?? "").length > 20, `${id} must carry a heat-pump abstention`);
  }
});

test("Volvo EX40: the grade in the trim field cannot move a car between motors", () => {
  // Position 8 is the grade, not the drivetrain: "Plus" exists on both.
  for (const trim of ["Plus", "Core", "Ultra", "Twin Motor Plus", ""]) {
    assert.equal(matchEnrichment(ex40(EX40["2025 EH Plus"], 2025, { trim }), null).exact?.id, "ex40-2025-single", `EH + "${trim}"`);
    assert.equal(matchEnrichment(ex40(EX40["2025 ER Ultra"], 2025, { trim }), null).exact?.id, "ex40-2025-twin", `ER + "${trim}"`);
  }
});

test("Volvo EX40: a descriptor Volvo names but no live car uses matches nothing", () => {
  // Volvo's MY2026 warranty booklet prints "ER/EY" as the twin codes; no EY
  // car is live, so no row claims one.
  const r = matchEnrichment(ex40("YV4EY3HK7T2820228", 2026), null);
  assert.equal(r.exact, undefined);
  assert.equal(r.candidates?.length ?? 0, 0);
});

test("Volvo EX40: with no VIN, the drivetrain still resolves the year's single row", () => {
  assert.equal(matchEnrichment(decode({ make: "Volvo", model: "EX40", modelYear: 2026, driveType: "RWD" }), null).exact?.id, "ex40-2026-single");
  assert.equal(matchEnrichment(decode({ make: "Volvo", model: "EX40", modelYear: 2026, driveType: "AWD" }), null).exact?.id, "ex40-2026-twin");
  // No drivetrain either: two candidates with different ranges, not a guess.
  const blind = matchEnrichment(decode({ make: "Volvo", model: "EX40", modelYear: 2026 }), null);
  assert.equal(blind.exact, undefined);
  assert.deepEqual((blind.candidates ?? []).map((c) => c.id).sort(), ["ex40-2026-single", "ex40-2026-twin"]);
});

// ── Fisker Ocean ──────────────────────────────────────────────────────────

const OCEAN = {
  Extreme: "VCF1EBU22PG009085",
  Ultra: "VCF1UBU29PG007546",
  One: "VCF1ZBU26PG005030",
  Sport: "VCF1SAU24PG009382",
};
const ocean = (vin: string, over: Partial<VinDecode> = {}) =>
  decode({ vin, make: "Fisker", model: "Ocean", modelYear: 2023, ...over });

test("Fisker Ocean: VIN position 5 names the version, and only the pair EPA actually rated carries an EPA range", () => {
  const extreme = matchEnrichment(ocean(OCEAN.Extreme), null);
  assert.equal(extreme.exact?.id, "fisker-ocean-2023-extreme-one");
  assert.equal(extreme.exact?.range?.epaRangeMi?.value, 360);
  assert.equal(extreme.exact?.battery?.packUsableKwh?.value, 106);

  const one = matchEnrichment(ocean(OCEAN.One), null);
  assert.equal(one.exact?.id, "fisker-ocean-2023-extreme-one");

  const ultra = matchEnrichment(ocean(OCEAN.Ultra), null);
  assert.equal(ultra.exact?.id, "fisker-ocean-2023-ultra");
  assert.equal(ultra.exact?.range?.epaRangeMi, undefined);
  assert.equal(ultra.exact?.range?.mfrRangeMi?.value, 350);

  const sport = matchEnrichment(ocean(OCEAN.Sport), null);
  assert.equal(sport.exact?.id, "fisker-ocean-2023-sport");
  assert.equal(sport.exact?.range?.mfrRangeMi?.value, 231);
  // Fisker never published the Sport's pack; the row abstains rather than
  // borrow the One/Extreme sheet's 113 kWh.
  assert.equal(sport.exact?.battery?.packUsableKwh, undefined);
  assert.equal(sport.exact?.battery?.packGrossKwh, undefined);
  assert.ok((sport.exact?.abstains?.packUsableKwh ?? "").length > 20);
});

test("Fisker Ocean: every version carries the CCS1 port and Fisker's published 10-year battery term", () => {
  for (const vin of Object.values(OCEAN)) {
    const r = matchEnrichment(ocean(vin), null);
    assert.equal(r.exact?.charging?.portStandard?.value, "CCS1");
    assert.equal(r.exact?.warranty?.batteryYears?.value, 10);
    assert.equal(r.exact?.warranty?.sohFloorPct?.value, 75);
  }
});

test("Fisker Ocean: a dealer trim cannot promote a Sport to an Extreme, and an unresearched version matches nothing", () => {
  assert.equal(matchEnrichment(ocean(OCEAN.Sport, { trim: "Extreme", driveType: "FWD" }), null).exact?.id, "fisker-ocean-2023-sport");
  assert.equal(matchEnrichment(ocean(OCEAN.Extreme, { trim: "Sport", driveType: "AWD" }), null).exact?.id, "fisker-ocean-2023-extreme-one");
  const unknown = matchEnrichment(ocean("VCF1XBU22PG009085"), null);
  assert.equal(unknown.exact, undefined);
  assert.equal(unknown.candidates?.length ?? 0, 0);
});

test("Fisker Ocean: with no VIN, front-wheel drive is the Sport and AWD is two candidates", () => {
  const fwd = matchEnrichment(decode({ make: "Fisker", model: "Ocean", modelYear: 2023, driveType: "FWD" }), null);
  assert.equal(fwd.exact?.id, "fisker-ocean-2023-sport");
  const awd = matchEnrichment(decode({ make: "Fisker", model: "Ocean", modelYear: 2023, driveType: "AWD" }), null);
  assert.equal(awd.exact, undefined);
  assert.deepEqual(
    (awd.candidates ?? []).map((c) => c.id).sort(),
    ["fisker-ocean-2023-extreme-one", "fisker-ocean-2023-ultra"]
  );
});
