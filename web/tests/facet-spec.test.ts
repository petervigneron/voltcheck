// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/facet-spec.test.ts
//
// The per-model curated spec rail (lib/listings/facetSpec.ts), starting with
// the Ioniq 5 (docs/facet-spec-top-models.md, owner sign-off 2026-09-01), and
// the two changes it leans on: the drivetrain filter ORing its values like
// the other spec facets, and the exact-matched enrichment row's drive filling
// a feed that states none. Browse.tsx's facet block itself has no unit
// harness; these pin the lib-level behavior it composes.
import test from "node:test";
import assert from "node:assert/strict";
import { facetsFor } from "@/lib/listings/facetSpec";
import { FACET_OF, buildTests } from "@/lib/listings/match";
import { describeFilter, SPEC_FACETS } from "@/lib/filters";
import { enrichListing } from "@/lib/listings/enrich";
import type { CardRow } from "@/lib/listings/card";
import type { Listing } from "@/lib/listings/types";

test("the Ioniq 5 rail is trim, battery, drivetrain — under every feed spelling", () => {
  for (const model of ["Ioniq 5", "IONIQ 5", "ioniq5"]) {
    assert.deepEqual(
      facetsFor("Hyundai", model).map((f) => f.key),
      ["trim", "kwh", "drive"],
      `spelling: ${model}`
    );
  }
});

test("an uncurated model keeps the default rail in its standing order", () => {
  assert.deepEqual(
    facetsFor("Kia", "EV6").map((f) => f.key),
    SPEC_FACETS.map((f) => f.key)
  );
});

test("Ioniq 5 N is a different car and gets no Ioniq 5 curation", () => {
  // Same no-prefix contract as the fact links: matching nothing is honest.
  assert.deepEqual(
    facetsFor("Hyundai", "Ioniq 5 N").map((f) => f.key),
    SPEC_FACETS.map((f) => f.key)
  );
});

test("drivetrain values OR, and a single value is the one-element case", () => {
  const row = (drive?: CardRow["drive"]): CardRow =>
    ({ id: "x", hay: "", year: 2023, make: "Hyundai", model: "Ioniq 5", title: "", priceUsd: 1, realPrice: true, drive, tiles: [] }) as CardRow;
  const both = buildTests((k) => (k === "drive" ? "RWD,AWD" : ""))["drive"]!;
  assert.equal(both(row("RWD")), true);
  assert.equal(both(row("AWD")), true);
  assert.equal(both(row("FWD")), false);
  assert.equal(both(row(undefined)), false, "an unknown drivetrain cannot satisfy a drivetrain filter");
  const one = buildTests((k) => (k === "drive" ? "AWD" : ""))["drive"]!;
  assert.equal(one(row("AWD")), true);
  assert.equal(one(row("RWD")), false);
  assert.equal(FACET_OF.drive(row("AWD")), "AWD");
  assert.equal(FACET_OF.drive(row(undefined)), undefined);
  assert.equal(describeFilter("drive", "RWD,AWD"), "RWD or AWD");
});

const listing = (over: Partial<Listing> & Pick<Listing, "vin" | "year" | "make" | "model">): Listing => ({
  id: over.vin.toLowerCase(),
  priceUsd: 40000,
  sellerType: "dealer",
  ...over,
});

test("the VIN-matched row states the drivetrain the feed left blank", () => {
  // Same VINs trim-trust.test.ts pins ranges for; here the question is the
  // row's drive, which buildIndex backfills into CardRow.drive when l.drive
  // is absent. 19% of live Ioniq 5s stated no drivetrain on 2026-09-01.
  const at = (vin: string, year: number) =>
    enrichListing(listing({ vin, year, make: "Hyundai", model: "Ioniq 5" }));
  assert.equal(at("7YAKMDDC4SY018488", 2025).row?.drive, "AWD", "US-built C-coded car");
  assert.equal(at("KM8KM4DE7RU251819", 2024).row?.drive, "RWD", "Korea-built E-coded car");
  assert.equal(at("KM8KM4AB4PU177217", 2023).row?.drive, "RWD", "Standard Range is RWD");
});

test("a feed that does state a drivetrain is never overridden", () => {
  // The backfill is l.drive ?? row.drive — this pins the row side agreeing
  // with the feed on a stated car, so the ?? can never paper over a conflict
  // silently going the other way.
  const e = enrichListing(
    listing({ vin: "7YAKMDDC4SY018488", year: 2025, make: "Hyundai", model: "Ioniq 5", drive: "AWD" })
  );
  assert.equal(e.row?.drive, "AWD");
});
