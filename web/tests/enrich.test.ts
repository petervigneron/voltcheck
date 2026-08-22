// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/enrich.test.ts
//
// enrichListing() used to pick an enrichment row from a listing's raw `trim`
// field with no regard for `trimSuspect` — the flag scraper/lib/trim-suspect.mjs
// (and the hand-curated scraper/lib/trim-overrides.mjs, c1f995c) sets when a
// listing's own description contradicts its stated trim. The display layer
// (lib/listings/trimClaim.ts) already refuses to PRINT a contradicted trim,
// but the matcher kept using it to SELECT a row — so a car could show no trim
// to the shopper while still being enriched from the row that trim picked.
//
// This is latent-harmless on F-150 Lightning/Mach-E (those rows key mainly on
// VIN position 8; trim only disambiguates a couple of overrides) but live and
// dangerous on Tesla Model 3/Y: several data4.ts rows share ONE vin8 code
// across trims with materially different EPA ranges, so a contradicted trim
// there can drive a wrong range/pack onto a real car while the page
// simultaneously declines to show the trim that caused it.
import test from "node:test";
import assert from "node:assert/strict";
import { enrichListing } from "@/lib/listings/enrich";
import type { Listing } from "@/lib/listings/types";

const base: Listing = {
  id: "x",
  vin: "",
  year: 2024,
  make: "Tesla",
  model: "Model Y",
  priceUsd: 40000,
  sellerType: "dealer",
};

// Real corpus: MY2024 Model Y vin8 "D" is shared by two rows — "my-2024-lr-rwd"
// (trim-specific "Long Range", 320 mi EPA) and "my-2024-rwd" (trim-agnostic,
// 260 mi EPA, the plain RWD). Trim is the only thing that tells them apart.
const MY2024_D_VIN = "5YJYGDED1RF000000"; // WMI 5YJ, vin8 D, year code R=2024

test("enrichListing: an UNDISPUTED 'Long Range' trim still resolves to the Long Range row, but the range itself abstains", () => {
  // This is one of the eight VIN-8/model-year buckets
  // lib/listings/teslaRangeAbstain.ts exists for (docs/agents/
  // trim-error-rate-2026-08-21.md §4): nothing here disputes the trim, but
  // nothing corroborates it either, so the row still resolves (packVariant,
  // port, warranty stay real) while the range figure it would have picked —
  // 320 vs the 260 mi plain RWD car shares the same VIN-8 — goes quiet.
  const l: Listing = { ...base, vin: MY2024_D_VIN, trim: "Long Range" };
  const e = enrichListing(l);
  assert.equal(e.row?.id, "my-2024-lr-rwd");
  assert.equal(e.realRangeMi, undefined);
});

test("enrichListing: a trim CONTRADICTED by the listing's own description (trimSuspect set) must not use that trim to pick a row", () => {
  // Same feed trim as above, but the pipeline has flagged it: the
  // description named a different version. Before the fix this still
  // resolved to my-2024-lr-rwd (320 mi) — a wrong range figure printed next
  // to a suppressed trim badge, exactly the shape trimClaim.ts's own doc
  // comment describes for the Lightning "Pro"/"Lariat" case.
  const l: Listing = { ...base, vin: MY2024_D_VIN, trim: "Long Range", trimSuspect: "Standard" };
  const e = enrichListing(l);
  assert.notEqual(e.row?.id, "my-2024-lr-rwd");

  // This test originally asserted `my-2024-rwd` / 260 mi here, on the reading
  // that dropping the disputed trim leaves "a single, different, and correct
  // answer — not a guess". It is a guess, and correcting it is the point of
  // the follow-up change.
  //
  // Withholding a trim does not demote a listing to a generic row; it demotes
  // it to whichever row happens to carry no trim key, and here that row is the
  // plain RWD car — a different specific version, not a safe superset. Nothing
  // about the evidence selected it: this listing returns 260 mi whether its
  // description said "Standard", "Performance" or anything else, because the
  // choice is made by which row lacks a trim key rather than by what the
  // description actually named. Swept across every (make, model, year, trim)
  // in the corpus, that rule swapped one exact row for a DIFFERENT exact row
  // on 39 combinations, and it is not biased toward caution: a 2022 Ioniq 5
  // Standard Range moved from its own 220 mi to the trim-less RWD row's
  // 303 mi, an 83-mile overstatement in the direction that costs a shopper
  // money.
  //
  // The car is one of these two and we cannot say which, so we say that.
  assert.equal(e.row, undefined);
  assert.equal(e.realRangeMi, undefined);
  assert.deepEqual(e.enrichment.candidates?.map((c) => c.id).sort(), ["my-2024-lr-rwd", "my-2024-rwd"]);
});

// Real corpus: MY2019 Model 3 vin8 "A" is shared by THREE trim-specific rows
// with no trim-agnostic fallback (Standard Range Plus/240mi, Long Range/310mi,
// Mid Range/264mi) — there is no row left once trim is untrusted, so the
// honest answer is silence, not a guess among three real possibilities.
test("enrichListing: a contradicted trim with no trim-agnostic row to fall back on yields no row at all, not a guess", () => {
  const l: Listing = {
    ...base,
    model: "Model 3",
    year: 2019,
    vin: "5YJ3E1EA1KF000000", // WMI 5YJ, vin8 A, year code K=2019
    trim: "Long Range",
    trimSuspect: "Mid Range",
  };
  const e = enrichListing(l);
  assert.equal(e.row, undefined);
  assert.equal(e.realRangeMi, undefined);
});

test("enrichListing: the real Island Chevrolet Lightning (contradicted 'Pro') resolves to the non-Platinum ER row, not the Platinum one", () => {
  // The exact VIN from trim-overrides.mjs's own doc comment (c1f995c): fed as
  // "Pro", the dealer's real VDP names it an XLT. 2023 Lightning vin8 "V" is
  // shared by "lightning-2023-er" (trim-agnostic, 320 mi) and
  // "lightning-2023-er-platinum" (trim: "Platinum", 300 mi). Before this fix,
  // matching still considered the untrustworthy "Pro" string: it doesn't
  // overlap "Platinum", so the two rows came back as ambiguous CANDIDATES
  // (never a wrong single answer here — this model was already "harmless" per
  // the assignment, just imprecise). With trim dropped for matching, vin8
  // alone rules out the Platinum row outright (trim-specific, no stated trim
  // to confirm it) and leaves one confident, correct answer: the plain ER row
  // an XLT actually is.
  const l: Listing = {
    ...base,
    make: "Ford",
    model: "F-150 Lightning",
    year: 2023,
    vin: "1FT6W1EV4PWG56454",
    trim: "Pro",
    trimSuspect: "XLT",
  };
  const e = enrichListing(l);
  assert.equal(e.row?.id, "lightning-2023-er");
  assert.equal(e.realRangeMi?.value, 320);
});
