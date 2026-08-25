import type { TeslaVinFacts } from "./types";

// Tesla WMIs: 5YJ (Fremont-era US), 7SA (Austin-era US), LRW (Shanghai),
// XP7 (Berlin), 7G2 (Semi). SB1 is Toyota-built but not Tesla.
const TESLA_WMIS = new Set(["5YJ", "7SA", "LRW", "XP7", "7G2"]);

const PLANTS: Record<string, string> = {
  F: "Fremont, CA",
  A: "Austin, TX",
  C: "Shanghai",
  B: "Berlin",
};

// Position 10 model-year code. L=2020 … T=2026 (I, O, Q, U, Z skipped per spec).
const YEAR_CODES: Record<string, number> = {
  K: 2019, L: 2020, M: 2021, N: 2022, P: 2023, R: 2024, S: 2025, T: 2026, V: 2027,
};

export function isTeslaVin(vin: string): boolean {
  return TESLA_WMIS.has(vin.slice(0, 3).toUpperCase());
}

// Positions 10/11 resolve two of the worst traps in the used market with no
// lookup at all: which pack a Model Y LR carries (via the plant code), and
// whether a 2020-titled Model 3 has the heat pump.
//
// Position 7 used to be read here as a battery-chemistry code (E = ternary,
// F = LFP) and it does not work. Measured 2026-08-25 against the 6,773 real
// Teslas in scraper/registry/vpic-cache.json: position 7 is "E" on 6,723 of
// them (99.3%) and "F" never appears at all, so the LFP branch was dead code
// and every modern Tesla got told "ternary". Every cohort of 5+ cars is 100%
// "E"; the non-E values (H/S/C/D/A, all check-digit valid) belong only to
// 2010-2015 Model S and the original Roadster, where the field did carry
// meaning. The control that settles it: 601 cars this corpus states are LFP
// (2022-23 Model 3 RWD, vin8 A - "CATL LFP pack in every US 2022-23 Model 3
// RWD") and 295 known-ternary cars (vin8 B) read IDENTICALLY at position 7.
// A field that cannot separate two cohorts that must differ cannot source a
// chemistry claim, and /vin/ was printing one at high confidence under a
// heading reading "What the VIN itself proves" - contradicting the LFP the
// enrichment row printed on the same page for 719 of these cars. Same shape
// as vPIC's BatteryKWh reading 98.00 for every F-150 Lightning. Chemistry
// now comes from the enrichment rows alone.
export function decodeTeslaVin(vin: string): TeslaVinFacts | null {
  if (!isTeslaVin(vin)) return null;
  const v = vin.toUpperCase();
  const plantCode = v[10];
  return {
    plant: PLANTS[plantCode] ? { code: plantCode, name: PLANTS[plantCode] } : undefined,
    modelYearFromVin: YEAR_CODES[v[9]],
  };
}
