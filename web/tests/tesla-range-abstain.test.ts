// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/tesla-range-abstain.test.ts
//
// docs/agents/trim-error-rate-2026-08-21.md measured that Tesla Model 3/Y
// trim is close to unverifiable (vPIC returns a blank trim for 100% of
// Tesla VINs; dealer.com descriptions are a template that echoes the trim
// field back at itself; price bands overlap too much to separate versions),
// and that ~1,301 listings sit in one of eight VIN-8/model-year buckets
// where our own enrichment rows disagree on range by up to 91 miles with
// nothing but that unverifiable trim telling them apart. This pins down the
// resulting abstention in lib/listings/teslaRangeAbstain.ts: the range goes
// quiet in those eight buckets unless the VIN itself (never the trim)
// resolves it, and nothing else on the card is touched.
import test from "node:test";
import assert from "node:assert/strict";
import { enrichListing } from "@/lib/listings/enrich";
import { abstainTeslaRange } from "@/lib/listings/teslaRangeAbstain";
import type { Listing } from "@/lib/listings/types";

const base: Listing = {
  id: "x",
  vin: "",
  year: 2024,
  make: "Tesla",
  model: "Model 3",
  priceUsd: 40000,
  sellerType: "dealer",
};

// WMI 5YJ, vin8 A, year code R = 2024 — the worst-case bucket.
const M3_2024_A_VIN = "5YJ3E1EA1RF000001";

test("the 91-mile worst case: an UNDISPUTED 'Long Range' trim still resolves the row but the range abstains", () => {
  const l: Listing = { ...base, vin: M3_2024_A_VIN, trim: "Long Range" };
  const e = enrichListing(l);
  assert.equal(e.row?.id, "m3-2024-lr-rwd");
  assert.equal(e.realRangeMi, undefined, "272 vs 363 mi is not a guess this page prints");
  // Everything else on the row survives — this is not a blanket demotion to
  // candidates. Port doesn't depend on which of the two this car is. The
  // pack DOES since the 2026-08-24 backfill (61 kWh LFP vs 80.4 kWh Long
  // Range on this bucket's two rows), so it must abstain with the range.
  assert.equal(e.port?.value, "NACS");
  assert.equal(e.packKwh, undefined, "the colliding rows carry different packs, so the pack abstains with the range");
  assert.equal(e.usableKwh, undefined, "same reason as packKwh");
});

test("the 2024 Model 3 'A' bucket is the ONE bucket whose colliding rows disagree on chemistry, so chemistry abstains with the range", () => {
  // m3-2024-rwd carries chemistry LFP; m3-2024-lr-rwd carries no chemistry
  // fact at all, and an absent fact is not agreement — the Long Range RWD is
  // a 2170 car, not an LFP one. The dangerous path is the listing with NO
  // trim: it resolves by elimination to the LFP row and would print "LFP" on
  // a car that may be the Long Range. Chemistry drives charge-to-100%
  // guidance and battery-risk scoring, so the wrong one is bad advice, not
  // just a wrong spec line.
  const untrimmed = enrichListing({ ...base, vin: M3_2024_A_VIN });
  assert.equal(untrimmed.row?.id, "m3-2024-rwd", "still resolves by elimination, unchanged");
  assert.equal(untrimmed.row?.battery?.chemistry, undefined, "the LFP claim is not earned on this car");

  // The stated-trim path resolves to the row that never had a chemistry fact,
  // so it was already quiet; pinned so a later backfill of that row's
  // chemistry can't start printing it here.
  const trimmed = enrichListing({ ...base, vin: M3_2024_A_VIN, trim: "Long Range" });
  assert.equal(trimmed.row?.id, "m3-2024-lr-rwd");
  assert.equal(trimmed.row?.battery?.chemistry, undefined);
});

test("the same bucket, no stated trim at all: the row still resolves by elimination (pre-existing behavior), but the range abstains too", () => {
  // m3-2024-rwd carries no trim key, so an absent trim satisfies it alone
  // and the ordinary matcher returns it as a confident exact row — the
  // trim-agnostic-row-by-elimination shape this abstention exists to not
  // trust for range. A blank trim is, if anything, LESS resolved than a
  // stated one, so it must abstain too, and matchIgnoringTrim doesn't care
  // whether the listing's trim was blank or stated: neither is VIN evidence.
  const l: Listing = { ...base, vin: M3_2024_A_VIN };
  const e = enrichListing(l);
  assert.equal(e.row?.id, "m3-2024-rwd");
  assert.equal(e.realRangeMi, undefined);
});

test("a 2018 Model 3, VIN-8 A (Mid Range vs Long Range, 50 mi): abstains the same way", () => {
  const l: Listing = { ...base, vin: "5YJ3E1EA8JF000337", year: 2018, trim: "Long Range" };
  const e = enrichListing(l);
  assert.equal(e.row?.id, "m3-2018-lr-rwd");
  assert.equal(e.realRangeMi, undefined);
});

// WMI 5YJ, vin8 E (dual motor, non-Performance), year code N = 2022.
// Position 11 (index 10) is the plant code: F = Fremont, A = Austin.
const MY_2022_E_FREMONT_VIN = "5YJYGDEE1NF000000";
const MY_2022_E_AUSTIN_VIN = "5YJYGDEE1NA000000";

test("Model Y 2022-23, VIN-8 E: a Fremont-built car is corroborated by the VIN alone and keeps its range", () => {
  // Austin built both the AWD (4680, 279 mi) and Long Range AWD (2170,
  // 330 mi) cars; Fremont only ever built the 330-mile one. Plant code F
  // settles it independent of whatever the dealer's trim field says.
  const l: Listing = { ...base, model: "Model Y", vin: MY_2022_E_FREMONT_VIN, year: 2022, trim: "Long Range AWD" };
  assert.equal(abstainTeslaRange(l), false);
  const e = enrichListing(l);
  assert.equal(e.row?.id, "model-y-lr-awd-2022-23");
  assert.equal(e.realRangeMi?.value, 330);
});

test("Model Y 2022-23, VIN-8 E: the identical trim on an Austin-built car is NOT corroborated and abstains", () => {
  // Same feed trim as the Fremont case above — the only thing that changed
  // is VIN position 11 — and Austin built both cars, so plant tells us
  // nothing here. The row still resolves from the trim string (unchanged
  // matching behavior); only the range this specific abstention exists for
  // goes quiet.
  const l: Listing = { ...base, model: "Model Y", vin: MY_2022_E_AUSTIN_VIN, year: 2022, trim: "Long Range AWD" };
  assert.equal(abstainTeslaRange(l), true);
  const e = enrichListing(l);
  assert.equal(e.row?.id, "model-y-lr-awd-2022-23");
  assert.equal(e.realRangeMi, undefined);
});

test("2022-23 Model Y 'E': the colliding rows AGREE on NCA, so chemistry is still served even though range and pack abstain", () => {
  // The counterweight to the 2024 Model 3 chemistry case above, and the
  // reason the guard asks the ROWS rather than a second list of buckets:
  // these two rows differ by 51 miles and 13 kWh — a real collision, and
  // both range and pack abstain on it — yet they agree on NCA. Withholding a
  // fact every candidate agrees on would be silence the data doesn't ask for.
  const l: Listing = { ...base, model: "Model Y", vin: MY_2022_E_AUSTIN_VIN, year: 2022, trim: "Long Range AWD" };
  const e = enrichListing(l);
  assert.equal(e.row?.id, "model-y-lr-awd-2022-23");
  assert.equal(e.realRangeMi, undefined, "range still abstains");
  assert.equal(e.packKwh, undefined, "pack still abstains");
  assert.equal(e.row?.battery?.chemistry?.value, "NCA", "both colliding rows are NCA, so this one is earned");
});

test("a Tesla outside the eight buckets is untouched", () => {
  // 2021 Model 3 Long Range AWD is vin8 B, a code no other 2021 row shares —
  // never a candidate for this abstention in the first place.
  const l: Listing = { ...base, vin: "5YJ3E1EB1MF000000", year: 2021, trim: "Long Range AWD" };
  assert.equal(abstainTeslaRange(l), false);
  const e = enrichListing(l);
  assert.equal(e.row?.id, "m3-2021-lr-awd");
  assert.equal(e.realRangeMi?.value, 353);
});

test("a non-Tesla make sharing a VIN-8 letter is untouched", () => {
  const l: Listing = { ...base, make: "Ford", model: "F-150 Lightning", vin: "1FT6W1EV4PWG56454", year: 2023, trim: "Pro" };
  assert.equal(abstainTeslaRange(l), false);
});
