import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTrimOverrides, loadTrimOverrides } from "../lib/trim-overrides.mjs";

const VIN = "1FT6W1EV4PWG56454";

test("applyTrimOverrides flags the feed trim a hand-verified row contradicts", () => {
  const listings = [{ vin: VIN, trim: "Pro" }];
  const n = applyTrimOverrides(listings, new Map([[VIN, "XLT"]]));
  assert.equal(n, 1);
  assert.equal(listings[0].trimSuspect, "XLT");
});

test("does not override a listing the automated detector already flagged", () => {
  const listings = [{ vin: VIN, trim: "Pro", trimSuspect: "Lariat" }];
  const n = applyTrimOverrides(listings, new Map([[VIN, "XLT"]]));
  assert.equal(n, 0);
  assert.equal(listings[0].trimSuspect, "Lariat"); // untouched
});

test("stands down once the feed itself catches up to the verified name", () => {
  const listings = [{ vin: VIN, trim: "XLT" }];
  const n = applyTrimOverrides(listings, new Map([[VIN, "XLT"]]));
  assert.equal(n, 0);
  assert.equal(listings[0].trimSuspect, undefined);
});

test("ignores VINs and blank trims outside the override map", () => {
  const listings = [
    { vin: "SOMEOTHERVIN12345", trim: "Pro" },
    { vin: VIN, trim: "" },
  ];
  const n = applyTrimOverrides(listings, new Map([[VIN, "XLT"]]));
  assert.equal(n, 0);
});

test("empty override map is a no-op", () => {
  const listings = [{ vin: VIN, trim: "Pro" }];
  assert.equal(applyTrimOverrides(listings, new Map()), 0);
  assert.equal(applyTrimOverrides(listings, undefined), 0);
});

test("loadTrimOverrides reads the real hand-curated registry and includes the Lightning row", async () => {
  const byVin = await loadTrimOverrides();
  assert.equal(byVin.get(VIN), "XLT");
});
