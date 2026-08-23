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
    assert.equal(idOf(decode({ make: "JEEP", model: "Wrangler", modelYear: 2024, trim })), "wrangler-4xe-2021-25-alt", trim);
  }
  // The feed sends the four-door under both names; the 4xe was four-door only
  // and the two 4xe rows print identical facts, so one alt row covers both.
  assert.equal(
    idOf(decode({ make: "JEEP", model: "Wrangler Unlimited", modelYear: 2022, trim: "Sahara 4xe" })),
    "wrangler-4xe-2021-25-alt"
  );
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
  assert.equal(idOf(decode({ make: "JEEP", model: "Wrangler 4xe", modelYear: 2023 })), "wrangler-4xe-2021-25");
  assert.equal(idOf(decode({ make: "JEEP", model: "Wrangler Unlimited 4xe", modelYear: 2022 })), "wrangler-unl-4xe-2021-25");
  assert.equal(idOf(decode({ make: "JEEP", model: "Grand Cherokee 4xe", modelYear: 2024 })), "gc-4xe-2022-25");
  assert.equal(idOf(decode({ make: "JEEP", model: "GR Cherokee 4XE", modelYear: 2024 })), "gc-4xe-2022-25");
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
