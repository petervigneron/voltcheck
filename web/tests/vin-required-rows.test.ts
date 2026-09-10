// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/vin-required-rows.test.ts
//
// A row that answers to a name a combustion car shares and relies on VIN
// keys to keep the petrol car out must not answer a decode with no usable
// VIN: match.ts skips every VIN filter for one, and by elimination the
// only "X5" row for 2016-18 is the plug-in's (three verifiers, 2026-09-10).
// The flag is per row so nameplates only an EV wears keep the deliberate
// opposite behaviour (a VIN-less EX40 still falls to its drivetrain's row).

import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import { ALL_ROWS } from "@/lib/enrichment/rows";
import { PLUG_IN_TRIM_RE } from "@/lib/enrichment/data6";
import type { VinDecode } from "@/lib/types";

const d = (over: Partial<VinDecode>): VinDecode => ({ vin: "", usMarket: true, ...over });

test("a VIN-less petrol X5, MINI Cooper, G-Class or Q5 matches nothing", () => {
  for (const [make, model, year, trim] of [
    ["BMW", "X5", 2017, "xDrive35i"],
    ["MINI", "Hardtop 2 Door", 2023, "Cooper S"],
    ["MERCEDES-BENZ", "G-Class", 2026, "G 550"],
    ["AUDI", "Q5", 2024, "Premium Plus 45 TFSI"],
  ] as const) {
    const r = matchEnrichment(d({ make, model, modelYear: year, trim }), null);
    assert.equal(r.exact, undefined, `${make} ${model} ${year} "${trim}" → ${r.exact?.id}`);
    assert.equal(r.candidates?.length ?? 0, 0, `${make} ${model} ${year} candidates: ${r.candidates?.map((c) => c.id).join(",")}`);
  }
});

test("the same rows answer once the VIN is there", () => {
  const r = matchEnrichment(d({ vin: "5UXKT0C54G0S76584", make: "BMW", model: "X5", modelYear: 2016, trim: "xDrive40e" }), null);
  assert.equal(r.exact?.id, "x5-40e-2016-18");
});

test("a nameplate only an EV wears keeps resolving without a VIN", () => {
  const r = matchEnrichment(d({ make: "VOLVO", model: "EX40", modelYear: 2026, driveType: "RWD" }), null);
  assert.equal(r.exact?.id, "ex40-2026-single");
});

test("every flagged row is VIN-keyed, and every VIN-keyed row on a petrol-shared bare name is flagged", () => {
  // Names a combustion car wears. A trim guard does not excuse a row here:
  // "S", "Turbo", "4S" are petrol trims too (the Porsche -alt rows).
  const shared = /^(X5|COOPER|HARDTOP 2 DOOR|COUNTRYMAN|SL|AMG GT|MERCEDES-AMG GT|C-CLASS|C-CLASS SEDAN|G-CLASS|G-CLASS SUV|Q5|TONALE|CAYENNE|CAYENNE COUPE|MACAN|PANAMERA)$/i;
  for (const r of ALL_ROWS) {
    const keyed = !!(r.vds || r.vin8 || r.wmi || r.plant);
    if (r.vinRequired) assert.ok(keyed, `${r.id} is flagged but carries no VIN key`);
    const names = [r.model, ...(r.modelAliases ?? [])].map((n) => String(n).trim());
    // A row whose every trim guard names the plug-in ("E-Hybrid", "LX Phev")
    // is exempt: the guard itself keeps the petrol car out, VIN or no VIN.
    const trims = Array.isArray(r.trim) ? r.trim : r.trim ? [r.trim] : [];
    const guardedByPlugInTrim = trims.length > 0 && trims.every((t) => PLUG_IN_TRIM_RE.test(t));
    if (keyed && !guardedByPlugInTrim && names.some((n) => shared.test(n))) assert.ok(r.vinRequired, `${r.id} answers to "${names.find((n) => shared.test(n))}" with VIN keys and is not flagged`);
  }
});
