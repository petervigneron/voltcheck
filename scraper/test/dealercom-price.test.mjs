// node --test scraper/test/dealercom-price.test.mjs
//
// Every case is a real dealer.com VDP, read against its rendered "Final
// Price"/dominant price on 2026-08-18 (or the vanhyundai case, 2026-08-14).
// The served fields are what DDC.dataLayer + JSON-LD actually carried; `want`
// is the number a human sees on the page. If a rooftop's pricing config shifts
// under us, these are what should fail first.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveDdcPrice, resolveDdcPriceTagged, PRICE_ABSTAIN } from "../lib/platforms/dealercom.mjs";

// jsonld arrives on rec.priceUsd (normalize() read offers.price); the rest are
// DDC.dataLayer fields. Only the fields the page actually served are set.
const run = ({ jsonld, msrp, internet, sale, asking, newOrUsed, year }) =>
  resolveDdcPrice(
    { priceUsd: jsonld, condition: newOrUsed, year },
    {
      msrp,
      internetPrice: internet,
      salePrice: sale,
      askingPrice: asking,
      newOrUsed,
    }
  );

test("JSON-LD wins when it carries a folded-in incentive below MSRP (VW ID.Buzz)", () => {
  // internetPrice $66,610 was the pre-incentive subtotal that used to publish.
  assert.equal(
    run({ jsonld: 59110, msrp: 72385, internet: 66610, sale: 72385, asking: 72385, newOrUsed: "new" }),
    59110
  );
});

test("JSON-LD wins over an internetPrice that exceeds MSRP (GMC Hummer SUV)", () => {
  assert.equal(
    run({ jsonld: 112955, msrp: 142820, internet: 142955, sale: 112955, asking: 112820, newOrUsed: "new" }),
    112955
  );
});

test("JSON-LD wins on a used car with no MSRP anchor (Tesla Model Y)", () => {
  assert.equal(run({ jsonld: 29943, internet: 31213, sale: 29718, asking: 29718, newOrUsed: "used" }), 29943);
});

test("JSON-LD = MSRP with no lower field is the price (Escalade IQL)", () => {
  // salePrice $170,068 sat above the $169,690 sticker; not a discount.
  assert.equal(run({ jsonld: 169690, msrp: 169690, sale: 170068, newOrUsed: "new" }), 169690);
});

test("JSON-LD beats a lower internetPrice when it is the displayed ask (Ioniq 5, used)", () => {
  // We used to publish internetPrice $40,078 — a $314 understate.
  assert.equal(run({ jsonld: 40392, internet: 40078, sale: 39774, newOrUsed: "used" }), 40392);
});

test("JSON-LD above MSRP is a real dealer markup, kept (BMW X5)", () => {
  // salePrice $799 is a lease teaser; must not win.
  assert.equal(run({ jsonld: 89696, msrp: 87900, internet: 89696, sale: 799, asking: 89696, newOrUsed: "new" }), 89696);
});

test("JSON-LD merely echoing MSRP yields to a real DDC discount (bZ4X)", () => {
  // Dominant price $24,511; JSON-LD $29,995 was just the sticker.
  assert.equal(run({ jsonld: 29995, msrp: 29995, internet: 24261, sale: 24261, asking: 399, newOrUsed: "used" }), 24261);
});

test("an implausibly deep (conditional) discount abstains, not a false bargain (Ram)", () => {
  // -$59,331 off $89,530; visible $30,399 is finance-contingent.
  assert.equal(run({ jsonld: 89530, msrp: 89530, internet: 29999, sale: 30199, asking: 29999, newOrUsed: "new" }), PRICE_ABSTAIN);
});

test("junk JSON-LD far below MSRP falls back to the clean DDC field (vanhyundai)", () => {
  // The accessories total $2,293 the current guardrail was built for.
  assert.equal(run({ jsonld: 2293, msrp: 52000, internet: 50273, sale: 52000, newOrUsed: "new" }), 50273);
});

test("junk JSON-LD with no DDC field falls back to MSRP (safe high, never a bargain)", () => {
  // Nothing advertised survives; MSRP is a real ceiling, so show it rather than
  // print the $2,293 junk or hide a car we do have a defensible number for.
  assert.equal(run({ jsonld: 2293, msrp: 52000, newOrUsed: "new" }), 52000);
});

test("no usable signal at all abstains", () => {
  // Junk JSON-LD, no MSRP, no DDC fields — nothing to stand behind.
  assert.equal(run({ jsonld: 2293, newOrUsed: "new" }), PRICE_ABSTAIN);
});

test("a genuinely cheap OLD used car clears the low floor and is kept", () => {
  // A four-figure 2013 Leaf is a real car at a real price.
  assert.equal(run({ jsonld: 4200, internet: 4200, newOrUsed: "used", year: 2013 }), 4200);
});

test("a finance payment served as the price of a recent used car abstains (Wrangler 4xe)", () => {
  // beckchryslerdodgejeep.com, VIN 1C4RJXP62RW249692, verified live
  // 2026-08-19: JSON-LD offers.price carried $1,280 and every DDC price
  // field was zero. Reached production as the car's price ($1,280) before
  // the year-aware floor; same artifact shipped $1,493 on a 2023 Model Y
  // and $1,150 on a 2023 EQE from other dealer.com rooftops.
  assert.equal(
    run({ jsonld: 1280, internet: 0, sale: 0, asking: 0, msrp: 0, newOrUsed: "used", year: 2024 }),
    PRICE_ABSTAIN
  );
});

test("a payment in JSON-LD yields to a plausible DDC field on a recent used car", () => {
  // If the platform's own fields still carry the real ask while JSON-LD
  // flickers to a payment, the ask is served data we can stand behind.
  assert.equal(
    run({ jsonld: 1493, internet: 34413, sale: 34413, newOrUsed: "used", year: 2023 }),
    34413
  );
});

test("a real recent used ask is untouched by the recent-used floor", () => {
  assert.equal(run({ jsonld: 29943, internet: 31213, newOrUsed: "used", year: 2023 }), 29943);
});

test("a no-discount new car at MSRP does not get lowered or abstained", () => {
  assert.equal(run({ jsonld: 50000, msrp: 50000, internet: 50000, sale: 50000, newOrUsed: "new" }), 50000);
});

// ---------------------------------------------------------------- 2026-08-29
// The third way JSON-LD misleads: it parrots retailValue on a rooftop that
// serves msrp 0, so neither MSRP-anchored guard can fire. All three cases below
// are the exact DDC data layers those rooftops served on 2026-08-29.

test("an offer parroting retailValue is a sticker, not the ask (buddychevy Lyriq)", () => {
  // Rendered: Suggested Retail Price $414,811 / Discount -$376,330 /
  // Today's Price $38,481. We published $414,811 on a $38,481 car.
  const got = resolveDdcPriceTagged(
    { priceUsd: 414811, condition: "used", year: 2025 },
    { msrp: "0", retailValue: "414811", internetPrice: "38481", askingPrice: "38481", salePrice: "0", newOrUsed: "used" }
  );
  assert.equal(got.priceUsd, 38481);
});

test("a real MSRP still governs the discount-depth abstain", () => {
  // Unchanged behaviour: against a TRUE sticker, a discount past
  // MIN_TRUSTED_PRICE_FRACTION is a conditional-rebate stack and we abstain
  // rather than print a bargain we cannot stand behind.
  const got = resolveDdcPriceTagged(
    { priceUsd: 89530, condition: "new", year: 2025 },
    { msrp: "89530", retailValue: "0", internetPrice: "30399", askingPrice: "0", salePrice: "0", newOrUsed: "new" }
  );
  assert.equal(got.priceUsd, 0);
});

test("a genuine ask below a real MSRP is untouched (westerlyjeepram Grand Cherokee 4xe)", () => {
  // Every served field agrees at $71,490 under a $75,870 MSRP. The live-price
  // audit flags this car as an outlier against its cohort, and it is right to
  // — but the number is what the dealer asks, so the resolver must not move it.
  const got = resolveDdcPriceTagged(
    { priceUsd: 71490, condition: "used", year: 2024 },
    { msrp: "75870", retailValue: "0", internetPrice: "71490", askingPrice: "71490", salePrice: "71490", newOrUsed: "used" }
  );
  assert.equal(got.priceUsd, 71490);
});

test("no sticker of either kind leaves the offer standing (astonmartinchicago Model X)", () => {
  // msrp 0 AND retailValue 0. $95,800 for a 2016 Model X is far above its
  // cohort, but three DDC fields and the rendered page all say $95,800: that is
  // the dealer's ask, faithfully reported, and not this resolver's to correct.
  const got = resolveDdcPriceTagged(
    { priceUsd: 95800, condition: "used", year: 2016 },
    { msrp: "0", retailValue: "0", internetPrice: "95800", askingPrice: "95800", salePrice: "95800", newOrUsed: "used" }
  );
  assert.equal(got.priceUsd, 95800);
});

// ---------------------------------------------------------------- 2026-10-25
// dealer.com's `msrp` on a USED car is the dealer's retail book value, not a
// sticker and not an ask. Five VDPs on camelbackcars.com, read live:
//
//   car                 msrp    internet  rendered
//   2023 GV60           38530   34990     $34,990
//   2022 Ioniq 5        29500   21450     $21,450
//   2023 Mach-E         28020   27909     $27,909
//   2020 Model S        35434   31900     $31,900
//   2023 F-150 Lightning 36560  0         "Please Call"
//
// The Lightning had arrived the day before and had no selling field set and
// no JSON-LD offer; we published its book value as the price.

test("a used car with no advertised price abstains instead of printing msrp (camelbackcars Lightning)", () => {
  const got = resolveDdcPriceTagged(
    { priceUsd: undefined, condition: "used", year: 2023 },
    { msrp: "36560", retailValue: "36560", internetPrice: "0", askingPrice: "0", salePrice: "0", newOrUsed: "used" }
  );
  assert.equal(got.priceUsd, PRICE_ABSTAIN);
  assert.equal(got.provenance, undefined);
});

test("a used car's msrp never stands in when the only other signal is junk", () => {
  // The new-car vanhyundai rule (junk JSON-LD, no DDC field → MSRP) must not
  // carry over to used stock, where the field is a book value.
  assert.equal(run({ jsonld: 2293, msrp: 36560, newOrUsed: "used", year: 2023 }), PRICE_ABSTAIN);
});

test("a new car with no advertised price still falls back to its sticker", () => {
  // Unchanged: the manufacturer's figure is a real ceiling on a new car.
  const got = resolveDdcPriceTagged(
    { priceUsd: undefined, condition: "new", year: 2026 },
    { msrp: "52000", internetPrice: "0", askingPrice: "0", salePrice: "0", newOrUsed: "new" }
  );
  assert.equal(got.priceUsd, 52000);
  assert.equal(got.provenance, "ddc-msrp");
});

test("a used car's advertised DDC field still wins over its book value (camelbackcars GV60)", () => {
  const got = resolveDdcPriceTagged(
    { priceUsd: 34990, condition: "used", year: 2023 },
    { msrp: "38530", retailValue: "38530", internetPrice: "34990", askingPrice: "38530", salePrice: "34990", newOrUsed: "used" }
  );
  assert.equal(got.priceUsd, 34990);
});

// ── ON THE PAGE (2026-11-19) ────────────────────────────────────────────────
// Each ladder is the record's own pricing.dprice, read live that day; each
// `want` was confirmed by opening the VDP and searching its rendered text.
const row = (type, typeClass, label, value, isFinalPrice) => ({ type, typeClass, label, value, ...(isFinalPrice ? { isFinalPrice } : {}) });
const onPage = ({ jsonld, tp, ladder, pageText, newOrUsed = "new", year = 2026 }) =>
  resolveDdcPriceTagged({ priceUsd: jsonld, condition: newOrUsed, year }, { ...tp, newOrUsed, ladder, pageText });

test("a tracking field the ladder never prints is not the price (stevinsonhyundai Elantra)", () => {
  const r = onPage({
    jsonld: 23723,
    tp: { internetPrice: "23473", salePrice: "$24,522", msrp: "$23,723", askingPrice: "$23,723" },
    ladder: [
      row("MIDDLE", "msrp", "MSRP", "$23,723"),
      row("MIDDLE", "wholesalePrice", "Delivery & Handling Fee", "$799"),
      row("MIDDLE", "salePrice", "Price", "$24,522"),
      row("-", "ABCRule", "Dealer Discount", "$799"),
      row("TOTAL", "askingPrice", "Stevinson Price", "$23,723", true),
    ],
  });
  assert.equal(r.priceUsd, 23723);
  // the sticker, and tagged as the sticker: this VDP's JSON-LD offer is 24,522
  assert.equal(r.provenance, "ddc-msrp");
  assert.equal(r.offPage, true);
});

test("a hidden figure $7,217 under the page's final price is refused (westonvolvocars XC60)", () => {
  const r = onPage({
    jsonld: 58653,
    tp: { internetPrice: "$60,153", salePrice: "53936", msrp: "$58,555", askingPrice: "51436" },
    ladder: [
      row("MIDDLE", "msrp", "MSRP", "$58,555"),
      row("MIDDLE", "invoicePrice", "Dealer Fee", "$1,199"),
      row("MIDDLE", "retailValue", "Electronic Filing Fee", "$399"),
      row("TOTAL", "internetPrice", "Final Price", "$60,153"),
      row("SICI", "SICRule", "Offers", "$1,500"),
      row("SIF", "SIFRule", "Final Price", "$58,653", true),
    ],
  });
  assert.equal(r.priceUsd, 58653);
});

test("a field the ladder prints still wins over an echoed sticker (ecodriveautomall Equinox)", () => {
  const r = onPage({
    jsonld: 35555,
    year: 2027,
    tp: { internetPrice: "34656", salePrice: "$35,555", msrp: "$35,540", askingPrice: "34656" },
    ladder: [
      row("MIDDLE", "msrp", "MSRP", "$35,540"),
      row("-", "AsubBRule", "Dealer Discount", "$884"),
      row("MIDDLE", "wholesalePrice", "Featured Price", "$34,656"),
      row("MIDDLE", "invoicePrice", "Doc Fee", "$899"),
      row("TOTAL", "salePrice", "Price", "$35,555", true),
    ],
  });
  assert.deepEqual({ price: r.priceUsd, provenance: r.provenance, offPage: r.offPage }, { price: 34656, provenance: "ddc-internet", offPage: undefined });
});

test("sticker less the printed dealer discount counts as printed: the pre-fee price (kennykenttoyota 4Runner)", () => {
  const r = onPage({
    jsonld: 399,
    tp: { internetPrice: "44618", salePrice: "47888", msrp: "$47,888", askingPrice: "$399" },
    ladder: [
      row("MIDDLE", "msrp", "Total SRP", "$47,888"),
      row("-", "ABCRule", "Kenny Kent Savings", "$3,270"),
      row("MIDDLE", "totalFees", "Doc Prep Fee", "$250"),
      row("MIDDLE", "priceAfterFees", "Price", "$44,868"),
      row("TOTAL", "askingPrice", "Dealer-Added Optional Accessories", "$399", true),
    ],
  });
  assert.equal(r.priceUsd, 44618);
});

test("a discount row that names a rebate is left out of that arithmetic", () => {
  const r = onPage({
    jsonld: 399,
    tp: { internetPrice: "40000", msrp: "$47,000" },
    ladder: [
      row("MIDDLE", "msrp", "MSRP", "$47,000"),
      row("-", "ABCRule", "Dealer Discount", "$4,000"),
      row("-", "AsubBRule", "Ford Rebates", "$3,000"),
      row("TOTAL", "askingPrice", "Accessories", "$399", true),
    ],
  });
  assert.equal(r.priceUsd, 47000); // 40,000 is net of the rebate and printed nowhere: the sticker stands
  assert.equal(r.provenance, "ddc-msrp");
});

test("a used ladder opens on Retail Value and the same arithmetic holds (soundford i5)", () => {
  const r = onPage({
    jsonld: 5228,
    newOrUsed: "used",
    year: 2024,
    tp: { internetPrice: "49771", salePrice: "$49,971", msrp: "54999", askingPrice: "60227" },
    ladder: [
      row("MIDDLE", "retailValue", "Retail Value", "$54,999"),
      row("-", "AsubBRule", "Sound Ford Discount", "$5,228"),
      row("MIDDLE", "documentFee", "Negotiable Doc Fee", "$200"),
      row("MIDDLE", "salePrice", "Sale Price**", "$49,971"),
      row("TOTAL", "wholesalePrice", "Total Savings", "$5,228", true),
    ],
  });
  assert.equal(r.priceUsd, 49771);
});

test("a used car whose only figure is off the ladder abstains (kennykenttoyota Land Cruiser, page: PLEASE_CALL)", () => {
  const r = onPage({
    jsonld: 399,
    newOrUsed: "used",
    year: 2024,
    tp: { internetPrice: "PLEASE_CALL", salePrice: "58552", msrp: "61995", askingPrice: "$399" },
    ladder: [
      row("MIDDLE", "retailValue", "Retail Value", "$61,995"),
      row("UNKNOWN", "internetPrice", "Price", "PLEASE_CALL"),
      row("MIDDLE", "totalFees", "Doc Prep Fee", "$250"),
      row("TOTAL", "askingPrice", "Dealer-Added Optional Accessories", "$399", true),
    ],
  });
  assert.equal(r.priceUsd, PRICE_ABSTAIN);
  assert.equal(r.offPage, true);
});

test("a ladder with no figure on it is no evidence: the resolver reads as before (cityworldtoyota)", () => {
  const r = onPage({
    jsonld: undefined,
    year: 2027,
    tp: { internetPrice: "63613", msrp: "63613", askingPrice: "63613" },
    ladder: [row("UNKNOWN", "retailValue", "Total SRP", "PLEASE_CALL")],
  });
  assert.equal(r.priceUsd, 63613);
  assert.equal(r.offPage, undefined);
});

test("no ladder and no page text: unchanged", () => {
  const r = onPage({ jsonld: 58665, tp: { internetPrice: "58665", salePrice: "54552", msrp: "$58,665", askingPrice: "54552" } });
  assert.equal(r.priceUsd, 54552);
});

test("VDP text: a figure the page does not print is refused and reported", () => {
  const tp = { internetPrice: "58665", salePrice: "54552", msrp: "58665", askingPrice: "54552" };
  const r = onPage({ jsonld: 58665, tp, pageText: "MSRP No Hidden Fees $58,665 Get Your Price" });
  assert.equal(r.priceUsd, 58665);
  assert.equal(r.offPage, true);
  // …and one it does print is taken as before.
  const shown = onPage({ jsonld: 58665, tp, pageText: "MSRP $58,665 Our Price $54,552" });
  assert.deepEqual({ price: shown.priceUsd, offPage: shown.offPage }, { price: 54552, offPage: undefined });
});

test("VDP text that prints no candidate at all is a client-rendered page: unchanged", () => {
  const r = onPage({
    jsonld: 58665,
    tp: { internetPrice: "58665", salePrice: "54552", msrp: "58665", askingPrice: "54552" },
    pageText: "Loading vehicle details",
  });
  assert.equal(r.priceUsd, 54552);
  assert.equal(r.offPage, undefined);
});
