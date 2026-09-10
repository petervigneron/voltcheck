// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/mercedes-g580-sl-gt.test.ts
//
// Every row in lib/enrichment/data15.ts answers to a model string a PETROL
// Mercedes also wears — "G-Class", "SL", "Mercedes-AMG GT", "C-Class" — so
// each is keyed on VIN positions 4-8 and none carries a trim list. What has
// to hold: a live VIN resolves to exactly one row, a dealer's trim string
// cannot move it, a petrol sibling's VIN reaches nothing at all, and the two
// different cars called "Mercedes-AMG GT" never swap.

import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const decode = (vin: string, model: string, modelYear: number, over: Partial<VinDecode> = {}): VinDecode => ({
  vin,
  usMarket: true,
  make: "Mercedes-Benz",
  model,
  modelYear,
  ...over,
});

// Every VIN below is a real one from the live feed unless marked constructed.
test("each live VIN resolves to its own model year's row", () => {
  const cases: [string, string, number, string][] = [
    ["W1NWM0AB0SX029189", "G-Class", 2025, "g580-2025"],
    ["W1NWM0AB6TX077300", "G-CLASS", 2026, "g580-2026"],
    ["W1NWM0BB4VX095098", "G-Class", 2027, "g580-2027"],
    ["W1KVK8CB2RF022710", "SL", 2024, "amg-sl63se-2024"],
    ["W1KVK8CB8SF023625", "SL", 2025, "amg-sl63se-2025"],
    ["W1KVK8CB5TF026614", "SL", 2026, "amg-sl63se-2026"],
    ["W1K7X7KB0RV003701", "Mercedes-AMG GT", 2024, "amg-gt63se-4door-2024"],
    ["W1K7X7KB3SV004895", "Mercedes-AMG GT", 2025, "amg-gt63se-4door-2025"],
    ["W1K7X7KBXTV007388", "Mercedes-AMG GT", 2026, "amg-gt63se-4door-2026"],
    ["W1KRJ8CB5SF005507", "Mercedes-AMG GT", 2025, "amg-gt63se-coupe-2025"],
    ["W1KRJ8CB0TF011670", "Mercedes-AMG GT", 2026, "amg-gt63se-coupe-2026"],
    ["W1KRJ8CB7VF012978", "Mercedes-AMG GT", 2027, "amg-gt63se-coupe-2027"],
    ["W1KAF8AB8RR217845", "C-Class", 2024, "amg-c63se-2024"],
    ["W1KAF8AB8SR252245", "C-Class", 2025, "amg-c63se-2025"],
    ["W1KAF8AB7TR312436", "C-CLASS", 2026, "amg-c63se-2026"],
    ["55SWF4HB7GU165429", "C-Class", 2016, "c350e-2016"],
    ["55SWF4HB6HU227081", "C 350e", 2017, "c350e-2017"],
    ["55SWF4HB7JU234739", "C-Class", 2018, "c350e-2018"],
  ];
  for (const [vin, model, year, id] of cases) {
    const r = matchEnrichment(decode(vin, model, year), null);
    assert.equal(r.exact?.id, id, `${vin} (${model} ${year}) → ${r.exact?.id ?? "no exact"}`);
  }
});

test("a petrol sibling's VIN matches nothing — the descriptor is the guard, not the nameplate", () => {
  // Constructed from the live VINs above by swapping VIN position 7 for the
  // petrol code vPIC's own partial-VIN sweep returned on 2026-09-10:
  //   W1KVK8B = AMG SL63 (gasoline)   W1KRJ8A = AMG GT55 (gasoline)
  //   W1KAF8H = AMG C43 (gasoline)    55SWF4J = C300 (gasoline)
  // and one G-Class VIN outside the electric car's W1NWM0 family entirely.
  const petrol: [string, string, number][] = [
    ["W1KVK8BB2RF022710", "SL", 2024],
    ["W1KVK8BB5TF026614", "SL", 2026],
    ["W1KRJ8AB0TF011670", "Mercedes-AMG GT", 2026],
    ["W1KRJ8JB0TF011670", "Mercedes-AMG GT", 2026],
    ["W1KAF8HB8RR217845", "C-Class", 2024],
    ["55SWF4JB6HU227081", "C-Class", 2017],
    ["W1NYC7HB6TX077300", "G-Class", 2026],
  ];
  for (const [vin, model, year] of petrol) {
    const r = matchEnrichment(decode(vin, model, year), null);
    assert.equal(r.exact, undefined, `${vin} matched ${r.exact?.id}`);
    assert.equal(r.candidates?.length ?? 0, 0, `${vin} produced candidates`);
  }
});

test("the VIN wins over whatever the dealer typed in the trim field", () => {
  // Real trim strings from the feed for these cars, plus the petrol badge a
  // careless listing could carry. None of the rows has a trim key, so none of
  // these can veto or redirect the descriptor match.
  for (const trim of ["G 580e 4MATIC", "G580", "4MATIC", "G 550", "AMG G 63", ""]) {
    const r = matchEnrichment(decode("W1NWM0AB6TX077300", "G-Class", 2026, { trim: trim || undefined }), null);
    assert.equal(r.exact?.id, "g580-2026", `trim "${trim}"`);
  }
  for (const trim of ["GT 55", "AMG GT 63 PRO", "Base"]) {
    const r = matchEnrichment(decode("W1KRJ8CB0TF011670", "Mercedes-AMG GT", 2026, { trim }), null);
    assert.equal(r.exact?.id, "amg-gt63se-coupe-2026", `trim "${trim}"`);
  }
});

test("the two cars called Mercedes-AMG GT never swap: the four-door and the coupe are different descriptors", () => {
  const fourDoor = matchEnrichment(decode("W1K7X7KBXTV007388", "Mercedes-AMG GT", 2026), null);
  const coupe = matchEnrichment(decode("W1KRJ8CB0TF011670", "Mercedes-AMG GT", 2026), null);
  assert.equal(fourDoor.exact?.id, "amg-gt63se-4door-2026");
  assert.equal(coupe.exact?.id, "amg-gt63se-coupe-2026");
  // EPA rates them separately and the rows must not have been merged.
  assert.equal(
    matchEnrichment(decode("W1K7X7KB3SV004895", "Mercedes-AMG GT", 2025), null).exact?.range?.epaRangeTotalMi?.value,
    340
  );
  assert.equal(
    matchEnrichment(decode("W1KRJ8CB5SF005507", "Mercedes-AMG GT", 2025), null).exact?.range?.epaRangeTotalMi?.value,
    360
  );
});

test("a listing with no VIN at all still cannot pick up the wrong body or the wrong year", () => {
  // 129 of the live G-Class listings carry no trim; some feeds carry no VIN
  // either. Without a VIN the year alone must still land on one G 580 row —
  // there is only one per model year — and a bare "Mercedes-AMG GT" with no
  // VIN must NOT resolve, because two different cars wear that name.
  assert.equal(matchEnrichment(decode("", "G-Class", 2026), null).exact?.id, "g580-2026");
  const gt = matchEnrichment(decode("", "Mercedes-AMG GT", 2026), null);
  assert.equal(gt.exact, undefined);
  assert.deepEqual(
    (gt.candidates ?? []).map((c) => c.id).sort(),
    ["amg-gt63se-4door-2026", "amg-gt63se-coupe-2026"]
  );
});

test("EPA's blended “Elec + Gas” figure is never published as an electric range", () => {
  // fueleconomy.gov's rangeA is 11 for the SL and both GT bodies and 9 for
  // the 2017-18 C350e; its own page calls those "Elec + Gas" and prints the
  // all-electric range separately, which is what these rows carry. Mercedes'
  // 2026 SL guide ("Electric range 1 mi (EPA)") and its 2018 C350e
  // specifications ("All-electric range (mi) 0 - 8") say the same.
  const elec = (vin: string, model: string, year: number) =>
    matchEnrichment(decode(vin, model, year), null).exact?.range?.epaRangeMi?.value;
  assert.equal(elec("W1KVK8CB8SF023625", "SL", 2025), 1);
  assert.equal(elec("W1KVK8CB5TF026614", "SL", 2026), 1);
  assert.equal(elec("W1KRJ8CB5SF005507", "Mercedes-AMG GT", 2025), 1);
  assert.equal(elec("W1K7X7KB3SV004895", "Mercedes-AMG GT", 2025), 1);
  assert.equal(elec("W1KAF8AB8SR252245", "C-Class", 2025), 1);
  assert.equal(elec("55SWF4HB7GU165429", "C-Class", 2016), 10);
  assert.equal(elec("55SWF4HB7JU234739", "C-Class", 2018), 8);
});

test("the model years EPA never filed publish no range at all, and say why", () => {
  for (const [vin, model, year] of [
    ["W1KVK8CB2RF022710", "SL", 2024],
    ["W1K7X7KB0RV003701", "Mercedes-AMG GT", 2024],
    ["W1KRJ8CB7VF012978", "Mercedes-AMG GT", 2027],
    ["W1KAF8AB8RR217845", "C-Class", 2024],
    ["W1NWM0BB4VX095098", "G-Class", 2027],
  ] as [string, string, number][]) {
    const row = matchEnrichment(decode(vin, model, year), null).exact;
    assert.ok(row, `${vin} matched nothing`);
    assert.equal(row?.range?.epaRangeMi, undefined, `${row?.id} published a range`);
    assert.equal(row?.range?.mfrRangeMi, undefined, `${row?.id} published a maker range`);
    assert.ok((row?.abstains?.epaRangeMi ?? "").split(/\s+/).length >= 5, `${row?.id} abstained without a reason`);
  }
});

test("the 2027 G 580 carries only its warranty: a changed VIN descriptor with no document behind it publishes nothing else", () => {
  const row = matchEnrichment(decode("W1NWM0BB4VX095098", "G-Class", 2027), null).exact;
  assert.equal(row?.id, "g580-2027");
  assert.equal(row?.battery?.packUsableKwh, undefined);
  assert.equal(row?.battery?.packGrossKwh, undefined);
  assert.equal(row?.charging?.portStandard, undefined);
  assert.equal(row?.warranty?.batteryYears?.value, 8);
  // And the 2026 car, which Mercedes does document, is unaffected by that.
  const y26 = matchEnrichment(decode("W1NWM0AB6TX077300", "G-Class", 2026), null).exact;
  assert.equal(y26?.battery?.packUsableKwh?.value, 116);
  assert.equal(y26?.charging?.portStandard?.value, "CCS1");
  assert.equal(y26?.range?.epaRangeMi?.value, 239);
});
