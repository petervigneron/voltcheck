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
    "zevo-400-2024-std"
  );
  assert.equal(
    idOf(decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2025, vin: "2G58J2TZ8S9102927" })),
    "brightdrop-400-2025-max"
  );
  assert.equal(
    idOf(decode({ make: "Brightdrop", model: "Zevo 600", modelYear: 2023, vin: "2G5ZJ3HG6P9101641" })),
    "zevo-600-2023"
  );
  assert.equal(
    idOf(decode({ make: "Chevrolet", model: "BrightDrop 600", modelYear: 2025, vin: "2G5ZJ3T67S9102725" })),
    "brightdrop-600-2025-fwd"
  );
  // MY2026 moves the WMI from 2G5 to 2GC while leaving positions 4-6 alone,
  // so the `vds` key still reaches the row. If this stops passing, the rows
  // were keyed on the WMI by mistake.
  assert.equal(
    idOf(decode({ make: "Chevrolet", model: "BrightDrop 400", modelYear: 2026, vin: "2GCZJ2TZXT9100028" })),
    "brightdrop-400-2026-max"
  );
});

test("the VIN, not the model string, decides whether a BrightDrop is a 400 or a 600", () => {
  // The bare model string with a 600's VIN must land on a 600 row even though
  // nothing in the name says so — position 6 is the model digit.
  assert.equal(
    idOf(decode({ make: "BRIGHTDROP", model: "Zevo", modelYear: 2024, vin: "2G5ZJ3TY1R9103218" })),
    "zevo-600-2024-std"
  );
  // And a model string that says 400 cannot override a 600's VIN — it matches
  // nothing rather than the wrong van.
  assert.equal(
    matchEnrichment(decode({ make: "CHEVROLET", model: "BrightDrop 400", modelYear: 2025, vin: "2G5ZJ3T67S9102725" }), null).exact,
    undefined
  );
});

test("position 8 carries the BrightDrop's pack AND its drivetrain, in every model year", () => {
  // The full vPIC map, re-swept character by character on 2026-08-28 (see the
  // block comment in data11.ts). Each entry is the pack capacity GM publishes
  // for that position-8 code and the drivetrain vPIC decodes for it. A null
  // capacity is a deliberate abstention, not a hole: the Zevo-era guides
  // publish no kWh figure at all and vPIC's module count contradicts GM's.
  const cases: Array<[number, string, string, number | null, string]> = [
    // year, vds prefix + vin8, label, packUsableKwh, drive
    [2023, "2G5ZJ3H" + "G" + "6P9101641", "MY2023 600 ETJ", null, "AWD"],
    [2024, "2G5ZJ2T" + "Y" + "8R9103436", "MY2024 400 std", null, "AWD"],
    [2024, "2G5ZJ2T" + "Z" + "8R9103436", "MY2024 400 max", null, "AWD"],
    [2025, "2G5ZJ2T" + "6" + "9S9104258", "MY2025 400 FWD std", 102.4, "FWD"],
    [2025, "2G5ZJ2T" + "Y" + "9S9104258", "MY2025 400 AWD std", 102.4, "AWD"],
    [2025, "2G5ZJ2T" + "Z" + "9S9104258", "MY2025 400 max", 173.3, "AWD"],
    [2026, "2GCZJ3T" + "6" + "7T9100176", "MY2026 600 FWD std", 102.4, "FWD"],
    [2026, "2GCZJ3T" + "Y" + "7T9100176", "MY2026 600 AWD std", 102.4, "AWD"],
    [2026, "2GCZJ3T" + "X" + "7T9100176", "MY2026 600 FWD ext", 121, "FWD"],
    [2026, "2GCZJ3T" + "7" + "7T9100176", "MY2026 600 AWD ext", 121, "AWD"],
    [2026, "2GCZJ3T" + "Z" + "7T9100176", "MY2026 600 max", 173.3, "AWD"],
  ];
  for (const [year, vin, label, kwh, drive] of cases) {
    const row = matchEnrichment(decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: year, vin }), null).exact;
    assert.ok(row, `${label}: no row matched`);
    assert.equal(row?.battery?.packUsableKwh?.value ?? null, kwh, `${label}: pack`);
    assert.equal(row?.drive, drive, `${label}: drivetrain`);
    if (kwh === null) assert.ok(row?.abstains?.packUsableKwh, `${label}: silence on the pack must be declared`);
  }
});

test("every BrightDrop row that can name a version prints GM's own range figure", () => {
  // The regression this pins is not a wrong number, it is an empty field. For
  // months every one of these rows printed no range at all and a paragraph
  // explaining why, because the only range field in the schema was named
  // epaRangeMi and no EPA rating exists for this van. GM publishes a figure
  // for every configuration below; `mfrRangeMi` is where it goes.
  const cases: Array<[number, string, number, string]> = [
    [2023, "2G5ZJ3H" + "G" + "6P9101641", 250, "MY2023 600, ETJ standard that year"],
    [2024, "2G5ZJ2T" + "Y" + "8R9103436", 200, "MY2024 400, EW2 standard pack"],
    [2024, "2G5ZJ2T" + "Z" + "8R9103436", 250, "MY2024 400, ETJ 20-module pack"],
    [2025, "2G5ZJ2T" + "6" + "9S9104258", 177, "MY2025 400 FWD"],
    [2025, "2G5ZJ2T" + "Y" + "9S9104258", 175, "MY2025 400 AWD — lower than FWD"],
    [2025, "2G5ZJ3T" + "6" + "7S9102725", 174, "MY2025 600 FWD"],
    [2025, "2G5ZJ3T" + "Y" + "7S9102725", 179, "MY2025 600 AWD — higher than FWD"],
    [2025, "2G5ZJ2T" + "Z" + "9S9104258", 272, "MY2025 max"],
    [2026, "2GCZJ3T" + "Y" + "7T9100176", 176, "MY2026 standard"],
    [2026, "2GCZJ3T" + "X" + "7T9100176", 204, "MY2026 extended"],
    [2026, "2GCZJ3T" + "Z" + "7T9100176", 285, "MY2026 max"],
  ];
  for (const [year, vin, miles, label] of cases) {
    const row = matchEnrichment(decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: year, vin }), null).exact;
    assert.equal(row?.range?.mfrRangeMi?.value, miles, label);
    assert.equal(row?.range?.mfrRangeMi?.source, "mfr", `${label}: must be GM's own figure, never ours`);
    assert.equal(row?.range?.epaRangeMi, undefined, `${label}: there is no EPA rating to print`);
  }
  // The 400 and the 600 do not rank the same way round on drivetrain — 400 FWD
  // beats 400 AWD, 600 AWD beats 600 FWD. One shared figure for both models
  // was wrong on three of the four numbers, which is why this is asserted.
  const r = (year: number, vin: string) =>
    matchEnrichment(decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: year, vin }), null).exact?.range
      ?.mfrRangeMi?.value ?? 0;
  assert.ok(r(2025, "2G5ZJ2T69S9104258") > r(2025, "2G5ZJ2TY9S9104258"), "400: FWD out-ranges AWD");
  assert.ok(r(2025, "2G5ZJ3TY7S9102725") > r(2025, "2G5ZJ3T67S9102725"), "600: AWD out-ranges FWD");
});

test("the 2026 BrightDrop states no DC charge time, because GM's own guide states two", () => {
  // GM's 26MY body-builder guide prints two rows with the identical label
  // "Low-80% Time to Charge", one reading 36/33/70 minutes and the next
  // 90/85/110, with no condition separating them. Picking the friendlier row
  // would be choosing a number because it flatters the van. The MY2025 guide
  // has one unambiguous row and that year does print a figure.
  const at = (year: number, vin: string) =>
    matchEnrichment(decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: year, vin }), null).exact?.charging;
  assert.equal(at(2026, "2GCZJ3TY7T9100176")?.chargeTimeTo80Min, undefined);
  assert.equal(at(2025, "2G5ZJ2T69S9104258")?.chargeTimeTo80Min?.value, 45);
  assert.equal(at(2025, "2G5ZJ2TZ9S9104258")?.chargeTimeTo80Min?.value, 70);
  // GM defines its "low" as 15-20 miles of range remaining, which is not 10%,
  // so it must never land in the 10-80% field.
  assert.equal(at(2025, "2G5ZJ2T69S9104258")?.chargeTime1080Min, undefined);
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

// ── The vans' shared contract ──────────────────────────────────────────────
//
// These vehicles sit above EPA's light-duty labelling threshold, so none of
// them has an EPA range rating and none of them ever will until EPA rates it.
// Three things follow, and the third one is new as of 2026-08-28:
//
//   1. No van row may print a figure in `epaRangeMi`. That field means "EPA
//      rated this car at N miles" and saying it about a van EPA never touched
//      is a false claim, whatever the number.
//   2. Each row must still answer the shopper: either it carries the maker's
//      own published figure in `mfrRangeMi`, or it declares in `abstains` why
//      silence is the honest answer. Doing neither is the hole.
//   3. A row carrying `mfrRangeMi` must NOT also carry a note explaining that
//      no EPA range exists. That pairing is what this file used to require,
//      and it was the wrong shape: a paragraph reporting an absence, printed
//      where a number belonged. Once the number is on the page the paragraph
//      is dead weight, and the site's copy rule (CLAUDE.md, "If there is
//      nothing to say, print nothing") forbids it.
//
// The three rows still abstaining do so for reasons that survive scrutiny and
// are not the BrightDrop's old reason. Ford's figures are per roof height and
// nothing resolves a listing's roof; Ram publishes 162, 164 and 180 across its
// own surfaces with inconsistent footnotes; Mercedes footnotes one pair of
// numbers as both EPA-MCT-consistent and as a European procedure whose
// "U.S.-specific figures will be announced closer to launch". Each needs its
// own research pass, not a guess.

test("no commercial-van row prints a figure in the field labelled EPA range", () => {
  const vanIds = [
    "e-transit-2022-23", "e-transit-2024", "e-transit-2025", "e-transit-2026-27",
    "ram-promaster-ev-2024-26",
    "zevo-600-2023", "zevo-400-2024-std", "zevo-400-2024-max", "zevo-600-2024-std", "zevo-600-2024-max",
    "brightdrop-400-2025-fwd", "brightdrop-400-2025-awd", "brightdrop-400-2025-max",
    "brightdrop-600-2025-fwd", "brightdrop-600-2025-awd", "brightdrop-600-2025-max",
    "brightdrop-400-2026-std-awd", "brightdrop-400-2026-ext-awd", "brightdrop-400-2026-max",
    "brightdrop-600-2026-std-awd", "brightdrop-600-2026-ext-awd", "brightdrop-600-2026-max",
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
    ["zevo-600-2023", decode({ make: "BRIGHTDROP", model: "Zevo", modelYear: 2023, vin: "2G5ZJ3HG6P9101641" })],
    ["zevo-400-2024-std", decode({ make: "BRIGHTDROP", model: "Zevo", modelYear: 2024, vin: "2G5ZJ2TY8R9103436" })],
    ["zevo-400-2024-max", decode({ make: "BRIGHTDROP", model: "Zevo", modelYear: 2024, vin: "2G5ZJ2TZ8R9103436" })],
    ["zevo-600-2024-std", decode({ make: "BRIGHTDROP", model: "Zevo", modelYear: 2024, vin: "2G5ZJ3TY1R9103218" })],
    ["zevo-600-2024-max", decode({ make: "BRIGHTDROP", model: "Zevo", modelYear: 2024, vin: "2G5ZJ3TZ1R9103218" })],
    ["brightdrop-400-2025-fwd", decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2025, vin: "2G5ZJ2T69S9104258" })],
    ["brightdrop-400-2025-awd", decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2025, vin: "2G5ZJ2TY9S9104258" })],
    ["brightdrop-400-2025-max", decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2025, vin: "2G58J2TZ8S9102927" })],
    ["brightdrop-600-2025-fwd", decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2025, vin: "2G5ZJ3T67S9102725" })],
    ["brightdrop-600-2025-awd", decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2025, vin: "2G5ZJ3TY7S9102725" })],
    ["brightdrop-600-2025-max", decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2025, vin: "2G5ZJ3TZ5S9100935" })],
    ["brightdrop-400-2026-std-awd", decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2026, vin: "2GCZJ2TY4T9100033" })],
    ["brightdrop-400-2026-ext-awd", decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2026, vin: "2GCZJ2T74T9100033" })],
    ["brightdrop-400-2026-max", decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2026, vin: "2GCZJ2TZXT9100028" })],
    ["brightdrop-600-2026-std-awd", decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2026, vin: "2GCZJ3TY7T9100176" })],
    ["brightdrop-600-2026-ext-awd", decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2026, vin: "2GCZJ3T77T9100176" })],
    ["brightdrop-600-2026-max", decode({ make: "CHEVROLET", model: "BrightDrop", modelYear: 2026, vin: "2GCZJ3TZ7T9100176" })],
    ["esprinter-2024", decode({ make: "MERCEDES-BENZ", model: "eSprinter 2500", modelYear: 2024, vin: "W1Y4UCHY4RT176896" })],
    ["esprinter-2025-26", decode({ make: "MERCEDES-BENZ", model: "Esprinter Cargo Van", modelYear: 2025, vin: "W1Y4UCHY4ST221230" })],
  ];
  for (const [expectId, d] of probes) {
    const row = matchEnrichment(d, null).exact;
    assert.equal(row?.id, expectId, `${expectId} must still be reachable`);
    assert.equal(row?.range?.epaRangeMi, undefined, `${expectId}: no EPA rating exists for this vehicle to print`);

    const mfr = row?.range?.mfrRangeMi;
    const absenceNote = (row?.buyerNotes ?? []).filter((n) => /No EPA range/i.test(n.headline));
    if (mfr) {
      assert.equal(mfr.source, "mfr", `${expectId}: mfrRangeMi must be the maker's own figure, never ours`);
      assert.ok(mfr.sourceUrl, `${expectId}: an unsourced range claim is the thing this field exists to prevent`);
      assert.ok(
        !row?.abstains?.epaRangeMi,
        `${expectId} both prints a range and declares itself silent on range — one of the two is stale`
      );
      assert.equal(
        absenceNote.length,
        0,
        `${expectId} prints ${mfr.value} miles AND a paragraph saying no range exists — see the contract above`
      );
    } else {
      assert.ok(
        row?.abstains?.epaRangeMi,
        `${expectId} shows no range and does not say why — that is the hole, not a decision`
      );
    }
    rows.set(expectId, true);
  }
  for (const [id, seen] of rows) assert.ok(seen, `${id} was never probed`);
});
