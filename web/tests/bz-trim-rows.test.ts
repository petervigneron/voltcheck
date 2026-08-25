// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/bz-trim-rows.test.ts
//
// The 2026 Toyota bZ rows were keyed on drivetrain alone, from a finding
// that our feed labelled these cars "11 Series" / "15 Series" — not Toyota
// grade names. Re-counted 2026-08-22 against the live feed: 1,950 of 2,589
// MY2026 bZ listings say "XLE", 402 "Limited", 199 "XLE Plus", and 3 say
// "15 Series". The junk labels are the exception, and drivetrain-only keying
// was showing every AWD Limited the XLE AWD's 288 mi where EPA rates it 278.
//
// Two things are pinned here. First, that each grade now resolves to its own
// row and its own EPA figure. Second, that a car whose trim we cannot read
// resolves to the trim-agnostic row and is shown NO range — 236 and 314 are
// both live on the FWD drivetrain, and picking one is the expensive error.
import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";
import type { VinDecode } from "@/lib/types";

const bz = (model: string, trim: string | undefined, driveType: string | undefined): VinDecode =>
  ({ vin: "", usMarket: true, make: "TOYOTA", model, modelYear: 2026, trim, driveType }) as VinDecode;

const range = (model: string, trim: string | undefined, drive: string | undefined) =>
  matchEnrichment(bz(model, trim, drive), null).exact?.range?.epaRangeMi?.value;

test("each MY2026 bZ grade gets its own EPA range, not the drivetrain's first row", () => {
  assert.equal(range("bZ", "XLE", "FWD"), 236);
  assert.equal(range("bZ", "XLE Plus", "FWD"), 314);
  assert.equal(range("bZ", "Limited", "FWD"), 296);
  assert.equal(range("bZ", "XLE", "AWD"), 288);
  // The listing that started this: jtmbdafb8ta002637, a Limited AWD, was
  // being shown 288.
  assert.equal(range("bZ", "Limited", "AWD"), 278);
});

// This test used to assert the opposite — that "Premium" resolved to 260 and
// everything else to 281 — because EPA's two Woodland records were read as a
// base/Premium split. Toyota's own launch release says the all-terrain tire
// that costs those 21 miles is AVAILABLE on both grades, so the split was a
// grade the car does not have, and 176 live Premium listings were shown a
// rating that belongs to an option box. Both grades now get the standard
// tire's 281 with the tire named in the note; inverting this test back is how
// the wrong claim returns.
test("every bZ Woodland grade gets the standard tire's rating, not the all-terrain option's", () => {
  for (const t of ["Woodland", "bZ Woodland", "Premium", "Premium AWD", "bZ Woodland Premium", "WOODLAND Premium", "17 Series", undefined])
    assert.equal(range("bZ Woodland", t, "AWD"), 281, String(t));
});

test("the bZ Woodland's all-terrain option is stated, not hidden, on the row that prints 281", () => {
  const r = matchEnrichment(bz("bZ Woodland", "Premium", "AWD"), null).exact;
  assert.match(r?.range?.epaRangeMi?.note ?? "", /standard tire/);
  assert.ok(
    (r?.buyerNotes ?? []).some((n) => /all-terrain tire/.test(n.headline)),
    "the 260-mile option must reach the shopper somewhere"
  );
});

test("an unreadable trim resolves to the shared row and states no range at all", () => {
  for (const t of ["15 Series", "17 Series", undefined, "AWD (Natl)"]) {
    const r = matchEnrichment(bz("bZ", t, "AWD"), null);
    assert.equal(r.exact?.id, "bz-2026", `bZ ${t}`);
    assert.equal(r.exact?.range?.epaRangeMi, undefined, `bZ ${t} must state no range`);
    // The facts that don't depend on which grade it is still come through.
    assert.equal(r.exact?.charging?.portStandard?.value, "NACS");
    assert.equal(r.exact?.warranty?.batteryYears?.value, 8);
  }
});

test("no bZ row tells a shopper their trim isn't a real Toyota grade", () => {
  for (const t of ["XLE", "Limited", "15 Series", undefined]) {
    const heads = (matchEnrichment(bz("bZ", t, "AWD"), null).exact?.buyerNotes ?? []).map((n) => n.headline);
    assert.ok(!heads.some((h) => /doesn't match any real/.test(h)), `bZ ${t}: ${heads.join(" | ")}`);
    // The recall is a real per-model fact and stays.
    assert.ok(heads.some((h) => /battery-ECU fault/.test(h)), `bZ ${t} lost its recall note`);
  }
});

// An exact trim name must beat a longer row name that merely contains it.
// "XLE Plus" overlaps a listing that says only "XLE", and before the tiebreak
// in matchEnrichmentRaw the two tied and the range went silent on 1,950 cars.
test("a listing that says only 'XLE' does not tie with the 'XLE Plus' row", () => {
  const r = matchEnrichment(bz("bZ", "XLE", "FWD"), null);
  assert.equal(r.exact?.id, "bz-2026-fwd-xle");
  assert.equal(r.candidates, undefined);
});
