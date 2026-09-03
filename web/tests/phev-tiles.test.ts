// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/phev-tiles.test.ts
//
// A plug-in hybrid was never sold with DC fast charging or a heat pump, so
// the card's alarm tiles ("No fast charging", "No heat pump") said of it
// that it lacked something no shopper for that car expects. On the live
// feed of 2026-09-03 that was 1,641 of the 1,844 sub-70-mile cars in one
// shard. The owner: "I don't think we should be tagging plug in hybrids as
// missing fast charging or heat pumps." A battery-electric keeps both.
import test from "node:test";
import assert from "node:assert/strict";
import { enrichListing } from "@/lib/listings/enrich";
import { listingTiles } from "@/lib/listings/tiles";
import { vehicleKind } from "@/lib/listings/kind";
import type { Listing } from "@/lib/listings/types";

const texts = (l: Listing) => listingTiles(enrichListing(l)).map((t) => t.text);

test("a plug-in hybrid gets no 'missing' tile for fast charging or a heat pump", () => {
  // 2024 Jeep Wrangler 4xe: the row settles it as a plug-in (the incentive
  // tests lean on the same fixture).
  const phev: Listing = {
    id: "t", vin: "1C4JJXP68RW100001", year: 2024, make: "Jeep", model: "Wrangler 4xe", trim: "Sahara",
    priceUsd: 39_000, mileage: 24_000, state: "IL", sellerType: "dealer", condition: "used",
  };
  const e = enrichListing(phev);
  assert.equal(vehicleKind(e), "PHEV", "the fixture is a plug-in");
  // The control: the row does say it cannot fast-charge, so the tile's
  // absence is the rule at work, not a row with nothing to say.
  assert.equal(e.fastCharge.status, "no", "the row itself says no DC fast charging");
  const t = texts(phev);
  assert.equal(t.includes("No fast charging"), false);
  assert.equal(t.includes("Fast charging?"), false);
  assert.equal(t.includes("No heat pump"), false);
});

test("a battery-electric that lacks a heat pump still says so", () => {
  // 2023 Bolt EUV: no heat pump, per GM's own documents (content/facts).
  const bev: Listing = {
    id: "t", vin: "1G1FY6S04P4100001", year: 2023, make: "Chevrolet", model: "Bolt EUV", trim: "LT",
    priceUsd: 21_500, mileage: 24_000, state: "IL", sellerType: "dealer", condition: "used",
  };
  assert.equal(vehicleKind(enrichListing(bev)), "BEV");
  assert.ok(texts(bev).includes("No heat pump"), "the control: the alarm still fires on a battery-electric");
});
