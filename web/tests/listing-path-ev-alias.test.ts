// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/listing-path-ev-alias.test.ts
//
// The listing page matches on the dealer feed's model string, and dealers
// repeat vPIC's badge-stripped name: 259 live "XC40"s on 2026-09-10 were
// XC40 Recharges (trims "Recharge Ultimate", "Recharge Plus") whose rows
// are keyed "XC40 Recharge Pure Electric", so they printed nothing. The
// badge aliases in lib/enrichment/vpicEvAlias.ts were gated on
// VinDecode.electrificationLevel, which only /vin/ set. Listings now carry
// vpicEvLevel — vPIC's affirmative reading, attached in
// scraper/vpic-enrich.mjs — and decodeFromListing passes it through, so the
// same gate opens on the listing page. These pin the gate from that side:
// the field unlocks the alias, its absence does not, and the wrong level
// does not.

import test from "node:test";
import assert from "node:assert/strict";
import { enrichListing } from "@/lib/listings/enrich";
import { packIndex, unpackIndex } from "@/lib/listings/pack";
import type { Listing } from "@/lib/listings/types";
import type { CardRow } from "@/lib/listings/card";

// A real live prefix (YV4ED3UM…, 2023 Recharge Ultimate AWD); tail is filler.
const XC40_2023 = "YV4ED3UM5P2000001";
const base: Listing = {
  id: "x",
  vin: XC40_2023,
  year: 2023,
  make: "Volvo",
  model: "XC40",
  trim: "Recharge Ultimate",
  drive: "AWD",
  priceUsd: 40000,
  sellerType: "dealer",
};

test("a dealer's badge-stripped 'XC40' reaches the Recharge row when vPIC affirmed BEV", () => {
  const e = enrichListing({ ...base, vpicEvLevel: "BEV" });
  assert.equal(e.row?.id, "xc40-recharge-2022-23");
});

test("without the field the listing path is unchanged: no row, no candidates", () => {
  const e = enrichListing(base);
  assert.equal(e.row, undefined);
  assert.equal(e.enrichment.candidates?.length ?? 0, 0);
});

test("the level must be the one the alias names: PHEV does not open a BEV alias", () => {
  const e = enrichListing({ ...base, vpicEvLevel: "PHEV" });
  assert.equal(e.row, undefined);
  assert.equal(e.enrichment.candidates?.length ?? 0, 0);
});

test("the shard carries the level through pack/unpack, and its absence stays absent", () => {
  const row = { id: "yv4ed3um5p2000001", hay: "", year: 2023, make: "VOLVO", model: "XC40", title: "t", priceUsd: 1, realPrice: true, tiles: [] } as CardRow;
  const [withLevel, without] = unpackIndex(packIndex([{ ...row, vpicEvLevel: "BEV" }, row]));
  assert.equal(withLevel.vpicEvLevel, "BEV");
  assert.equal(without.vpicEvLevel, undefined);
});
