// node --test (from web/)
//
// firstSeenAt rides the public shards as epoch seconds (pack.ts `fs`) and
// must come back as the very string buildIndex put on the card row: the
// alert sender reads the shards, not the database, and keys "new listing" on
// this field since 2026-10-30 (owner: newly listed means new on our site).
import test from "node:test";
import assert from "node:assert/strict";
import { packIndex, unpackIndex } from "../lib/listings/pack";
import type { CardRow } from "../lib/listings/card";

const row = (extra: Partial<CardRow>): CardRow => ({
  id: "1ft6w1ev4pwg00997",
  hay: "2023 ford f-150 lightning pro",
  year: 2023,
  make: "Ford",
  model: "F-150 Lightning",
  title: "2023 Ford F-150 Lightning Pro",
  priceUsd: 35999,
  realPrice: true,
  cut: undefined,
  tiles: [],
  ...extra,
});

test("firstSeenAt survives pack → unpack, field for field", () => {
  // Key order is buildCardIndex's, not this literal's, so compare
  // structurally: every field the row went in with comes back equal.
  const r = row({ firstSeenAt: "2026-10-29T01:04:15Z" });
  const [back] = unpackIndex(packIndex([r]));
  assert.equal(back.firstSeenAt, "2026-10-29T01:04:15Z");
  assert.deepEqual(JSON.parse(JSON.stringify(back)), JSON.parse(JSON.stringify(r)));
});

test("a row packed before the field existed unpacks with firstSeenAt undefined", () => {
  const packed = packIndex([row({})]);
  delete (packed.r[0] as { fs?: number }).fs;
  const [back] = unpackIndex(packed);
  assert.equal(back.firstSeenAt, undefined);
});

test("the packed form is seconds, not the string", () => {
  const packed = packIndex([row({ firstSeenAt: "2026-10-29T01:04:15Z" })]);
  assert.equal((packed.r[0] as { fs?: number }).fs, Date.parse("2026-10-29T01:04:15Z") / 1000);
});
