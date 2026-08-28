// node --test scraper/test/dealeron-price.test.mjs
//
// The DealerOn HTML path's price resolve. Every case is a real VDP read on
// 2026-08-23, with the served numbers taken off the vehicle's own element
// (data-price / data-msrp / data-pricelib) and `want` the number the page
// renders to a shopper. The Suntrup case is the one that started this: its
// JSON-LD published the SAVINGS line as the offer price and the site printed a
// $15,021 asking price on a $57,944 truck.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveDealerOnPriceTagged } from "../lib/platforms/dealeron.mjs";
import { JSONLD, DEOL_SELLING, DEOL_DISPLAYED } from "../lib/price-provenance.mjs";

// A price library as DealerOn serves it: base64 of "Key:Value;Key:Value".
const lib = (pairs) => Buffer.from(pairs, "utf8").toString("base64");

const run = ({ jsonld, msrp, sellingPrice, displayedPrice, priceLibrary, condition, year }) =>
  resolveDealerOnPriceTagged(
    { priceUsd: jsonld, priceProvenance: jsonld != null ? JSONLD : undefined, condition, year },
    { msrp, sellingPrice, displayedPrice, priceLibrary }
  );

test("a JSON-LD offer far below MSRP is the savings line, not the price (Suntrup F-150 Lightning)", () => {
  // Rendered: MSRP $72,965 / Suntrup Savings -$15,021 / Final Price $57,944.
  // $15,021 cleared the $15,000 new floor by $21, so only the MSRP anchor
  // catches it.
  const got = run({
    jsonld: 15021,
    msrp: 72965,
    sellingPrice: 57944,
    displayedPrice: "72965",
    priceLibrary: lib(
      "MSRP:72965.0;Internet Price:57944.0;Selling Price:57944.0;calc_INTERNET PRICE:57944.0;calc_You Save:15021.0"
    ),
    condition: "new",
    year: 2025,
  });
  assert.equal(got.priceUsd, 57944);
});

test("a healthy JSON-LD offer still wins and keeps its tag (hartmotors Wrangler 4xe)", () => {
  // The doc fee is in the offer and in calc_INTERNET PRICE alike; nothing here
  // contradicts itself, so the row must not move.
  const got = run({
    jsonld: 27647,
    msrp: 26950,
    sellingPrice: 26950,
    displayedPrice: "26950",
    priceLibrary: lib("MSRP:26950.0;Selling Price:26950.0;calc_Dealer Doc Fee:697.0;calc_INTERNET PRICE:27647.0"),
    condition: "used",
    year: 2023,
  });
  assert.deepEqual(got, { priceUsd: 27647, provenance: JSONLD });
});

test("a used car with no MSRP anchor keeps its offer price (goosecreek Model Y)", () => {
  // data-msrp is 0 on this template's used cars, so there is nothing to anchor
  // against and the offer stands on its own.
  const got = run({
    jsonld: 23888,
    msrp: undefined,
    displayedPrice: "23888",
    priceLibrary: lib("Selling Price:23888.0;calc_INTERNET PRICE:23888.0"),
    condition: "used",
    year: 2021,
  });
  assert.deepEqual(got, { priceUsd: 23888, provenance: JSONLD });
});

test("with no offer price at all, the library still answers", () => {
  const got = run({
    jsonld: undefined,
    msrp: 72965,
    sellingPrice: 57944,
    displayedPrice: "72965",
    priceLibrary: lib("MSRP:72965.0;calc_INTERNET PRICE:57944.0"),
    condition: "new",
    year: 2025,
  });
  assert.equal(got.priceUsd, 57944);
});

test("the rendered selling price is taken when there is no library", () => {
  const got = run({
    jsonld: undefined,
    msrp: 72965,
    sellingPrice: 57944,
    displayedPrice: "72965",
    condition: "new",
    year: 2025,
  });
  assert.deepEqual(got, { priceUsd: 57944, provenance: DEOL_SELLING });
});

test("the sticker is the last rung on a used car, where sticker and ask agree", () => {
  const got = run({ jsonld: undefined, displayedPrice: "17950", msrp: 17950, condition: "used", year: 2018 });
  assert.deepEqual(got, { priceUsd: 17950, provenance: DEOL_DISPLAYED });
});

test("once the page contradicts itself the sticker goes quiet rather than overstating", () => {
  // Junk offer, no library, no data-price: publishing $72,965 would overstate
  // by the whole discount, so the claim abstains instead.
  const got = run({ jsonld: 15021, msrp: 72965, displayedPrice: "72965", condition: "new", year: 2025 });
  assert.deepEqual(got, { priceUsd: 0, provenance: undefined });
});

test("a sub-floor offer with no other signal abstains", () => {
  const got = run({ jsonld: 750, condition: "new", year: 2026 });
  assert.deepEqual(got, { priceUsd: 0, provenance: undefined });
});

// ---------------------------------------------------------------- 2026-08-28
// Both cases below are the exact base64 libraries and element attributes those
// rooftops served on 2026-08-28, found by scraper/live-price-audit.mjs against
// the production feed and confirmed against each dealer's rendered page.

test("a repeated library label does not weld its counter onto the price (greenvilletoyota bZ)", () => {
  // Served: "Internet Price:40094.0" AND "Internet Price: 2:40094.0". Splitting
  // on the first colon let the second line overwrite the first with
  // " 2:40094.0", and stripping non-digits welded it into 240094 — which is
  // what the site published against the page's own $40,094.
  const got = run({
    jsonld: undefined,
    msrp: 40807,
    sellingPrice: undefined,
    displayedPrice: "40094",
    priceLibrary: lib(
      "MSRP:40807.00;Internet Price:40094.0;Invoice Price:39994.0;Feed - MSRP:40807.0;" +
        "Internet Price: 2:40094.0;Transparent price:40094.0;Conditional:1000.0;MSRP: 2:40807.0;" +
        "YOU SAVE*::713.00;Doc Fee:898.0;Calc_FinalPrice_with_DocFee:40992.0"
    ),
    condition: "new",
    year: 2026,
  });
  assert.equal(got.priceUsd, 40094);
});

test("a library value that is not a number is refused, never welded", () => {
  // The backstop for the next malformed field: no leading digit may be glued
  // on by deleting the separator. Nothing answers, so the claim goes quiet.
  const got = run({
    jsonld: undefined,
    msrp: 40807,
    priceLibrary: lib("Internet Price:2:40094.0"),
    condition: "new",
    year: 2026,
  });
  assert.notEqual(got.priceUsd, 240094);
});

test("the MSRP anchor guards the library rung too, not only JSON-LD (glassmankia EV9)", () => {
  // Served: data-msrp 65875, data-price 15875, and a library stacking a
  // $50,000 "Dealer Discount" onto a $65,875 car. The JSON-LD offer of $15,875
  // was already caught as junk; the identical number then came off the library
  // rung, which nothing tested, and the site showed a $15,875 EV9.
  const got = run({
    jsonld: 15875,
    msrp: 65875,
    sellingPrice: 15875,
    displayedPrice: "15875",
    priceLibrary: lib(
      "MSRP:65875.0;Internet Price:15875.0;Selling Price:15875.0;calc_MSRP:65875.0;" +
        "calc_Dealer Discount:50000.0;calc_INTERNET PRICE:15875.0;calc_FINAL PRICE:5875.0"
    ),
    condition: "new",
    year: 2026,
  });
  // 0 is ingest.mjs's abstain: the car stays listed, the price claim goes
  // quiet. Matching nothing is honest; a $15,875 EV9 is not.
  assert.equal(got.priceUsd, 0);
});
