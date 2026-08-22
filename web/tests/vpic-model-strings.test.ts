// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/vpic-model-strings.test.ts
//
// A listing page resolves its enrichment row from the DEALER FEED's model
// string. /vin/<vin> resolves it from vPIC's. The two disagree more often
// than anyone had checked, and when they do the VIN page finds nothing and
// prints "No researched row for this model yet" — the same words it uses for
// a car nobody has researched. No error, no log line, nothing a reader could
// tell apart.
//
// Found 2026-08-22 by opening voltcheck.net/vin/JTDACACU4P3005078, a 2023
// Prius Prime, while verifying an unrelated deploy. Sweeping every covered
// nameplate against a live decode (scraper/vpic-model-alias-check.mjs) turned
// up 19, including the F-150 Lightning, Equinox EV and Kona Electric.
//
// This drives the REAL matcher, not a string comparison, because the point is
// what the page resolves — several of these land on their row through a `vds`
// or `vin8` filter that only runs AFTER the model string matches.
import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const decode = (d: Partial<VinDecode>): VinDecode => ({ vin: "X".repeat(17), usMarket: true, ...d });

// [label, vPIC's own model string, the decode, the row it must reach].
// Every VIN here was decoded through vPIC on 2026-08-22, so a future reader
// can re-run the check rather than trust the comment.
const REACHABLE: Array<[string, VinDecode, string]> = [
  ["Prius Prime — vPIC suffixes the nameplate",
   decode({ make: "TOYOTA", model: "Prius Prime (PHEV)", modelYear: 2023, vin: "JTDACACU4P3005078" }), "prius-prime-2023-25-base"],
  ["Ariya — vPIC appends a body style",
   decode({ make: "NISSAN", model: "Ariya Hatchback", modelYear: 2024, vin: "JN1AF0BA9RM431891" }), "ariya-63-fwd"],
  ["Ariya — and a different one on other cars",
   decode({ make: "NISSAN", model: "Ariya MPV", modelYear: 2023, vin: "JN1BF0BA5PM402566" }), "ariya-87-fwd"],
  ["Bolt EV — vPIC drops the EV",
   decode({ make: "CHEVROLET", model: "Bolt", modelYear: 2018 }), "bolt-ev-2017-2019"],
  ["C40 — vPIC drops Recharge Pure Electric",
   decode({ make: "VOLVO", model: "C40", modelYear: 2023 }), "c40-recharge-2022-23"],
  ["Hummer EV — vPIC names the body",
   decode({ make: "GMC", model: "Hummer EV Pickup", modelYear: 2024 }), "hummer-ev-pickup"],
];

for (const [label, d, expectId] of REACHABLE) {
  test(`${label}: "${d.model}" reaches ${expectId}`, () => {
    const r = matchEnrichment(d, null);
    const got = r.exact?.id ?? (r.candidates?.length ? `candidates(${r.candidates.map((c) => c.id).join(",")})` : "NOTHING");
    assert.equal(got, expectId, `the /vin/ page decodes this car as "${d.model}"`);
  });
}

// The other half, and the more important one. vPIC also strips the badge off
// nameplates a COMBUSTION car shares — "Kona Electric" decodes as "Kona",
// "F-150 Lightning" as "F-150", "Equinox EV" as "Equinox". Aliasing those
// would fix the VIN page by making a petrol Kona print an EV's battery,
// range and charging facts, which is a worse bug than the one it fixes: the
// /vin/ page decodes whatever VIN a visitor types, so unlike the listing
// feed there is no classifyEv upstream keeping combustion cars out.
//
// So they stay unreachable ON PURPOSE, and this pins that. If a future pass
// makes them match, it must be on the strength of vPIC's own
// electrificationLevel (VinDecode carries it) — not a bare-name alias.
const MUST_NOT_MATCH: Array<[string, VinDecode]> = [
  ["Kona", decode({ make: "HYUNDAI", model: "Kona", modelYear: 2023 })],
  ["F-150", decode({ make: "FORD", model: "F-150", modelYear: 2023 })],
  ["Equinox", decode({ make: "CHEVROLET", model: "Equinox", modelYear: 2025 })],
  ["Wrangler", decode({ make: "JEEP", model: "Wrangler", modelYear: 2023 })],
  ["Rogue", decode({ make: "NISSAN", model: "Rogue", modelYear: 2025 })],
];

for (const [name, d] of MUST_NOT_MATCH) {
  test(`a bare "${name}" stays unmatched — a petrol car answers to that name too`, () => {
    const r = matchEnrichment(d, null);
    assert.equal(r.exact, undefined, `"${name}" must not resolve an EV row on the model string alone`);
    assert.ok(!r.candidates?.length, `"${name}" must not offer EV candidates on the model string alone`);
  });
}
