// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/vin-page-ev-gate.test.ts
//
// The /vin/ gate in lib/enrichment/match.ts (needsVpicEvReading): when the
// trim came from vPIC, a trim-guarded row with no VIN key also needs vPIC's
// own BEV/PHEV reading. Every decode here is the shape lib/vpic.ts builds,
// with the strings vPIC's DecodeVINValuesBatch returned on 2026-09-10.
import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const PHEV = "PHEV (Plug-in Hybrid Electric Vehicle)";
const vpic = (d: Partial<VinDecode>): VinDecode => ({ vin: "", usMarket: true, trimFromVpic: true, ...d });
const silent = (d: VinDecode, label: string) => {
  const r = matchEnrichment(d, null);
  assert.equal(r.exact, undefined, `${label} exact`);
  assert.equal(r.candidates, undefined, `${label} candidates`);
};

test("petrol Panameras carrying vPIC's grade trim match nothing", () => {
  // Petrol patterns (2.9 L V6 / 4.0 L V8, electrification blank). The trim
  // guards on the -alt rows name these same grades.
  silent(vpic({ vin: "WP0AF2A73PL177953", make: "PORSCHE", model: "Panamera", modelYear: 2023, trim: "Turbo S" }), "2023 Turbo S");
  silent(vpic({ vin: "WP0AB2A72NL177953", make: "PORSCHE", model: "Panamera", modelYear: 2022, trim: "4S" }), "2022 4S");
  silent(vpic({ vin: "WP0AF2A74JL177953", make: "PORSCHE", model: "Panamera", modelYear: 2018, trim: "Turbo" }), "2018 Turbo");
  silent(vpic({ vin: "WP0CG2A77JL177953", make: "PORSCHE", model: "Panamera", modelYear: 2018, trim: "Turbo Sport Turismo" }), "2018 Turbo ST");
});

test("a hybrid vPIC itself calls a hybrid matches nothing, whatever its trim says", () => {
  silent(
    vpic({
      vin: "KNDCC3LC1J5160937",
      make: "KIA",
      model: "Niro",
      modelYear: 2018,
      trim: "EX Premium (PHEV), Graphite Edition (HEV)",
      electrificationLevel: "Strong HEV (Hybrid Electric Vehicle)",
    }),
    "2018 Niro hybrid"
  );
});

test("real plug-ins with vPIC's PHEV reading keep their rows", () => {
  const id = (d: Partial<VinDecode>) => matchEnrichment(vpic({ electrificationLevel: PHEV, ...d }), null).exact?.id;
  assert.equal(id({ vin: "5LMYJ8XY6PNL02733", make: "LINCOLN", model: "Aviator", modelYear: 2023, trim: "Grand Touring" }), "aviator-gt-2020-23-alt");
  assert.equal(id({ vin: "5LMTJ5DZ0RUL13841", make: "LINCOLN", model: "Corsair", modelYear: 2024, trim: "Grand Touring" }), "corsair-gt-2024-alt");
  assert.equal(
    id({ vin: "KNDCC3LD4J5144563", make: "KIA", model: "Niro", modelYear: 2018, trim: "EX Premium (PHEV), Graphite Edition (HEV)" }),
    "niro-phev-2018-22-alt"
  );
});

test("the price, pinned on purpose: a real plug-in vPIC mislabels as a hybrid goes quiet on /vin/", () => {
  // JF2GTDNC4NH207162 is a live 2022 Crosstrek Hybrid — the plug-in — which
  // vPIC reads "HEV (Hybrid Electric Vehicle) - Level Unknown". Silence is the
  // trade the gate makes; loosening it to rescue this car would let the Niro
  // hybrid above back in on the same kind of reading.
  const crosstrek = vpic({
    vin: "JF2GTDNC4NH207162",
    make: "SUBARU",
    model: "Crosstrek",
    modelYear: 2022,
    trim: "Hybrid",
    electrificationLevel: "HEV (Hybrid Electric Vehicle) - Level Unknown",
  });
  silent(crosstrek, "2022 Crosstrek Hybrid on /vin/");
  // The same car as a listing is untouched: the feed never sets trimFromVpic.
  assert.equal(matchEnrichment({ ...crosstrek, trimFromVpic: undefined }, null).exact?.id, "crosstrek-hybrid-2019-23-alt");
});
