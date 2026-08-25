// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/rivian-gen2-packs.test.ts
//
// The gen-2 R1 rows published Rivian's GEN-1 pack sizes, because that is what
// Rivian's own Part 565 filing says. Found 2026-08-25: vPIC files no kWh at
// all for MY2025 R1s, and for MY2026 it files the gen-1 usable column against
// gen-2 pack names — 106 for "Standard Pack" (really 92.5), 131 for "Large
// Pack" (really 108), 141 for "Max Pack" (really 140). Every one of those
// three is a row of the gen-1 half of Rivian's usable-capacity table, which is
// what a carried-over spec sheet looks like rather than three measurements.
//
// The control that settles it is EPA range: a pack 14% bigger moves range, and
// nothing moved. R1S Dual Standard (20in) is 258 mi in MY2025 (id 48435) and
// 258 mi in MY2026 (id 49717) — same 277/235 city/highway, same 208 kW motor.
//
// Two claims this pins, because only a human comparing two Rivian support
// articles would catch either one drifting back:
//   1. the gen-2 rows publish Rivian's figures, not vPIC's;
//   2. the gen-1 rows still publish 106/141, which are correct THERE — the
//      bug was one generation borrowing the other's numbers, so a fix that
//      moved both would have been just as wrong.
import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const decode = (over: Partial<VinDecode>): VinDecode => ({ vin: "", usMarket: true, ...over });

// Real VINs off the crawl, so the vin8/vds filters see production input.
const R1S_26_STD = "7PDSGGBA0TN077423"; // vPIC: "Standard Pack", LFP, 106.00
const R1S_26_LARGE = "7PDSGFBA9TN082601"; // vPIC: "Large Pack", 131
const R1S_26_MAX = "7PDSGCBA6TN085647"; // vPIC: "Max Pack", 141

const packKwh = (row: {
  battery?: { packUsableKwh?: { value?: number }; packGrossKwh?: { value?: number } };
}) => row.battery?.packUsableKwh?.value ?? row.battery?.packGrossKwh?.value;

test("the gen-2 Standard pack publishes Rivian's 92.5 usable, not vPIC's gen-1 106", () => {
  const r = matchEnrichment(
    decode({ vin: R1S_26_STD, make: "RIVIAN", model: "R1S", modelYear: 2026, trim: "Standard Pack", driveType: "AWD/All-Wheel Drive", batteryKwhHint: 106 }),
    null
  );
  assert.equal(r.exact?.id, "r1s-2025-26-std");
  assert.equal(packKwh(r.exact!), 92.5);
  // Rivian's own number, cited to the article it came from — not "vin".
  assert.equal(r.exact!.battery?.packUsableKwh?.source, "mfr");
  assert.match(r.exact!.battery!.packUsableKwh!.sourceUrl!, /usable-kwh-capacity/);
});

test("the gen-2 Max pack publishes 140, not the gen-1 141", () => {
  const r = matchEnrichment(
    decode({ vin: R1S_26_MAX, make: "RIVIAN", model: "R1S", modelYear: 2026, trim: "Max Pack", driveType: "AWD/All-Wheel Drive", batteryKwhHint: 141 }),
    null
  );
  assert.equal(r.exact?.id, "r1s-2025-26-max");
  assert.equal(packKwh(r.exact!), 140);
});

test("gen-1 keeps 106 and 141 — those figures are right on THOSE rows", () => {
  const std = matchEnrichment(
    decode({ make: "RIVIAN", model: "R1S", modelYear: 2024, trim: "Standard Pack", driveType: "AWD/All-Wheel Drive" }),
    null
  );
  assert.equal(std.exact?.id, "r1s-2024-std");
  assert.equal(packKwh(std.exact!), 106);

  const max = matchEnrichment(
    decode({ make: "RIVIAN", model: "R1S", modelYear: 2024, trim: "Max Pack", driveType: "AWD/All-Wheel Drive" }),
    null
  );
  assert.equal(max.exact?.id, "r1s-2024-max");
  assert.equal(packKwh(max.exact!), 141);
});

// The reason the old value was left alone for so long: it doubled as a hint
// for match.ts's kWh filter, and the fear was that correcting it would break
// row resolution. It does not. The filter's tolerance is 20%, so a 106 hint
// still admits the 92.5 row (12.7% off) exactly as it admitted the old 106
// one — no ignoreKwhHint, no widened tolerance.
test("a Dual Motor listing with vPIC's 106 hint still reaches the Standard row", () => {
  const r = matchEnrichment(
    decode({ vin: R1S_26_STD, make: "RIVIAN", model: "R1S", modelYear: 2026, trim: "Dual Motor", driveType: "AWD/All-Wheel Drive", batteryKwhHint: 106 }),
    null
  );
  const ids = r.exact ? [r.exact.id] : (r.candidates ?? []).map((c) => c.id);
  assert.ok(ids.includes("r1s-2025-26-std"), `Standard row dropped out: ${ids.join(", ")}`);
});

// And it gets strictly better: at 106 the Standard row sat 19.1% from a 131
// Large hint and survived as a false candidate. At 92.5 it is 29.4% away and
// correctly drops, so a Large car stops offering a Standard pack as a maybe.
test("a Large car's 131 hint no longer keeps the Standard row as a candidate", () => {
  const r = matchEnrichment(
    decode({ vin: R1S_26_LARGE, make: "RIVIAN", model: "R1S", modelYear: 2026, trim: "Dual Motor", driveType: "AWD/All-Wheel Drive", batteryKwhHint: 131 }),
    null
  );
  const ids = r.exact ? [r.exact.id] : (r.candidates ?? []).map((c) => c.id);
  assert.ok(!ids.includes("r1s-2025-26-std"), `Standard row still a candidate: ${ids.join(", ")}`);
  assert.ok(ids.includes("r1s-2025-26-large"));
});
