// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/commercial-van-vin-guards.test.ts
//
// The commercial vans in lib/enrichment/data11.ts are matched on VIN fields
// rather than on their names, because their names do not work. Three separate
// problems, one file:
//
//   1. vPIC decodes a Ford E-Transit as model "Transit" and a gasoline Transit
//      as model "Transit". The row has to alias the bare nameplate to reach
//      the /vin/ page at all, and the ONLY thing keeping a petrol Transit off
//      an electric van's battery, range and warranty is `vin8` — Ford's engine
//      code, K/M electric against G/8 gasoline.
//   2. The same shape on the Ram: the feed sends 14 listings whose whole model
//      string is "ProMaster", Ram sells a gasoline ProMaster, and those
//      listings carry no trim string at all — so the trim guard that protects
//      the Jeep and Volvo bare-nameplate rows (tests/phev-bare-model-aliases)
//      has nothing to hold onto. Position 8 is Z on the electric van and G on
//      the petrol one.
//   3. BrightDrop arrives under two make strings and two model strings for one
//      physical van, and neither model string says whether it is a 400 or a
//      600 — the feed puts that in the trim, vPIC puts it in `Series`, which
//      the matcher does not read. The `vds` prefix (VIN positions 4-6) is what
//      separates them.
//
// Every VIN pattern asserted here was verified against vPIC's own decoder on
// 2026-08-25, by sweeping each position through its full character set rather
// than by reading a table — no maker publishes one for these vans. Deleting a
// guard to "simplify" a row breaks only the negative half of each pair, which
// is the half nothing else in the repo would notice.
import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const decode = (over: Partial<VinDecode>): VinDecode => ({ vin: "", usMarket: true, ...over });
const idOf = (d: VinDecode) => matchEnrichment(d, null).exact?.id;

// ── Ford E-Transit ─────────────────────────────────────────────────────────

// Live VINs from the feed on 2026-08-25, one per model-year row.
test("an E-Transit reaches its row under every spelling the feed uses, including the bare nameplate", () => {
  const spellings = [
    "Transit", // vPIC's own string — the /vin/ page's decode
    "E-Transit",
    "E-Transit 350",
    "E-Transit-350",
    "E-Transit Cargo Van",
    "E-Transit-350 Cargo",
    "E-Transit-350 Cargo Van",
    "Transit Electric",
  ];
  for (const model of spellings) {
    assert.equal(
      idOf(decode({ make: "FORD", model, modelYear: 2023, vin: "1FTBW1YK5PKB05490" })),
      "e-transit-2022-23",
      model
    );
  }
});

test("a gasoline Transit under the same bare nameplate matches nothing", () => {
  // Position 8 is Ford's engine code: G and 8 are the 3.5 L petrol V6, and
  // vPIC decodes both with no ElectrificationLevel at all. The VIN below is a
  // real 2023 petrol descriptor with a synthetic tail.
  for (const vin8 of ["G", "8"]) {
    const vin = `1FTBW1Y${vin8}5PKB05490`;
    assert.equal(
      matchEnrichment(decode({ make: "FORD", model: "Transit", modelYear: 2023, vin }), null).exact,
      undefined,
      vin
    );
    assert.equal(
      matchEnrichment(decode({ make: "FORD", model: "E-Transit", modelYear: 2023, vin }), null).exact,
      undefined,
      vin
    );
  }
});

test("the E-Transit's year rows split where its battery and heat pump actually changed", () => {
  const at = (year: number, vin8 = "M") =>
    idOf(decode({ make: "FORD", model: "Transit", modelYear: year, vin: `1FTBW1Y${vin8}5PKB05490` }));
  assert.equal(at(2022, "K"), "e-transit-2022-23");
  assert.equal(at(2024), "e-transit-2024");
  assert.equal(at(2025), "e-transit-2025");
  assert.equal(at(2026), "e-transit-2026-27");
  assert.equal(at(2027), "e-transit-2026-27");
});

test("the 2024 E-Transit states no pack size, because both packs shipped that year", () => {
  const r = matchEnrichment(decode({ make: "FORD", model: "E-Transit", modelYear: 2024, vin: "1FTBW1YM5RKB11667" }), null);
  assert.equal(r.exact?.id, "e-transit-2024");
  assert.equal(r.exact?.battery?.packUsableKwh, undefined, "68 and 89.9 kWh both shipped and nothing separates them");
  assert.ok(r.exact?.abstains?.packUsableKwh, "the silence must be declared, not just present");
});

// ── Ram ProMaster EV ───────────────────────────────────────────────────────

test("a bare-model ProMaster reaches the EV row only when its VIN says electric", () => {
  // 3C6MRWAZ — a real live descriptor. Position 8 Z is the electric drive
  // unit; every ?RW? descriptor decodes electric and nothing else decodes on
  // position 8 at all.
  for (const model of [
    "ProMaster",
    "ProMaster 3500", // vPIC's own string
    "ProMaster EV",
    "ProMaster 3500 EV",
    "ProMaster Delivery Van BEV",
    "ProMaster 3500 Delivery Van BEV",
  ]) {
    assert.equal(
      idOf(decode({ make: "RAM", model, modelYear: 2024, vin: "3C6MRWAZ4RE150289" })),
      "ram-promaster-ev-2024-26",
      model
    );
  }
});

test("a gasoline ProMaster under the bare nameplate matches nothing", () => {
  // 3C6MRVBG / 3C6LRVCG — real gasoline descriptors, position 8 G, decoded by
  // vPIC as ProMaster 1500 / 2500 with FuelTypePrimary "Gasoline".
  for (const vin of ["3C6MRVBG4RE150289", "3C6LRVCG0TE163713"]) {
    assert.equal(
      matchEnrichment(decode({ make: "RAM", model: "ProMaster", modelYear: 2024, vin }), null).exact,
      undefined,
      vin
    );
  }
});

// ── BrightDrop Zevo / Chevrolet BrightDrop ─────────────────────────────────

test("a BrightDrop van reaches its row under either make string", () => {
  // Same physical van, two badges: make BRIGHTDROP model "Zevo" (vPIC's own
  // strings for MY2024) and make CHEVROLET model "BrightDrop" (MY2025).
  assert.equal(
    idOf(decode({ make: "BRIGHTDROP", model: "Zevo", modelYear: 2024, vin: "2G5ZJ2TY8R9103436" })),
    "zevo-400-2023-24"
  );
  assert.equal(
    idOf(decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2025, vin: "2G58J2TZ8S9102927" })),
    "brightdrop-400-2025-max"
  );
  assert.equal(
    idOf(decode({ make: "Brightdrop", model: "Zevo 600", modelYear: 2023, vin: "2G5ZJ3HG6P9101641" })),
    "zevo-600-2023-24"
  );
  assert.equal(
    idOf(decode({ make: "Chevrolet", model: "BrightDrop 600", modelYear: 2025, vin: "2G5ZJ3T67S9102725" })),
    "brightdrop-600-2025-std"
  );
});

test("the VIN, not the model string, decides whether a BrightDrop is a 400 or a 600", () => {
  // The bare model string with a 600's VIN must land on a 600 row even though
  // nothing in the name says so — position 6 is the model digit.
  assert.equal(
    idOf(decode({ make: "BRIGHTDROP", model: "Zevo", modelYear: 2024, vin: "2G5ZJ3TY1R9103218" })),
    "zevo-600-2023-24"
  );
  // And a model string that says 400 cannot override a 600's VIN — it matches
  // nothing rather than the wrong van.
  assert.equal(
    matchEnrichment(decode({ make: "CHEVROLET", model: "BrightDrop 400", modelYear: 2025, vin: "2G5ZJ3T67S9102725" }), null).exact,
    undefined
  );
});

test("position 8 separates the BrightDrop's two 2025 packs, and the Max Range row is AWD only", () => {
  // Y = 2 motors + 12 modules, Z = 2 motors + 20 modules, 6 = 1 motor + 12
  // modules, straight out of vPIC's OtherEngineInfo for each pattern.
  const packOf = (vin8: string) =>
    matchEnrichment(
      decode({ make: "CHEVROLET", model: "BrightDrop 400", modelYear: 2025, vin: `2G5ZJ2T${vin8}9S9104258` }),
      null
    ).exact?.battery?.packUsableKwh?.value;
  assert.equal(packOf("Y"), 102.4);
  assert.equal(packOf("6"), 102.4);
  assert.equal(packOf("Z"), 173.3);

  const max = matchEnrichment(
    decode({ make: "CHEVROLET", model: "BrightDrop 400", modelYear: 2025, vin: "2G5ZJ2TZ9S9104258" }),
    null
  ).exact;
  assert.equal(max?.drive, "AWD", "GM sells the Max Range pack on AWD versions only");
});

test("a 2026 BrightDrop states no pack size, because a third pack arrived and vPIC filed no pattern", () => {
  const r = matchEnrichment(
    decode({ make: "CHEVROLET", model: "BrightDrop 600", modelYear: 2026, vin: "2G5ZJ3TY1T9103218" }),
    null
  );
  assert.equal(r.exact?.id, "brightdrop-600-2026");
  assert.equal(r.exact?.battery?.packUsableKwh, undefined);
  assert.ok(r.exact?.abstains?.packUsableKwh);
});

test("folding BrightDrop onto its own make does not swallow a real Chevrolet EV", () => {
  // The whole risk of the MAKE_ALIASES entry: it is keyed on the MODEL string,
  // so a Chevrolet whose model is not a BrightDrop must be untouched.
  const r = matchEnrichment(decode({ make: "CHEVROLET", model: "Equinox EV", modelYear: 2025, trim: "2RS", driveType: "FWD", vin: "3GN7DNRP0SS100000" }), null);
  assert.ok(r.exact || r.candidates?.length, "an Equinox EV must still match its own rows");
  for (const row of [r.exact, ...(r.candidates ?? [])]) {
    if (row) assert.notEqual(row.make, "BRIGHTDROP", row.id);
  }
});

// ── Mercedes-Benz eSprinter ────────────────────────────────────────────────

test("an eSprinter reaches its row under every spelling, including the one a dealer typos", () => {
  for (const model of ["eSprinter", "eSprinter 2500", "Esprinter 2500", "eSprinter Cargo Van", "Esprinter Cargo Van", "eSprinter H.O. Cargo Van", "Sprinter 2500", "Sprinter"]) {
    assert.equal(
      idOf(decode({ make: "MERCEDES-BENZ", model, modelYear: 2025, vin: "W1Y4UCHY4ST221230" })),
      "esprinter-2025-26",
      model
    );
  }
});

test("a diesel or gasoline Sprinter filed under the eSprinter's name matches nothing", () => {
  // VIN position 5 is the powertrain on this WMI, swept through vPIC on
  // 2026-08-25 for MY2024 and MY2025 alike: U and V decode "eSprinter,
  // Electric" (100 kW and 150 kW), while D/E/K/N decode "Sprinter, Diesel"
  // and 0 decodes "Sprinter, Gasoline". The feed already mislabels these vans
  // in the other direction — an electric one typed as "Sprinter 2500" — so
  // the reverse is not hypothetical.
  for (const p5 of ["D", "E", "K", "N", "0"]) {
    const vin = `W1Y4${p5}CHY4ST221230`;
    for (const model of ["eSprinter", "eSprinter 2500", "Esprinter Cargo Van", "Sprinter 2500", "Sprinter"]) {
      assert.equal(
        matchEnrichment(decode({ make: "MERCEDES-BENZ", model, modelYear: 2025, vin }), null).exact,
        undefined,
        `${model} / ${vin}`
      );
    }
  }
});

// ── Mercedes-Benz S-Class plug-in hybrids ──────────────────────────────────

test("the S-Class descriptor splits the S 580e from the AMG S 63 E Performance", () => {
  // 101 live MY2026 listings arrive as model "S-CLASS" with an empty trim, so
  // the vehicle descriptor is the only thing that can tell these apart.
  assert.equal(idOf(decode({ make: "MERCEDES-BENZ", model: "S-CLASS", modelYear: 2026, vin: "W1K6G8CB0TA375859" })), "amg-s63e-2024-26");
  assert.equal(idOf(decode({ make: "MERCEDES-BENZ", model: "S-Class", modelYear: 2026, vin: "W1K6G6KB5TA377502" })), "s580e-2026");
  assert.equal(idOf(decode({ make: "MERCEDES-BENZ", model: "S-Class", modelYear: 2023, vin: "W1K6G6KB6PA199685" })), "s580e-2023");
  assert.equal(idOf(decode({ make: "MERCEDES-BENZ", model: "S-Class", modelYear: 2017, vin: "WDDUG6DB6HA292230" })), "s550e-2015-17");
  assert.equal(idOf(decode({ make: "MERCEDES-BENZ", model: "S-Class", modelYear: 2020, vin: "WDDUG7DB9LA490105" })), "s560e-2019-20");
});

test("a petrol S-Class matches none of the plug-in rows", () => {
  // 6G7GB decodes "S580 4MATIC" with an empty ElectrificationLevel — the
  // gasoline car. Descriptor keys are a hard filter, so it reaches nothing.
  assert.equal(
    matchEnrichment(decode({ make: "MERCEDES-BENZ", model: "S-Class", modelYear: 2026, vin: "W1K6G7GB5TA377502" }), null).exact,
    undefined
  );
});

test("vPIC's 22.7 kWh pattern constant cannot veto the AMG's own 13.1 kWh row", () => {
  // vPIC returns BatteryKWh 22.7 for BOTH S-Class plug-ins, which cannot be
  // true of both. Without ignoreKwhHint the matcher's 20% battery-hint filter
  // would reject the AMG's row outright and the car would show nothing.
  const r = matchEnrichment(
    decode({ make: "MERCEDES-BENZ", model: "S-CLASS", modelYear: 2026, vin: "W1K6G8CB0TA375859", batteryKwhHint: 22.7 }),
    null
  );
  assert.equal(r.exact?.id, "amg-s63e-2024-26");
  assert.equal(r.exact?.battery?.packGrossKwh?.value, 13.1);
});

// ── The vans' shared contract: no EPA range is printed under an EPA label ──

test("no commercial-van row prints a figure in the field labelled EPA range", () => {
  const vanIds = [
    "e-transit-2022-23", "e-transit-2024", "e-transit-2025", "e-transit-2026-27",
    "ram-promaster-ev-2024-26",
    "zevo-400-2023-24", "zevo-600-2023-24",
    "brightdrop-400-2025-std", "brightdrop-400-2025-max",
    "brightdrop-600-2025-std", "brightdrop-600-2025-max",
    "brightdrop-400-2026", "brightdrop-600-2026",
    "esprinter-2024", "esprinter-2025-26",
  ];
  const rows = new Map<string, boolean>();
  for (const id of vanIds) rows.set(id, false);
  // Reach each row through the matcher rather than importing the array, so the
  // test also fails if a row stops being reachable at all.
  const probes: Array<[string, VinDecode]> = [
    ["e-transit-2022-23", decode({ make: "FORD", model: "Transit", modelYear: 2023, vin: "1FTBW1YK5PKB05490" })],
    ["e-transit-2024", decode({ make: "FORD", model: "Transit", modelYear: 2024, vin: "1FTBW1YM9RKB11667" })],
    ["e-transit-2025", decode({ make: "FORD", model: "Transit", modelYear: 2025, vin: "1FTBW9CM6SKA68479" })],
    ["e-transit-2026-27", decode({ make: "FORD", model: "Transit", modelYear: 2026, vin: "1FTBW1YM6SKA76625" })],
    ["ram-promaster-ev-2024-26", decode({ make: "RAM", model: "ProMaster", modelYear: 2025, vin: "3C6MRWAZ4SE530447" })],
    ["zevo-400-2023-24", decode({ make: "BRIGHTDROP", model: "Zevo", modelYear: 2024, vin: "2G5ZJ2TY8R9103436" })],
    ["zevo-600-2023-24", decode({ make: "BRIGHTDROP", model: "Zevo", modelYear: 2023, vin: "2G5ZJ3HG6P9101641" })],
    ["brightdrop-400-2025-std", decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2025, vin: "2G5ZJ2T69S9104258" })],
    ["brightdrop-400-2025-max", decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2025, vin: "2G58J2TZ8S9102927" })],
    ["brightdrop-600-2025-std", decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2025, vin: "2G5ZJ3T67S9102725" })],
    ["brightdrop-600-2025-max", decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2025, vin: "2G5ZJ3TZ5S9100935" })],
    ["brightdrop-400-2026", decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2026, vin: "2G5ZJ2TY8T9103436" })],
    ["brightdrop-600-2026", decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2026, vin: "2G5ZJ3TY1T9103218" })],
    ["esprinter-2024", decode({ make: "MERCEDES-BENZ", model: "eSprinter 2500", modelYear: 2024, vin: "W1Y4UCHY4RT176896" })],
    ["esprinter-2025-26", decode({ make: "MERCEDES-BENZ", model: "Esprinter Cargo Van", modelYear: 2025, vin: "W1Y4UCHY4ST221230" })],
  ];
  for (const [expectId, d] of probes) {
    const row = matchEnrichment(d, null).exact;
    assert.equal(row?.id, expectId, `${expectId} must still be reachable`);
    assert.equal(row?.range?.epaRangeMi, undefined, `${expectId}: no EPA rating exists for this vehicle to print`);
    assert.ok(row?.abstains?.epaRangeMi, `${expectId} must declare why it is silent`);
    assert.ok(
      (row?.buyerNotes ?? []).some((n) => /No EPA range exists/.test(n.headline)),
      `${expectId} must tell the shopper the maker's figure is not an EPA rating`
    );
    rows.set(expectId, true);
  }
  for (const [id, seen] of rows) assert.ok(seen, `${id} was never probed`);
});
