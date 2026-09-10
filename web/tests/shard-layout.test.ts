// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/shard-layout.test.ts
//
// The browse feed's shard layout (lib/listings/pack.ts). SHARDS went 24 → 48
// on 2026-09-10 with the publisher writing both cuts for a week, so the thing
// that must hold is that a build reading one cut can never be handed a file
// of the other: the count is part of every file's name.
import test from "node:test";
import assert from "node:assert/strict";
import { SHARDS, shardArtifactName, shardOfId } from "../lib/listings/pack";

const ids = Array.from({ length: 60_000 }, (_, i) => `1hgcm82633a${String(i).padStart(6, "0")}`);

test("every car lands in exactly one shard of the live cut", () => {
  for (const id of ids.slice(0, 5_000)) {
    const n = shardOfId(id);
    assert.ok(Number.isInteger(n) && n >= 0 && n < SHARDS, `${id} -> ${n}`);
  }
});

test("the live cut stays balanced: no shard more than 15% off the even split", () => {
  const counts = new Array<number>(SHARDS).fill(0);
  for (const id of ids) counts[shardOfId(id)]++;
  const even = ids.length / SHARDS;
  counts.forEach((c, n) => assert.ok(Math.abs(c - even) / even < 0.15, `shard ${n}: ${c} vs ${even.toFixed(0)}`));
});

test("a shard's storage name carries its cut, so the live and retired cuts share no name", () => {
  const live = new Set(Array.from({ length: SHARDS }, (_, n) => shardArtifactName(n)));
  assert.equal(live.size, SHARDS);
  for (let n = 0; n < 24; n++) assert.ok(!live.has(`shard-${n}`), `the live cut reuses the retired name shard-${n}`);
  assert.notEqual(shardArtifactName(5, 24), shardArtifactName(5, 48));
});

test("the retired 24-way cut is the same hash, so the files the publisher still writes match what old builds expect", () => {
  // The route of every pre-2026-09-10 build computed FNV-1a % 24 itself.
  const fnv24 = (id: string) => {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % 24;
  };
  for (const id of ids.slice(0, 5_000)) assert.equal(shardOfId(id, 24), fnv24(id));
});
