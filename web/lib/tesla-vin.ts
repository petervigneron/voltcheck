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

// Positions 7/10/11 resolve two of the worst traps in the used market with no
// lookup at all: which pack a Model Y LR carries, and whether a 2020-titled
// Model 3 has the heat pump.
export function decodeTeslaVin(vin: string): TeslaVinFacts | null {
  if (!isTeslaVin(vin)) return null;
  const v = vin.toUpperCase();
  const plantCode = v[10];
  const chem = v[6];
  return {
    plant: PLANTS[plantCode] ? { code: plantCode, name: PLANTS[plantCode] } : undefined,
    modelYearFromVin: YEAR_CODES[v[9]],
    chemistryHint: chem === "E" ? "ternary" : chem === "F" ? "LFP" : undefined,
  };
}
