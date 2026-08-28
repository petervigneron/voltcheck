// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/trim-trust.test.ts
//
// A trim we refuse to PRINT must not be allowed to pick the range and pack
// size printed in its place.
//
// trimClaim.ts has suppressed a contradicted trim on listing surfaces since
// the "Pro" F-150 Lightning, but the same string kept reaching the enrichment
// matcher through enrich.ts's decodeFromListing, where it chooses which row a
// listing matches. That was harmless on the Lightning — its rows are keyed on
// VIN position 8 and the disputed "Pro" reaches no Platinum-specific override
// either way — and harmless on all ten listings carrying `trimSuspect` on
// 2026-08-21. It is not harmless in general: 461 pairs of rows in the corpus
// are separated by nothing but the trim under an identical VIN, the 2018
// Model 3's `vin8: ["A"]` Long Range (310 mi) and Mid Range (260 mi) among
// them.
//
// The rule these tests pin down is NOT "drop the disputed trim and take what's
// left". Measured across the corpus, a bare withhold swapped one exact row for
// a DIFFERENT exact row on 39 combinations, because withholding a trim doesn't
// demote a listing to a generic row — it demotes it to whichever row carries
// no trim key, and that row is usually another specific version. A 2022
// Ioniq 5 Standard Range would have gone from its own 220 mi to the trim-less
// RWD row's 303 mi: a new false claim, 83 miles long, in the direction that
// costs a shopper money. The rule is instead "match both ways and only keep
// the answer if the disputed trim didn't change it".
import test from "node:test";
import assert from "node:assert/strict";
import { enrichListing } from "@/lib/listings/enrich";
import { trimClaim } from "@/lib/listings/trimClaim";
import { trimTrust } from "@/lib/listings/trimTrust";
import { matchEnrichment, trimMatches } from "@/lib/enrichment/match";
import type { Listing } from "@/lib/listings/types";

const listing = (over: Partial<Listing> & Pick<Listing, "vin" | "year" | "make" | "model">): Listing => ({
  id: over.vin.toLowerCase(),
  priceUsd: 40000,
  sellerType: "dealer",
  ...over,
});

const rowIds = (l: Listing): string => {
  const e = enrichListing(l);
  if (e.row) return `EXACT:${e.row.id}`;
  if (e.enrichment.candidates) return `CAND:${e.enrichment.candidates.map((c) => c.id).sort().join("+")}`;
  return "NONE";
};

// ── The cohorts this change must NOT disturb ────────────────────────────────
//
// Lightning and Mach-E rows are keyed primarily on VIN position 8, with trim
// only naming a narrower override. The VIN does the work, so a contradicted
// trim changes nothing and the range chip has to survive.

test("Lightning: a contradicted trim leaves the VIN-keyed row exactly where it was", () => {
  // The truck that prompted all of this. dealer.com files it as a "Pro"; the
  // same page's Dealer Notes read "F-150 Lightning XLT" (registry/
  // trim-overrides.json). Position 8 is V — Extended Range — which is silent
  // on Pro vs XLT vs Lariat, so the contradiction stands and the badge is
  // suppressed. The 320 mi was never the wrong part.
  const l = listing({
    vin: "1FT6W1EV4PWG56454", year: 2023, make: "Ford", model: "F-150 Lightning",
    trim: "Pro", trimSuspect: "XLT",
  });
  assert.equal(trimClaim(l).assert, false);
  assert.equal(rowIds(l), "EXACT:lightning-2023-er");
  assert.equal(enrichListing(l).realRangeMi?.value, 320);
  // And it is the same row the truck would get with no dispute on file.
  assert.equal(rowIds(listing({ ...l, trimSuspect: undefined })), "EXACT:lightning-2023-er");
});

test("Mach-E: a VIN that names the version on its own defends the feed's trim", () => {
  // Position 8 is E — the GT motor — and E alone resolves to one row. The
  // description calling this a Premium is the thing that's wrong, so the trim
  // is trusted for display AND for matching.
  const l = listing({
    vin: "3FMTK4SE2PMA38629", year: 2023, make: "Ford", model: "Mustang Mach-E",
    trim: "GT", drive: "AWD", trimSuspect: "Premium",
  });
  const trust = trimTrust(l, "GT");
  assert.equal(trust.trusted, true);
  assert.equal(trust.reason, "vin-corroborated");
  assert.equal(trimClaim(l).assert, true);
  assert.equal(rowIds(l), "EXACT:mache-2023-gt");
});

test("Ariya: a VIN-resolved row survives a contradicted trim", () => {
  // Eight live listings on 2026-08-21: the feed says EVOLVE+, the description
  // says ENGAGE. Both land on the 87 kWh AWD row, which since 2026-08-22 is
  // keyed on the VIN descriptor (DF0B) rather than on either name, so the
  // dispute costs nothing — the point this test was written to make, and now
  // made by the VIN instead of by the drivetrain.
  //
  // The expected range moved 267 -> 272 in that same pass. 267 is the
  // Platinum+ figure (EPA id 46991, and only on its standard 19-inch wheels);
  // 272 is what EPA files for Engage+/Evolve+ e-4ORCE (46989). The old row
  // covered every 87 kWh AWD Ariya with one number and 235 live listings were
  // carrying the wrong one of the two.
  const l = listing({
    vin: "JN1DF0BB5RM731868", year: 2024, make: "Nissan", model: "ARIYA",
    trim: "EVOLVE+", drive: "AWD", trimSuspect: "ENGAGE",
  });
  assert.equal(trimClaim(l).assert, false);
  assert.equal(rowIds(l), "EXACT:ariya-87-awd");
  assert.equal(enrichListing(l).realRangeMi?.value, 272);
});

// ── The cohorts this change exists for ──────────────────────────────────────

test("Model 3: a contradicted trim can no longer pick between two rows one VIN code covers", () => {
  // 2018 Model 3, position 8 A. `vin8: ["A"], trim: "Long Range"` (310 mi) and
  // `vin8: ["A"], trim: "Mid Range"` (260 mi) — the VIN cannot separate them,
  // so before this change the disputed trim did, with full confidence.
  const l = listing({
    vin: "5YJ3E1EA8JF000337", year: 2018, make: "Tesla", model: "Model 3",
    trim: "Long Range", trimSuspect: "Mid Range",
  });
  const e = enrichListing(l);
  assert.equal(e.row, undefined, "must not assert either version");
  assert.equal(e.realRangeMi, undefined, "and must not print a range");
  assert.deepEqual(e.enrichment.candidates?.map((c) => c.id).sort(), ["m3-2018-lr-rwd", "m3-2018-mid"]);
  assert.match(e.enrichment.discriminator ?? "", /window sticker/i);
  // Ambiguous identity is itself a trap, and the shopper is told so.
  assert.ok(e.trapCount >= 1);
  // The undisputed listing is untouched: this is not a blanket demotion.
  assert.equal(rowIds(listing({ ...l, trimSuspect: undefined })), "EXACT:m3-2018-lr-rwd");
});

test("Ioniq 5: withholding a disputed trim must not promote a longer-range row", () => {
  // The regression the first cut of trimTrust introduced and the sweep caught:
  // drop a disputed trim and whichever row happens to carry no trim key wins,
  // which is a different car's answer rather than a safer one — the expensive
  // direction to be wrong in.
  //
  // This used to be posed on a 2022 car, where `ioniq5-2022-sr` (220 mi) and
  // `ioniq5-2022-rwd` (303 mi) were separated only by a trim string. It is
  // posed on a 2025 AWD car now, because the 2022 case can no longer happen:
  // since 2026-08-28 every Ioniq 5 row carries a `vin8` key (B Standard
  // Range, E/A long-range RWD, F/C AWD), so the VIN settles the SR-vs-RWD
  // question before any trim is consulted. Three rows still share code C —
  // the plain AWD, the AWD Limited and the XRT, at 290, 269 and 259 miles —
  // and that is where the hazard now lives.
  const l = listing({
    vin: "7YAKMDDC4SY018488", year: 2025, make: "Hyundai", model: "Ioniq 5",
    trim: "Limited", drive: "AWD", trimSuspect: "XRT",
  });
  const e = enrichListing(l);
  assert.equal(e.row?.id, undefined, "must not assert either version");
  assert.equal(e.realRangeMi, undefined, "and must not print a range");
  assert.notEqual(e.realRangeMi?.value, 290, "least of all the trim-less row's longest figure");
  assert.ok((e.enrichment.candidates?.length ?? 0) >= 2);
  // The undisputed listing is untouched: this is not a blanket demotion.
  assert.equal(rowIds(listing({ ...l, trimSuspect: undefined })), "EXACT:ioniq5-2025-2026-awd-limited");
});

test("the VIN settles Standard Range against Long Range without consulting the trim", () => {
  // What made the case above unposeable on a 2022 car, and the reason the
  // Standard Range rows carry no trim key: position 8 says which pack it is.
  // B is the Standard Range car in both plant eras — Korea-built KM8 through
  // MY2024 and US-built 7YA from MY2025 — and a dealer typing "SE" on one
  // cannot turn it into a 303-mile car.
  const at = (vin: string, year: number, trim?: string) =>
    enrichListing(listing({ vin, year, make: "Hyundai", model: "Ioniq 5", trim }));
  assert.equal(at("KM8KM4AB4PU177217", 2023).row?.id, "ioniq5-2023-2024-sr");
  assert.equal(at("KM8KM4AB4PU177217", 2023).realRangeMi?.value, 220);
  assert.equal(at("KM8KM4AB4PU177217", 2023, "SE").realRangeMi?.value, 220, "a bare SE trim cannot promote it");
  assert.equal(at("KM8KM4DE7RU251819", 2024, "SE").realRangeMi?.value, 303, "the same SE string on an E-coded car IS long range");
  assert.equal(at("7YAKM4DB5SY033055", 2025).realRangeMi?.value, 245);
  assert.equal(at("7YAKM4DA9SY022244", 2025).realRangeMi?.value, 318);
});

test("a lone researched row is not handed to a car whose version we can't name", () => {
  // 2023 i7 xDrive60 is the only 2023 i7 row in the corpus. "Narrowed to one"
  // narrowed nothing here, and the car may be a version never researched, so
  // the honest answer is nothing rather than 318 mi.
  const l = listing({
    vin: "WBY43EJ020CY07240", year: 2023, make: "BMW", model: "i7",
    trim: "xDrive60", drive: "AWD", trimSuspect: "eDrive50",
  });
  assert.equal(rowIds(l), "NONE");
  assert.equal(rowIds(listing({ ...l, trimSuspect: undefined })), "EXACT:i7-2023-xdrive60");
});

// ── Invariants the change must not break ────────────────────────────────────

test("distrusting a trim is still not the same as not having one", () => {
  // match.test.ts bug 2: a listing with NO trim must not pick up a trim-keyed
  // row for its make/model/year. The `ignoreRowTrims` escape added for the
  // contradicted case must not leak into the ordinary one.
  assert.equal(trimMatches("Long Range", undefined), false);
  const trimless = listing({ vin: "5YJ3E1EA8JF000337", year: 2018, make: "Tesla", model: "Model 3" });
  assert.equal(rowIds(trimless), "NONE");
  // Nor may an ordinary decode reach the untrusted path by accident.
  const r = matchEnrichment(
    { vin: "5YJ3E1EA8JF000337", usMarket: true, make: "TESLA", model: "Model 3", modelYear: 2018, trim: undefined },
    null
  );
  assert.deepEqual(r, {});
});

test("trimTrust costs nothing when no contradiction is on file", () => {
  const l = listing({ vin: "1FT6W1EV4PWG56454", year: 2023, make: "Ford", model: "F-150 Lightning", trim: "Pro" });
  assert.deepEqual(trimTrust(l, "Pro"), { trusted: true, reason: "uncontested" });
  assert.deepEqual(trimTrust({ ...l, trimSuspect: "XLT" }, undefined), { trusted: true, reason: "uncontested" });
});

test("display and enrichment reach the same verdict on the same listing", () => {
  // The whole point of moving the judgement into trimTrust.ts. Whenever
  // trimClaim refuses to print a trim as contradicted, the matcher must not
  // hand back a row that only that trim could have selected.
  const cases: Listing[] = [
    listing({ vin: "5YJ3E1EA8JF000337", year: 2018, make: "Tesla", model: "Model 3", trim: "Long Range", trimSuspect: "Mid Range" }),
    listing({ vin: "KM8KRDAF4NU000001", year: 2022, make: "Hyundai", model: "Ioniq 5", trim: "Standard Range", drive: "RWD", trimSuspect: "Limited" }),
    listing({ vin: "1FT6W1EV4PWG56454", year: 2023, make: "Ford", model: "F-150 Lightning", trim: "Platinum", trimSuspect: "XLT" }),
  ];
  for (const l of cases) {
    const claim = trimClaim(l);
    assert.equal(claim.assert, false, `${l.vin} should read as contradicted`);
    const e = enrichListing(l);
    const rowTrim = e.row?.trim;
    assert.equal(rowTrim, undefined, `${l.vin} matched a trim-keyed row on a trim we won't print`);
  }
});

// ── The manufacturer's own document ─────────────────────────────────────────
//
// `trimRefuted` is Ford's window sticker for one VIN saying the feed named the
// wrong version (scraper/lib/ford-sticker-trim.mjs). It is a separate field
// from trimSuspect because the two have different provenance and the detail
// page's trimSuspect copy names the dealer's description as the source — see
// that file. Both surfaces still have to reach the same verdict.

test("a Monroney label the feed contradicts suppresses the trim on both surfaces", () => {
  // The reported truck. Ford's sticker for this VIN: EQUIPMENT GROUP 110A /
  // PRO SERIES. Ford Blue Advantage published it as an XLT.
  const l = listing({
    vin: "1FT6W1EV8NWG06203", year: 2022, make: "Ford", model: "F-150 Lightning",
    trim: "XLT", trimRefuted: true, condition: "certified", mileage: 87161,
  });
  const claim = trimClaim(l);
  assert.equal(claim.assert, false);
  // Not "contradicted": there is no description to quote, so the page prints
  // nothing rather than a sentence crediting a source we did not read.
  assert.equal(claim.assert === false && claim.reason, "refuted");
  // The enrichment matcher must reach the same verdict, or the trim we refuse
  // to print still picks the range printed beside it.
  assert.equal(trimTrust(l, "XLT").trusted, false);
  // Position 8 is V — Extended Range — and that is what was right all along.
  assert.equal(enrichListing(l).realRangeMi?.value, 320);
});

test("the label outranks a VIN that would otherwise corroborate the feed", () => {
  // versionNamedByVinAlone reads the same vPIC decode that answers "SuperCrew"
  // for every 2022-23 Lightning, so on this family it can never settle the
  // question. The flag must not be appealable to it.
  const l = listing({
    vin: "3FMTK4SE2PMA38629", year: 2023, make: "Ford", model: "Mustang Mach-E",
    trim: "GT", trimRefuted: true,
  });
  assert.equal(trimTrust(l, "GT").trusted, false);
  assert.equal(trimTrust(l, "GT").reason, "refuted");
  // Without the flag the VIN corroborates the feed, as it did before.
  assert.equal(trimTrust(listing({ ...l, trimRefuted: undefined }), "GT").trusted, true);
});

test("an unrefuted Ford is untouched", () => {
  const l = listing({
    vin: "1FT6W3LU6SWG26144", year: 2025, make: "Ford", model: "F-150 Lightning", trim: "Flash",
  });
  assert.equal(trimTrust(l, "Flash").reason, "uncontested");
  assert.equal(trimClaim(l).assert, true);
});
