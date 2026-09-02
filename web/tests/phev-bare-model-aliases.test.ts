// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/phev-bare-model-aliases.test.ts
//
// Plug-in hybrids reach the feed under the nameplate they share with a petrol
// car, with the plug-in badge in the TRIM rather than the model: model
// "Wrangler", trim "Sport S 4xe". Matching those was worth doing — 203 live
// listings on 2026-08-23 (139 Wrangler, 64 Grand Cherokee) had no enrichment
// row at all because of it — but the obvious way to do it is unsafe, and the
// safe way looks like an accident to anyone reading the rows later. Hence
// this file.
//
// The unsafe way is a bare `modelAliases: ["Wrangler"]` on a row with no trim
// key. The feed can't produce a petrol Wrangler (scraper/lib/ev.mjs's
// classifyEv never admits one), which is what makes it look harmless — but
// matchEnrichment is also what /vin/ runs, on whatever VIN a shopper pastes
// in, and vPIC decodes a petrol Wrangler to exactly make JEEP, model
// "Wrangler", trim "Sahara". A trim-less alias hands that car the 4xe's 22
// electric miles. That is the matching-the-wrong-thing failure, on the site,
// in the direction that costs a shopper money.
//
// So the bare-model rows carry `trim: ["4xe"]`, and these tests pin both
// halves of that contract: the listing shapes the feed actually sends must
// match, and a petrol car wearing the same nameplate must not. Deleting the
// trim key to "simplify" the rows breaks the second half only, which is the
// half nothing else would notice.
//
// scripts/phev-enrichment-gap.mjs is the running-count version of the first
// half, against the live feed. This file is the part that must hold whatever
// today's inventory happens to contain.
import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const decode = (over: Partial<VinDecode>): VinDecode => ({ vin: "", usMarket: true, ...over });
const idOf = (d: VinDecode) => matchEnrichment(d, null).exact?.id;

// Trim strings taken verbatim from the live feed on 2026-08-23, including the
// abbreviation and the casing variants, because those are what actually has
// to match — not a tidied-up version of them.
const WRANGLER_TRIMS = [
  "Unlimited Sahara 4XE",
  "Unltd Rubicon 4XE",
  "Unlimited 4XE",
  "Sahara 4XE",
  "Rubicon 4xe",
  "Sport S 4xe",
  "Sport 4XE",
  "Willys 4xe",
  "High Altitude 4xe",
  "4XE",
];

test("a bare-model Wrangler whose trim names 4xe resolves to the 4xe row", () => {
  for (const trim of WRANGLER_TRIMS) {
    assert.equal(idOf(decode({ make: "JEEP", model: "Wrangler", modelYear: 2024, trim })), "wrangler-4xe-2022-25-alt", trim);
  }
  // The feed sends the four-door under both names; the 4xe was four-door only
  // and the two 4xe rows print identical facts, so one alt row covers both.
  assert.equal(
    idOf(decode({ make: "JEEP", model: "Wrangler Unlimited", modelYear: 2022, trim: "Sahara 4xe" })),
    "wrangler-4xe-2022-25-alt"
  );
  // The alt row splits at the same warranty boundary as the full-name rows.
  assert.equal(idOf(decode({ make: "JEEP", model: "Wrangler", modelYear: 2021, trim: "Sahara 4XE" })), "wrangler-4xe-2021-alt");
});

test("a petrol Wrangler under the same bare model matches nothing", () => {
  // The /vin/ shape: vPIC's decode of a gas Wrangler, which names a trim that
  // says nothing about a plug. Silence is the only honest answer.
  for (const trim of ["Sahara", "Rubicon", "Sport S", "Willys", "High Altitude"]) {
    assert.equal(matchEnrichment(decode({ make: "JEEP", model: "Wrangler", modelYear: 2024, trim }), null).exact, undefined, trim);
  }
  // And a decode with no trim at all can't fall through into the row either.
  assert.equal(matchEnrichment(decode({ make: "JEEP", model: "Wrangler", modelYear: 2024 }), null).exact, undefined);
});

test("the same contract holds for the bare-model Grand Cherokee", () => {
  for (const trim of ["4XE", "Overland 4XE", "Trailhawk 4XE", "Summit 4XE"]) {
    assert.equal(idOf(decode({ make: "JEEP", model: "Grand Cherokee", modelYear: 2023, trim })), "gc-4xe-2022-25-alt", trim);
  }
  for (const trim of ["Limited", "Overland", "Summit Reserve", "Trailhawk"]) {
    assert.equal(matchEnrichment(decode({ make: "JEEP", model: "Grand Cherokee", modelYear: 2023, trim }), null).exact, undefined, trim);
  }
});

test("the model strings that name the plug-in themselves keep matching without a trim", () => {
  // These need no guard — the model has already said which car it is — and
  // they must not have picked one up by accident from the rows above.
  assert.equal(idOf(decode({ make: "JEEP", model: "Wrangler 4xe", modelYear: 2023 })), "wrangler-4xe-2022-25");
  assert.equal(idOf(decode({ make: "JEEP", model: "Wrangler Unlimited 4xe", modelYear: 2022 })), "wrangler-unl-4xe-2022-25");
  assert.equal(idOf(decode({ make: "JEEP", model: "Grand Cherokee 4xe", modelYear: 2024 })), "gc-4xe-2022-25");
  assert.equal(idOf(decode({ make: "JEEP", model: "GR Cherokee 4XE", modelYear: 2024 })), "gc-4xe-2022-25");
});

// ── The battery term is not one term (2026-09-01). Until this split, all six
// Wrangler 4xe rows carried 8 years/100,000 miles across 2021-2025. The 2021
// booklet has no 8-year figure in it at all: 10 years/100,000 miles outside
// ZEV states, 10 years/150,000 miles inside them. That understated every 2021
// truck by two years, and warranty.ts reads exactly these two values to tell a
// shopper whether the coverage on the car in front of them is still alive.
//
// The years are pinned per model year rather than per row id because the id is
// bookkeeping and the number is the claim — a future re-split that keeps the
// terms right may rename every row here, and should not have to touch this.
test("the Wrangler 4xe battery term splits at the 2021/2022 boundary", () => {
  const term = (modelYear: number, model: string, trim?: string) => {
    const w = matchEnrichment(decode({ make: "JEEP", model, modelYear, trim }), null).exact?.warranty;
    return [w?.batteryYears?.value, w?.batteryMiles?.value];
  };
  // All three spellings the feed and vPIC produce, since a shopper reaching
  // the same truck by a different name must not get a different answer.
  const spellings: [string, string | undefined][] = [
    ["Wrangler 4xe", undefined],
    ["Wrangler Unlimited 4xe", undefined],
    ["Wrangler", "Sahara 4XE"],
  ];
  for (const [model, trim] of spellings) {
    assert.deepEqual(term(2021, model, trim), [10, 100_000], `2021 ${model}`);
    for (const y of [2022, 2023, 2024, 2025]) {
      assert.deepEqual(term(y, model, trim), [8, 100_000], `${y} ${model}`);
    }
  }
  // 100,000 is the non-ZEV mileage limit, and it is the one every truck has
  // wherever it is registered. The longer 150,000-mile term is conditional on
  // the state of registration, which this site does not know — claiming it
  // would tell a 120,000-mile truck outside a ZEV state that it is covered.
  for (const [model, trim] of spellings) {
    for (const y of [2021, 2022, 2023, 2024, 2025]) {
      assert.notEqual(term(y, model, trim)[1], 150_000, `${y} ${model}`);
    }
  }
});

test("an X5 that says PHEV in its model resolves without a trim; a bare X5 still needs one", () => {
  // BMW sold exactly one X5 plug-in in each window — the xDrive45e through
  // 2023, the xDrive50e from 2024 — so on a model string that has already
  // said "PHEV" the trim narrows nothing, and requiring it only refused the
  // 23 live 2026 listings that arrive with no trim at all.
  assert.equal(idOf(decode({ make: "BMW", model: "X5 PHEV", modelYear: 2026 })), "x5-50e-2024-26");
  assert.equal(idOf(decode({ make: "BMW", model: "X5 PHEV", modelYear: 2022 })), "x5-45e-2021-23");
  assert.equal(idOf(decode({ make: "BMW", model: "X5 PHEV", modelYear: 2026, trim: "xDrive50e" })), "x5-50e-2024-26");
  assert.equal(idOf(decode({ make: "BMW", model: "X5 xDrive50e", modelYear: 2025, trim: "Plug-In Hybrid" })), "x5-50e-2024-26");
  // The bare "X5" rows keep their guard: a petrol xDrive40i must not match.
  assert.equal(idOf(decode({ make: "BMW", model: "X5", modelYear: 2026, trim: "xDrive50e" })), "x5-50e-2024-26-alt");
  assert.equal(matchEnrichment(decode({ make: "BMW", model: "X5", modelYear: 2026, trim: "xDrive40i" }), null).exact, undefined);
  assert.equal(matchEnrichment(decode({ make: "BMW", model: "X5", modelYear: 2026 }), null).exact, undefined);
});

// ── The 2026-08-23 tranche (data6.ts) repeated the contract across nine
// makes. Same two halves as the Wrangler tests above: the feed's real
// bare-model shapes must resolve, and the petrol car sharing the nameplate
// must not — with trim strings taken verbatim from the live feed.
test("bare-model shapes from the data6 tranche resolve through their trim guards", () => {
  assert.equal(idOf(decode({ make: "MERCEDES-BENZ", model: "GLC", modelYear: 2025, trim: "350e 4MATIC®" })), "glc-350e-2025-27-alt");
  assert.equal(idOf(decode({ make: "MERCEDES-BENZ", model: "GLE", modelYear: 2025, trim: "450e Plug-In Hybrid 4MATIC®" })), "gle-450e-2025-alt");
  assert.equal(idOf(decode({ make: "BMW", model: "5 Series", modelYear: 2026, trim: "550e xDrive" })), "550e-2026-27-alt");
  assert.equal(idOf(decode({ make: "BMW", model: "5-Series", modelYear: 2022, trim: "530e xDrive" })), "530e-xdrive-2021-23-alt");
  assert.equal(idOf(decode({ make: "BMW", model: "3 Series", modelYear: 2023, trim: "330e xDrive" })), "330e-xdrive-2023-24-alt");
  assert.equal(idOf(decode({ make: "BMW", model: "7 Series", modelYear: 2026, trim: "750e xDrive" })), "750e-2026-alt");
  assert.equal(idOf(decode({ make: "MAZDA", model: "CX-90", modelYear: 2025, trim: "Premium Phev" })), "cx-90-phev-2024-25-alt");
  assert.equal(idOf(decode({ make: "MAZDA", model: "Mazda CX-90 PHEV", modelYear: 2025, trim: "Premium Plus" })), "cx-90-phev-2024-25");
  assert.equal(idOf(decode({ make: "KIA", model: "Sorento", modelYear: 2023, trim: "SX Prestige Phev" })), "sorento-phev-2022-24-alt");
  assert.equal(idOf(decode({ make: "HYUNDAI", model: "Tucson", modelYear: 2023, trim: "SEL Phev" })), "tucson-phev-2022-24-alt");
  assert.equal(idOf(decode({ make: "MITSUBISHI", model: "Outlander", modelYear: 2024, trim: "SE Phev" })), "outlander-phev-2023-25-alt");
  assert.equal(idOf(decode({ make: "LEXUS", model: "NX", modelYear: 2024, trim: "450h+ Premium" })), "nx-450h-plus-2022-25-alt");
  assert.equal(idOf(decode({ make: "PORSCHE", model: "Cayenne", modelYear: 2022, trim: "E-Hybrid" })), "cayenne-ehybrid-2021-22-alt");
  // "Turbo" alone names a different E-Hybrid on either side of the facelift;
  // the year windows are what disambiguate it.
  assert.equal(idOf(decode({ make: "PORSCHE", model: "Cayenne", modelYear: 2022, trim: "Turbo" })), "cayenne-turbos-ehybrid-2021-23-alt");
  assert.equal(idOf(decode({ make: "PORSCHE", model: "Cayenne", modelYear: 2025, trim: "Turbo" })), "cayenne-turbo-ehybrid-2025-alt");
  // A "Cayenne E-Hybrid" whose trim names the S variant resolves to the S
  // row via the guarded alias; without a trim it stays the base variant.
  assert.equal(idOf(decode({ make: "PORSCHE", model: "Cayenne E-Hybrid", modelYear: 2025, trim: "S" })), "cayenne-s-ehybrid-2025-alt");
  assert.equal(idOf(decode({ make: "PORSCHE", model: "Cayenne E-Hybrid", modelYear: 2025 })), "cayenne-ehybrid-2025");
});

test("the petrol cars sharing those nameplates match nothing", () => {
  assert.equal(matchEnrichment(decode({ make: "MERCEDES-BENZ", model: "GLC", modelYear: 2025, trim: "300 4MATIC" }), null).exact, undefined);
  assert.equal(matchEnrichment(decode({ make: "MERCEDES-BENZ", model: "GLE", modelYear: 2025, trim: "450 4MATIC" }), null).exact, undefined);
  assert.equal(matchEnrichment(decode({ make: "BMW", model: "5 Series", modelYear: 2026, trim: "540i xDrive" }), null).exact, undefined);
  assert.equal(matchEnrichment(decode({ make: "BMW", model: "3 Series", modelYear: 2023, trim: "330i" }), null).exact, undefined);
  assert.equal(matchEnrichment(decode({ make: "MAZDA", model: "CX-90", modelYear: 2025, trim: "Premium Plus" }), null).exact, undefined);
  assert.equal(matchEnrichment(decode({ make: "KIA", model: "Sorento", modelYear: 2023, trim: "SX Prestige" }), null).exact, undefined);
  assert.equal(matchEnrichment(decode({ make: "HYUNDAI", model: "Tucson", modelYear: 2023, trim: "SEL" }), null).exact, undefined);
  assert.equal(matchEnrichment(decode({ make: "MITSUBISHI", model: "Outlander", modelYear: 2024, trim: "SE" }), null).exact, undefined);
  assert.equal(matchEnrichment(decode({ make: "LEXUS", model: "NX", modelYear: 2024, trim: "350h Premium" }), null).exact, undefined);
  assert.equal(matchEnrichment(decode({ make: "PORSCHE", model: "Cayenne", modelYear: 2022, trim: "GTS" }), null).exact, undefined);
  assert.equal(matchEnrichment(decode({ make: "PORSCHE", model: "Cayenne", modelYear: 2022, trim: "Platinum Edition" }), null).exact, undefined);
  // And the no-trim decodes can't fall through into any guarded row.
  for (const [make, model] of [
    ["MERCEDES-BENZ", "GLC"], ["BMW", "5 Series"], ["MAZDA", "CX-90"], ["KIA", "Sorento"],
    ["HYUNDAI", "Tucson"], ["MITSUBISHI", "Outlander"], ["LEXUS", "NX"], ["PORSCHE", "Cayenne"],
  ] as const) {
    assert.equal(matchEnrichment(decode({ make, model, modelYear: 2023 }), null).exact, undefined, `${make} ${model}`);
  }
});

test("a split-year 2022 Volvo T8 resolves to candidates, one per pack, never a guess", () => {
  const r = matchEnrichment(decode({ make: "VOLVO", model: "XC90 Recharge Plug-In Hybrid", modelYear: 2022, trim: "Inscription" }), null);
  assert.equal(r.exact, undefined);
  assert.deepEqual((r.candidates ?? []).map((c) => c.id).sort(), ["xc90-t8-2022-er", "xc90-t8-2022-std"]);
  // Outside the split year the same shape resolves exactly.
  assert.equal(idOf(decode({ make: "VOLVO", model: "XC90 Recharge Plug-In Hybrid", modelYear: 2023, trim: "Ultimate" })), "xc90-t8-2023-26");
  assert.equal(idOf(decode({ make: "VOLVO", model: "XC90 plug-in hybrid", modelYear: 2026, trim: "T8 Plus 7-Seater" })), "xc90-t8-2023-26");
});

// ── Bare "XC90"/"XC60" (data6, 2026-08-25). 1,356 live listings file the T8
// under the nameplate its petrol B5/B6 sibling shares, with the plug-in badge
// buried in a comma-separated trim. The guard is narrower than the Wrangler's
// on purpose: every T8 GRADE name is also a petrol grade name, and
// trimStringsOverlap is substring-tolerant in both directions, so only the two
// tokens that name the powertrain and nothing else can be keyed.
const VOLVO_BARE_T8_TRIMS = [
  "Plus, T8 AWD Plug-in hybrid, Electric/Gasoline, Bright, 7 Seats",
  "Recharge Plus, T8 AWD Plug-in hybrid, Electric/Gasoline, Bright, 6 Seats",
  "Recharge Ultimate, T8 eAWD, Electric/Gasoline, Dark, 7 Seats",
  "Core, T8 AWD Plug-in hybrid, Electric/Gasoline, Bright, 7 Seats",
  "Recharge Inscription, T8 eAWD , 7 Seats",
  // The same listings as the browse shard carries them: specTrim() cuts the
  // trim at the first comma, so the T8 tokens are gone and only "Recharge"
  // survives. Both spellings have to resolve or the card and the grid disagree
  // about the same car.
  "Recharge Plus",
  "Recharge Ultimate",
  "Recharge Core",
  "Recharge Black Edition Ultimate",
  "T8",
];

test("a bare-model Volvo whose trim names the plug-in powertrain resolves to the T8 row", () => {
  for (const trim of VOLVO_BARE_T8_TRIMS) {
    assert.equal(idOf(decode({ make: "VOLVO", model: "XC90", modelYear: 2024, trim })), "xc90-t8-2023-26-alt", trim);
    assert.equal(idOf(decode({ make: "VOLVO", model: "XC60", modelYear: 2025, trim })), "xc60-t8-2023-26-alt", trim);
  }
  // The split year still refuses to pick a pack, exactly as the full model
  // string does above.
  const r = matchEnrichment(decode({ make: "VOLVO", model: "XC90", modelYear: 2022, trim: "Recharge Inscription" }), null);
  assert.equal(r.exact, undefined);
  assert.deepEqual((r.candidates ?? []).map((c) => c.id).sort(), ["xc90-t8-2022-er-alt", "xc90-t8-2022-std-alt"]);
});

test("a petrol XC90/XC60 wearing the same bare nameplate matches nothing", () => {
  // Volvo's petrol and mild-hybrid grade names, which the T8 shares verbatim.
  // "Plus" is the one worth staring at: it is not a substring of
  // "PLUGINHYBRID" only because Volvo spells the fourth letter G, not S. A key
  // of "T8 Plus" WOULD swallow it, which is why no grade-bearing key is used.
  for (const trim of [
    "Core", "Plus", "Ultra", "Ultimate", "Momentum", "Inscription", "R-Design",
    "B5 Core", "B6 Plus", "Plus Bright Theme", "Ultimate Dark Theme", "Ultra Black Edition",
  ]) {
    for (const model of ["XC90", "XC60"]) {
      assert.equal(matchEnrichment(decode({ make: "VOLVO", model, modelYear: 2024, trim }), null).exact, undefined, `${model} ${trim}`);
      assert.equal(matchEnrichment(decode({ make: "VOLVO", model, modelYear: 2024, trim }), null).candidates, undefined, `${model} ${trim}`);
    }
  }
  // And a bare nameplate with no trim at all can't fall into the T8 rows.
  for (const model of ["XC90", "XC60"]) {
    assert.equal(matchEnrichment(decode({ make: "VOLVO", model, modelYear: 2024 }), null).exact, undefined, model);
  }
});

test("a drivetrain word in a petrol Volvo's trim cannot reach the T8 rows", () => {
  // This family is why "eAWD" is no longer a guard token. It reads as a
  // powertrain word — Volvo writes it only of a T8 — but it normalizes to
  // "EAWD", four characters, and trimStringsOverlap is substring-tolerant in
  // BOTH directions. "Ultimate AWD" norms to "ULTIMATEAWD", which ENDS in
  // EAWD, so a petrol B6 Ultimate matched the T8 row and took its 33 electric
  // miles. A bare "AWD" is contained BY "EAWD" and matched from the other
  // side. And the glued spellings get past cleanTrim, whose drivetrain filter
  // only drops "AWD" when it stands alone as a whole word — so they arrive at
  // the matcher intact.
  //
  // Nothing live had hit this: today's listings carry grade-only trims. But
  // /vin/ hands the matcher vPIC's raw trim, and these are the shapes it
  // produces. The rule that replaced the token: a guard token must not
  // contain a drivetrain substring.
  for (const trim of ["Core AWD", "Ultimate AWD", "Ultimate Dark Theme AWD", "AWD", "Ultimate/AWD", "Core-AWD"]) {
    for (const model of ["XC90", "XC60"]) {
      const r = matchEnrichment(decode({ make: "VOLVO", model, modelYear: 2024, trim }), null);
      assert.equal(r.exact, undefined, `${model} ${trim} exact`);
      assert.equal(r.candidates, undefined, `${model} ${trim} candidates`);
    }
  }
  // The same shape on the Dodge Hornet, whose "R/T EAWD" key was cut for the
  // same reason: "RTEAWD" contains "AWD".
  for (const trim of ["AWD", "GT AWD", "GT Plus AWD"]) {
    const r = matchEnrichment(decode({ make: "DODGE", model: "Hornet", modelYear: 2024, trim }), null);
    assert.equal(r.exact, undefined, `Hornet ${trim} exact`);
    assert.equal(r.candidates, undefined, `Hornet ${trim} candidates`);
  }
  // The tokens that survived still do their job.
  assert.equal(idOf(decode({ make: "VOLVO", model: "XC90", modelYear: 2024, trim: "Recharge Ultimate" })), "xc90-t8-2023-26-alt");
  assert.equal(idOf(decode({ make: "DODGE", model: "Hornet", modelYear: 2024, trim: "R/T Plus" })), "hornet-rt-2024-25");
});

test("the C40 needs no guard, and 'C40 Recharge' is the spelling the feed uses", () => {
  // The C40 was electric-only in the US, so there is no petrol car to poach —
  // and the matcher compares model strings by equality, so the row's full
  // "C40 Recharge Pure Electric" name never reached the 320 listings filed as
  // "C40 Recharge".
  assert.equal(idOf(decode({ make: "VOLVO", model: "C40 Recharge", modelYear: 2023, trim: "Ultimate, Twin Motor, Electric" })), "c40-recharge-2022-23");
  assert.equal(idOf(decode({ make: "VOLVO", model: "C40 Recharge", modelYear: 2023 })), "c40-recharge-2022-23");
  assert.equal(idOf(decode({ make: "VOLVO", model: "C40 Recharge Pure Electric", modelYear: 2023 })), "c40-recharge-2022-23");
  assert.equal(idOf(decode({ make: "VOLVO", model: "C40", modelYear: 2023 })), "c40-recharge-2022-23");
});

// ── The electric Mercedes CLA (data9, 2026-08-25). Not a plug-in hybrid, but
// the same nameplate-sharing problem: the feed files it as bare model "CLA"
// and vPIC decodes it to "CLA-Class", both of which the petrol CLA 250 / CLA
// 220 / AMG CLA 35 also wear. The plus sign does the work on the 250+ — see
// trimPlusMismatch in match.ts — and the absence of any petrol CLA 350 does it
// on the 4MATIC.
test("the electric CLA resolves from the bare nameplate the petrol CLA also wears", () => {
  for (const [trim, id] of [
    ["250+ Electric", "cla-250plus-2026-27-alt"],
    ["250+ with EQ Technology", "cla-250plus-2026-27-alt"],
    ["350 4MATIC Electric", "cla-350-4matic-2026-27-alt"],
    ["350 4MATIC with EQ Technology", "cla-350-4matic-2026-27-alt"],
    ["CLA 350", "cla-350-4matic-2026-27-alt"],
  ] as const) {
    assert.equal(idOf(decode({ make: "MERCEDES-BENZ", model: "CLA", modelYear: 2027, trim })), id, trim);
  }
  // vPIC's own decode of the same two cars.
  assert.equal(idOf(decode({ make: "MERCEDES-BENZ", model: "CLA-Class", modelYear: 2027, trim: "CLA250+" })), "cla-250plus-2026-27-alt");
  assert.equal(idOf(decode({ make: "MERCEDES-BENZ", model: "CLA-Class", modelYear: 2026, trim: "CLA350 4MATIC" })), "cla-350-4matic-2026-27-alt");
  // And the spellings that name the car outright.
  assert.equal(idOf(decode({ make: "MERCEDES-BENZ", model: "CLA 250+", modelYear: 2027 })), "cla-250plus-2026-27");
  assert.equal(idOf(decode({ make: "MERCEDES-BENZ", model: "CLA 350", modelYear: 2027, trim: "4MATIC" })), "cla-350-4matic-2026-27");
});

test("a petrol CLA matches nothing, and the plus sign is what keeps it out", () => {
  for (const trim of ["CLA250", "CLA250 4MATIC", "CLA220", "AMG CLA35 4MATIC", "AMG CLA45 S 4MATIC", "250", "250 4MATIC"]) {
    for (const model of ["CLA", "CLA-Class"]) {
      assert.equal(matchEnrichment(decode({ make: "MERCEDES-BENZ", model, modelYear: 2027, trim }), null).exact, undefined, `${model} ${trim}`);
      assert.equal(matchEnrichment(decode({ make: "MERCEDES-BENZ", model, modelYear: 2027, trim }), null).candidates, undefined, `${model} ${trim}`);
    }
  }
  for (const model of ["CLA", "CLA-Class"]) {
    assert.equal(matchEnrichment(decode({ make: "MERCEDES-BENZ", model, modelYear: 2027 }), null).exact, undefined, model);
  }
});

test("the Lincoln Grand Touring guard: PHEV trims resolve, gas Corsair/Aviator trims match nothing", () => {
  assert.equal(idOf(decode({ make: "LINCOLN", model: "Corsair", modelYear: 2022, trim: "Grand Touring" })), "corsair-gt-2021-22-alt");
  assert.equal(idOf(decode({ make: "LINCOLN", model: "Corsair", modelYear: 2026, trim: "Grand Touring Phev" })), "corsair-gt-2026-alt");
  assert.equal(idOf(decode({ make: "LINCOLN", model: "Aviator", modelYear: 2021, trim: "Black Label Grand Touring" })), "aviator-gt-2020-23-alt");
  for (const trim of ["Reserve", "Black Label", "Standard"]) {
    assert.equal(matchEnrichment(decode({ make: "LINCOLN", model: "Corsair", modelYear: 2022, trim }), null).exact, undefined, trim);
    assert.equal(matchEnrichment(decode({ make: "LINCOLN", model: "Aviator", modelYear: 2021, trim }), null).exact, undefined, trim);
  }
  assert.equal(matchEnrichment(decode({ make: "LINCOLN", model: "Corsair", modelYear: 2022 }), null).exact, undefined);
});

// ── Lexus RZ 450e, 2023–25 (data9). Not a nameplate-sharing case at all — the
// RZ has never been anything but electric — but it lives here because the
// failure mode is the one this file exists to catch: a row reaching a car it
// is not true of. The 450e Premium on 18-inch wheels is 220 miles and the
// 450e Luxury is 196 on either fitment, and the first version of these rows
// carried both grade spellings on the 220 row. That printed 24 miles too many
// on every Luxury, 70 live listings deep, in the direction that costs a
// shopper money.
test("the RZ 450e's two grades resolve to their own ranges, not to one shared row", () => {
  const rangeOf = (d: VinDecode) => matchEnrichment(d, null).exact?.range?.epaRangeMi?.value;
  assert.equal(rangeOf(decode({ make: "LEXUS", model: "RZ 450e", modelYear: 2023, trim: "Premium" })), 220);
  assert.equal(rangeOf(decode({ make: "LEXUS", model: "RZ 450e", modelYear: 2023, trim: "Luxury" })), 196);
  assert.equal(rangeOf(decode({ make: "LEXUS", model: "RZ", modelYear: 2024, trim: "450e Premium" })), 220);
  assert.equal(rangeOf(decode({ make: "LEXUS", model: "RZ", modelYear: 2024, trim: "450e Luxury" })), 196);
  // A truncated dealer spelling still reaches the right grade.
  assert.equal(rangeOf(decode({ make: "LEXUS", model: "RZ 450e", modelYear: 2023, trim: "LUXU" })), 196);
});

test("vPIC's one-pattern '450e Luxury/Premium' lands on the 196-mile row, never the 220", () => {
  // Every MY2023 450e VIN decodes to this single string — Lexus filed one
  // Part 565 pattern for both grades (JTJAAAAB0PA006258 and …0PA010276 both
  // return it, checked 2026-08-25). It names no grade, so the only acceptable
  // answers are the lower figure or silence. It resolves to the Luxury row
  // for a structural reason worth pinning: norm() drops the slash, leaving
  // "450ELUXURYPREMIUM", and only the Luxury key is a prefix of that — the
  // Premium key "450EPREMIUM" is not a substring of it at all. Had Lexus
  // written the pair the other way round this would land on 220, so this
  // assertion is load-bearing rather than incidental.
  const r = matchEnrichment(decode({ make: "LEXUS", model: "RZ", modelYear: 2023, trim: "450e Luxury/Premium" }), null);
  assert.equal(r.exact?.id, "rz-450e-2023-25-luxury-alt");
  assert.equal(r.exact?.range?.epaRangeMi?.value, 196);
  // A bare "450e" names neither grade and must not pick one.
  const bare = matchEnrichment(decode({ make: "LEXUS", model: "RZ", modelYear: 2024, trim: "450e" }), null);
  assert.equal(bare.exact, undefined);
  assert.deepEqual((bare.candidates ?? []).map((c) => c.id).sort(), [
    "rz-450e-2023-25-luxury-alt",
    "rz-450e-2023-25-premium-alt",
  ]);
});

test("the RZ '15 Series' label row carries the shared facts and no range", () => {
  const r = matchEnrichment(decode({ make: "LEXUS", model: "RZ 450e", modelYear: 2023, trim: "15 Series" }), null);
  assert.equal(r.exact?.id, "rz-450e-2023-25-series-label");
  assert.equal(r.exact?.range?.epaRangeMi, undefined);
  assert.equal(r.exact?.battery?.packGrossKwh?.value, 71.4);
  assert.equal(r.exact?.charging?.portStandard?.value, "CCS1");
});
