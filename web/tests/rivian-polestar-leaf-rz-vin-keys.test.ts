// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/rivian-polestar-leaf-rz-vin-keys.test.ts
//
// Four nameplates that were keyed on the dealer's trim string alone, measured
// on the live feed 2026-09-10: 1,226 live Rivians, Polestar 2s, Leafs and
// Lexus RZs arrive with an EMPTY trim field, and 946 of them matched no
// enrichment row at all. `trimMatches` in lib/enrichment/match.ts refuses a
// trim-keyed row for a decode with no trim — deliberately, because a blank
// trim used to let a listing pick up ANY row for its make/model/year — so a
// dealer who leaves the field blank gets a blank card no matter how good the
// research is. The VIN says which car it is; these tests pin what it says.
//
// Every VIN below is a real live listing id off the shard cache, and every
// pattern was decoded against vPIC (DecodeVINValuesBatch, 2026-09-10) before
// it was written into a row. The research note with the position tables is
// docs/agents/research-rivian-polestar-leaf-rz-vin-keys-2026-09-10.md.
import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const d = (over: Partial<VinDecode>): VinDecode => ({ vin: "", usMarket: true, ...over });
const rivian = (vin: string, model: "R1S" | "R1T", modelYear: number, trim?: string): VinDecode =>
  d({ vin, make: "RIVIAN", model, modelYear, trim, driveType: "AWD" });
const polestar = (vin: string, modelYear: number, trim?: string, driveType?: string): VinDecode =>
  d({ vin, make: "POLESTAR", model: "2", modelYear, trim, driveType });
const leaf = (vin: string, modelYear: number, trim?: string): VinDecode =>
  d({ vin, make: "NISSAN", model: "Leaf", modelYear, trim });
const lexus = (vin: string, model: string, modelYear: number, trim?: string): VinDecode =>
  d({ vin, make: "LEXUS", model, modelYear, trim });

const idOf = (r: ReturnType<typeof matchEnrichment>) =>
  r.exact ? r.exact.id : r.candidates ? `candidates:${r.candidates.map((c) => c.id).sort().join("+")}` : "(nothing)";

// ─────────────────────────── RIVIAN ────────────────────────────────────────
// Position 6 is the motor/pack code; position 8 is the equipment package
// (Adventure/Launch/Premium) and says nothing about the powertrain, which is
// why these rows are keyed on `vds` and not on `vin8`.

test("a trimless Rivian resolves off VIN position 6, in every model year", () => {
  const cases: [string, "R1S" | "R1T", number, string][] = [
    ["7PDSGABL1NN000710", "R1S", 2022, "r1s-2022"],
    ["7PDSGABA0PN011389", "R1S", 2023, "r1s-2023-quad"],
    ["7PDSGBBA7PN023755", "R1S", 2023, "r1s-2023-dual"],
    ["7PDSGABA3RN044647", "R1S", 2024, "r1s-2024-quad"],
    ["7PDSGCBA0RN032385", "R1S", 2024, "r1s-2024-max"],
    ["7PDSGCBP9SN062396", "R1S", 2025, "r1s-2025-tri"],
    ["7PDSGGBA4TN087257", "R1S", 2026, "r1s-2026-std"],
    ["7PDSGFBA3TN088250", "R1S", 2026, "r1s-2026-large"],
    ["7PDSGBBP9TN076133", "R1S", 2026, "r1s-2026-tri"],
    ["7PDSGABP5TN076348", "R1S", 2026, "r1s-2026-quad"],
    ["7FCTGAAA4NN007804", "R1T", 2022, "r1t-2022"],
    ["7FCTGBAAXPN028116", "R1T", 2023, "r1t-2023-dual"],
    ["7FCTGCAA4RN030761", "R1T", 2024, "r1t-2024-max"],
    ["7FCTGCAP4SN037817", "R1T", 2025, "r1t-2025-tri"],
    ["7FCTGFAA3TN046118", "R1T", 2026, "r1t-2026-large"],
    ["7FCTGGAA9TN044850", "R1T", 2026, "r1t-2026-std"],
  ];
  for (const [vin, model, year, id] of cases) {
    assert.equal(idOf(matchEnrichment(rivian(vin, model, year), null)), id, `${vin} (${year} ${model})`);
  }
});

// The whole reason B and C could not stay on one 2025-26 row.
test("Rivian codes B and C mean opposite things in 2025 and 2026, and each year's row says so", () => {
  // B: Dual Motor in MY2025 (four packs, hence the base row), Triple in MY2026.
  assert.equal(idOf(matchEnrichment(rivian("7PDSGBBA6SN065388", "R1S", 2025), null)), "r1s-2025-dual");
  assert.equal(idOf(matchEnrichment(rivian("7PDSGBBP9TN076133", "R1S", 2026), null)), "r1s-2026-tri");
  assert.equal(matchEnrichment(rivian("7PDSGBBP9TN076133", "R1S", 2026), null).exact?.range?.epaRangeMi?.value, 371);
  // C: Triple in MY2025, the Dual Max/Large Plus pair in MY2026.
  assert.equal(idOf(matchEnrichment(rivian("7PDSGCBP9SN062396", "R1S", 2025), null)), "r1s-2025-tri");
  assert.equal(idOf(matchEnrichment(rivian("7PDSGCBA0TN078032", "R1S", 2026), null)), "r1s-2026-dualmax");
});

test("where the VIN cannot separate the packs, the base row states what they share and abstains on the rest", () => {
  // MY2024 code B is the Standard, Standard+ and Large packs at once.
  const r = matchEnrichment(rivian("7PDSGBBA5RN039486", "R1S", 2024), null).exact;
  assert.equal(r?.id, "r1s-2024-dual");
  assert.equal(r?.range, undefined);
  assert.equal(r?.battery, undefined);
  assert.match(r!.abstains!.epaRangeMi!, /270, 315 and 352/);
  // It still answers the questions that do not vary: port, heat pump, warranty.
  assert.equal(r?.charging?.portStandard?.value, "CCS1");
  assert.equal(r?.warranty?.batteryYears?.value, 8);

  // MY2026 code C is the Max and the Large Plus, which share a pack part
  // number — so the capacity IS stated and only the range abstains.
  const c = matchEnrichment(rivian("7PDSGCBA0TN078032", "R1S", 2026), null).exact;
  assert.equal(c?.id, "r1s-2026-dualmax");
  assert.equal(c?.battery?.packGrossKwh?.value, 140);
  assert.equal(c?.range, undefined);
  assert.match(c!.abstains!.epaRangeMi!, /63 miles apart/);
  assert.equal(c?.charging?.portStandard?.value, "NACS");
});

// This is the mechanism the whole change turns on, stated as a test: a row
// that carries a trim list is unreachable by a car with no trim, EVEN when
// its VIN key matches. r1s-2024-large is keyed vds ["SGB"] and trim
// ["Large Pack", "Large"]; the VIN below satisfies the vds and still cannot
// reach it. That is why the rows the descriptor settles on its own — quad,
// max, tri, and the whole 2026 line — dropped their trim lists.
test("a trim list on a VIN-keyed row still rejects a blank trim", () => {
  const vin = "7PDSGBBA5RN039486"; // a real MY2024 SGB car
  assert.equal(idOf(matchEnrichment(rivian(vin, "R1S", 2024, "Large Pack"), null)), "r1s-2024-large");
  assert.equal(idOf(matchEnrichment(rivian(vin, "R1S", 2024), null)), "r1s-2024-dual");
});

test("the VIN beats the dealer's trim string", () => {
  // A quad-motor VIN advertised as "- Large Pack" used to take the DUAL
  // Large row's 352 miles. The quad shares that pack and is rated 321.
  const quad = matchEnrichment(rivian("7PDSGABA2RN039195", "R1S", 2024, "- Large Pack"), null);
  assert.equal(quad.exact?.id, "r1s-2024-quad");
  assert.equal(quad.exact?.range?.epaRangeMi?.value, 321);
  // Junk in the trim field cannot dislodge a descriptor either.
  for (const trim of ["Used 2026 Rivian R1S", "Adventure", ""]) {
    assert.equal(idOf(matchEnrichment(rivian("7PDSGGBA4TN087257", "R1S", 2026, trim || undefined), null)), "r1s-2026-std", `trim "${trim}"`);
  }
});

test("a Rivian VIN outside the filed position-6 codes matches nothing rather than a neighbouring pack", () => {
  // Z is filed for no Rivian in any year (whole-alphabet sweep, 2026-09-10).
  assert.equal(idOf(matchEnrichment(rivian("7PDSGZBA0TN078032", "R1S", 2026), null)), "(nothing)");
  assert.equal(idOf(matchEnrichment(rivian("7FCTGZAA0RN030761", "R1T", 2024, "Dual Motor Max Pack"), null)), "(nothing)");
});

// ─────────────────────────── POLESTAR 2 ────────────────────────────────────
// Position 5, not position 8 — the note this replaced said Polestar's VIN
// "doesn't discriminate (every year reads A)", which is true of position 8
// and false of the car.

test("Polestar 2 resolves off VIN position 5 with no trim at all", () => {
  const cases: [string, number, string, number][] = [
    ["LPSED3KA2NL077176", 2022, "polestar2-2022-dual", 249],
    ["LPSEG3KA9NL084441", 2022, "polestar2-2022-single", 270],
    ["YSMED3KA0PL156554", 2023, "polestar2-2023-dual", 260],
    ["YSMET3KA2PL121288", 2023, "polestar2-2023-dual", 260],
    ["YSMEG3KA9PL115265", 2023, "polestar2-2023-single", 270],
    ["YSMFD3KA0RL227761", 2024, "polestar2-2024-dual", 276],
    ["YSMFE3KA0RL234657", 2024, "polestar2-2024-single", 320],
    ["YSMFG3KA9RL210674", 2024, "polestar2-2024-performance", 247],
  ];
  for (const [vin, year, id, mi] of cases) {
    const r = matchEnrichment(polestar(vin, year), null);
    assert.equal(r.exact?.id, id, `${vin} → ${idOf(r)}`);
    assert.equal(r.exact?.range?.epaRangeMi?.value, mi, vin);
  }
});

// MY2023 ET and ED share a row because EPA rates them the same; MY2024's FG
// does not, and it used to be swallowed by the plain dual row's "Performance"
// trim key — 29 miles too many on 15 live cars whose dealer named the pack.
test("the 2024 Performance Pack gets its own 247 miles, whatever the dealer typed", () => {
  for (const trim of [undefined, "Performance Plus", "Long Range Performance Plus", "Long Range"]) {
    const r = matchEnrichment(polestar("YSMFG3KA9RL210674", 2024, trim, "AWD"), null);
    assert.equal(r.exact?.id, "polestar2-2024-performance", `trim "${trim}"`);
    assert.equal(r.exact?.range?.epaRangeMi?.value, 247);
  }
  // And the plain Dual Motor keeps its own figure rather than inheriting it.
  assert.equal(matchEnrichment(polestar("YSMFD3KA0RL227761", 2024, "Performance Plus", "AWD"), null).exact?.range?.epaRangeMi?.value, 276);
});

test("a Polestar 2 VIN with an unfiled position 5 matches nothing", () => {
  assert.equal(idOf(matchEnrichment(polestar("YSMFZ3KA0RL227761", 2024), null)), "(nothing)");
});

// ─────────────────────────── NISSAN LEAF ───────────────────────────────────
// Position 4 is the pack, position 7 the grade — but only from MY2020. Every
// MY2016-19 Leaf reads C at position 7 whatever its grade, which is why
// leaf-s is split at 2020 rather than simply keyed.

test("a trimless Leaf resolves off the pack and grade codes, MY2020 onward", () => {
  const cases: [string, number, string, number][] = [
    ["1N4BZ1BP9LC309618", 2020, "leaf-s-plus", 226],
    ["1N4AZ1CV5MC556273", 2021, "leaf-sv-2021", 149],
    ["1N4BZ1DV2MC555620", 2021, "leaf-sl-plus", 215],
    ["1N4AZ1BV1RC554903", 2024, "leaf-s", 149],
    ["1N4CZ1CV0RC554673", 2024, "leaf-sv-plus-2023-25", 212],
    ["1N4AZ1BV1SC557189", 2025, "leaf-s", 149],
    ["1N4CZ1CV4SC558201", 2025, "leaf-sv-plus-2023-25", 212],
    ["JN1AZ2BA0TM306563", 2026, "leaf-2026-splus", 303],
    ["JN1AZ2CA0TM302544", 2026, "leaf-2026-svplus", 288],
    ["JN1AZ2EB0TM306129", 2026, "leaf-2026-platinum", 259],
  ];
  for (const [vin, year, id, mi] of cases) {
    const r = matchEnrichment(leaf(vin, year), null);
    assert.equal(r.exact?.id, id, `${vin} → ${idOf(r)}`);
    assert.equal(r.exact?.range?.epaRangeMi?.value, mi, vin);
  }
});

test("a 62 kWh Leaf whose dealer wrote plain 'S' is not given the 40 kWh car's range", () => {
  // 1N4BZ1BP9LC309618 is a real live MY2020 S PLUS listed as trim "S". Before
  // the pack code was read it landed on leaf-s and printed 149 miles; the car
  // is rated 226.
  const r = matchEnrichment(leaf("1N4BZ1BP9LC309618", 2020, "S"), null);
  assert.equal(r.exact?.id, "leaf-s-plus");
  assert.equal(r.exact?.range?.epaRangeMi?.value, 226);
});

test("the pre-2020 Leaf keeps its trim key, because position 7 is not yet a grade code", () => {
  // Every MY2018 Leaf is 1N4AZ1CP whatever its grade, so a named grade still
  // resolves and a blank one honestly resolves to nothing.
  assert.equal(matchEnrichment(leaf("1N4AZ1CP0JC307411", 2018, "S"), null).exact?.id, "leaf-s-2018-19");
  assert.equal(idOf(matchEnrichment(leaf("1N4AZ1CP0JC307411", 2018), null)), "(nothing)");
  // And the VIN-keyed MY2020-25 row cannot reach back into that era.
  assert.equal(matchEnrichment(leaf("1N4AZ1BV1SC557189", 2025, "S"), null).exact?.id, "leaf-s");
});

// ─────────────────────────── LEXUS RZ ──────────────────────────────────────

test("a bare-'RZ' listing with no trim reaches its car when the descriptor is unshared", () => {
  // BDADB is the 2026 350e and nothing else; ABABB the 2024-25 300e.
  assert.equal(matchEnrichment(lexus("JTJBDADB0T136EC84", "RZ", 2026), null).exact?.id, "rz-350e-2026");
  assert.equal(matchEnrichment(lexus("JTJABABBXRA005956", "RZ", 2024), null).exact?.id, "rz-300e-2024-25");
});

test("where two versions share a descriptor, the base row carries the shared facts and no range", () => {
  // 2023-25 450e: Lexus filed one pattern for Premium (220 mi) and Luxury (196).
  const base = matchEnrichment(lexus("JTJAAAABXPA011256", "RZ", 2023), null).exact;
  assert.equal(base?.id, "rz-450e-2023-25-base");
  assert.equal(base?.range, undefined);
  assert.equal(base?.battery?.packGrossKwh?.value, 71.4);
  assert.equal(base?.charging?.portStandard?.value, "CCS1");
  assert.match(base!.abstains!.epaRangeMi!, /24 miles apart/);

  // 2026: the 450e and the 550e share BCACB and differ only by badge, so even
  // the pack is withheld.
  const awd = matchEnrichment(lexus("JTJBCACB2TA008874", "RZ", 2026), null).exact;
  assert.equal(awd?.id, "rz-2026-awd-base");
  assert.equal(awd?.range, undefined);
  assert.equal(awd?.battery, undefined);
  assert.equal(awd?.charging?.portStandard?.value, "NACS");
});

test("the RZ base rows never take a grade away from a listing that names one", () => {
  assert.equal(matchEnrichment(lexus("JTJAAAAB3PA007128", "RZ 450e", 2023, "Premium"), null).exact?.id, "rz-450e-2023-25-premium");
  assert.equal(matchEnrichment(lexus("JTJAAAAB3PA007128", "RZ 450e", 2023, "Luxury"), null).exact?.id, "rz-450e-2023-25-luxury");
  assert.equal(matchEnrichment(lexus("JTJBCACB6TA004309", "RZ 550e", 2026), null).exact?.id, "rz-550e-2026");
  assert.equal(matchEnrichment(lexus("JTJBCACB6TA000356", "RZ 450e", 2026), null).exact?.id, "rz-450e-2026");
  // A bare-RZ listing that names the badge still lands on the badge row.
  assert.equal(matchEnrichment(lexus("JTJBCACB6TA004309", "RZ", 2026, "550e F Sport"), null).exact?.id, "rz-550e-2026-alt");
});

test("the 'RZ' alias does not let a base row cross a descriptor boundary", () => {
  // A 2024 bare-RZ car on the 300e's descriptor must not reach the 450e base
  // row, and vice versa.
  assert.equal(matchEnrichment(lexus("JTJABABBXRA005956", "RZ", 2024), null).exact?.id, "rz-300e-2024-25");
  assert.equal(matchEnrichment(lexus("JTJAAAAB2SA030814", "RZ", 2025), null).exact?.id, "rz-450e-2023-25-base");
  // And a descriptor Lexus never filed for the RZ matches none of them.
  assert.equal(idOf(matchEnrichment(lexus("JTJZZZZZ2SA030814", "RZ", 2025), null)), "(nothing)");
});
