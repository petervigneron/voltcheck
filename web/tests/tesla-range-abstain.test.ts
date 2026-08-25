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
import { abstainTeslaRange, withTeslaCollisionAbstention } from "@/lib/listings/teslaRangeAbstain";
import { matchEnrichment } from "@/lib/enrichment/match";
import { decodeTeslaVin } from "@/lib/tesla-vin";
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

// ── /vin/[vin] ───────────────────────────────────────────────────────────
//
// That page resolves its row from matchEnrichment and never calls
// enrichListing, so until 2026-08-25 none of the above applied to it. A vPIC
// decode of a Tesla carries no trim, no drivetrain and no battery size
// (verified live against vPIC on 5YJ3E1EA2RF745143: all three empty), which
// is the worst possible input for the trim-less by-elimination failure.
// These pin the page's three outcomes.

/** The page's decode: everything vPIC cannot tell us about a Tesla is blank. */
const vinPage = (vin: string, model: string, year: number) => {
  const decode = {
    vin, usMarket: true, make: "TESLA", model, modelYear: year,
    trim: undefined, driveType: undefined, batteryKwhHint: undefined,
  };
  return withTeslaCollisionAbstention(decode, matchEnrichment(decode, decodeTeslaVin(vin)));
};

test("/vin/: the 91-mile worst case shows both cars, not the one that happens to lack a trim key", () => {
  // Real VIN from the crawl cache. Before this, the page printed
  // "272 mi · 61 kWh · LFP" as a researched exact configuration — chosen by
  // elimination, because m3-2024-lr-rwd is trim-keyed and the decode has no
  // trim, not because anything about the car said RWD.
  const r = vinPage("5YJ3E1EA2RF745143", "Model 3", 2024);
  assert.equal(r.exact, undefined, "no unqualified answer where two cars fit the VIN");
  assert.deepEqual(r.candidates?.map((c) => c.id), ["m3-2024-rwd", "m3-2024-lr-rwd"]);
  assert.match(r.discriminator ?? "", /window sticker or the door-jamb label/);
});

test("/vin/: a bucket where EVERY row is trim-keyed stops claiming we have no row for the car", () => {
  // Both 2018 Model 3 "A" rows carry a trim key, so the trim-less match
  // dropped both and the page said "No researched row for this model yet"
  // about a car we hold two researched rows for. The opposite failure from
  // the test above, same cause.
  const r = vinPage("5YJ3E1EA8JF000337", "Model 3", 2018);
  assert.equal(r.exact, undefined);
  assert.deepEqual(r.candidates?.map((c) => c.id), ["m3-2018-lr-rwd", "m3-2018-mid"]);
});

test("/vin/: a Fremont-built 2022-23 Model Y keeps its exact row, matching what the listing page already shows", () => {
  // Austin built both the 4680 AWD (279 mi) and the Long Range AWD (330 mi);
  // Fremont only ever built the 330-mile car, so plant code F resolves it
  // with no trim involved. This is the abstention's corroboration branch, and
  // the listing page has always honoured it — /vin/ said nothing at all.
  const r = vinPage("5YJYGDEE1NF000000", "Model Y", 2022);
  assert.equal(r.exact?.id, "model-y-lr-awd-2022-23");
  assert.equal(r.exact?.range?.epaRangeMi?.value, 330);
  assert.equal(r.candidates, undefined);
});

test("/vin/: the same car built in Austin gets candidates, because there the plant proves nothing", () => {
  const r = vinPage("5YJYGDEE1NA000000", "Model Y", 2022);
  assert.equal(r.exact, undefined);
  assert.deepEqual(r.candidates?.map((c) => c.id), ["model-y-lr-awd-2022-23", "model-y-awd-4680-2022-23"]);
});

test("/vin/: a Tesla outside the eight buckets is untouched", () => {
  const r = vinPage("5YJ3E1EB1MF000000", "Model 3", 2021);
  assert.equal(r.exact?.id, "m3-2021-lr-awd");
  assert.equal(r.exact?.range?.epaRangeMi?.value, 353);
});

test("VIN position 7 is not a chemistry code and no longer claims to be", () => {
  // Measured against the 6,773 Teslas in scraper/registry/vpic-cache.json:
  // position 7 is "E" on 99.3% and "F" never appears. The control that kills
  // it outright is below — a cohort this corpus states is LFP and a cohort
  // that is ternary are INDISTINGUISHABLE at position 7, so the page-level
  // claim it used to source ("Cell type (VIN pos. 7)", confidence high, under
  // a heading reading "What the VIN itself proves") was unearned on every car
  // and flatly contradicted the row's own LFP on 719 of them.
  const knownLfp = "5YJ3E1EA6PF672730";  // 2023 Model 3 RWD, vin8 A — CATL LFP
  const knownTernary = "5YJ3E1EB0PF000001"; // 2023 Model 3 Long Range AWD, vin8 B
  assert.equal(knownLfp[6], "E");
  assert.equal(knownTernary[6], "E", "identical at position 7 — it cannot separate them");

  assert.ok(!("chemistryHint" in decodeTeslaVin(knownLfp)!), "no chemistry is derived from the VIN");
  // The row remains the only source of chemistry, and still says LFP here.
  const l: Listing = { ...base, vin: knownLfp, year: 2023, model: "Model 3" };
  assert.equal(enrichListing(l).row?.battery?.chemistry?.value, "LFP");
});
