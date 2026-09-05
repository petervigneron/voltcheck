// The wall between the public feed and the Pro fields
// (lib/listings/proSignals.ts, lib/listings/proSeal.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { publicRows, packPro, unpackPro, mergePro } from "../lib/listings/proSignals";
import { packIndex } from "../lib/listings/pack";
import { seal, open } from "../lib/listings/proSeal";
import type { CardRow } from "../lib/listings/card";

const base = (id: string, extra: Partial<CardRow> = {}): CardRow => ({
  id, hay: "", year: 2023, make: "Kia", model: "EV6", title: "2023 Kia EV6", priceUsd: 30000, realPrice: true, tiles: [], ...extra,
});
const rows: CardRow[] = [
  base("a", { askVsMarket: { deltaUsd: -4200, peerN: 12, trimMatched: true }, askVsSold: -900, incentive: { name: "Clean Vehicle Rebate", usd: 2000, count: 2, utility: false, state: "CA" } }),
  base("b", { incentive: { name: "Clean Vehicle Rebate", count: 1, state: "CA", utility: true } }),
  base("c"),
];

test("publicRows strips every Pro field and only those, without touching the originals", () => {
  const pub = publicRows(rows);
  for (const r of pub) {
    assert.equal(r.askVsMarket, undefined);
    assert.equal(r.askVsSold, undefined);
    assert.equal(r.incentive, undefined);
  }
  assert.equal(pub[0].priceUsd, 30000);
  assert.equal(rows[0].askVsMarket?.deltaUsd, -4200, "the caller's rows are untouched");
  assert.equal(pub[2], rows[2], "a row with nothing to strip is the same object");
  const packed = JSON.stringify(packIndex(pub));
  for (const k of ['"am"', '"as"', '"ic"']) assert.equal(packed.includes(k), false, `public shard carries no ${k}`);
  assert.deepEqual(packIndex(pub).pn, []);
});

test("packPro/unpackPro round-trip the Pro fields, and mergePro puts them back", () => {
  const packed = packPro(rows, "2026-09-05T00:00:00Z");
  assert.equal(packed.r.length, 2, "only cars with a Pro field are carried");
  assert.deepEqual(packed.pn, ["Clean Vehicle Rebate"]);
  const sig = unpackPro(JSON.parse(JSON.stringify(packed)));
  assert.deepEqual(sig.get("a")?.askVsMarket, { deltaUsd: -4200, peerN: 12, trimMatched: true });
  assert.deepEqual(sig.get("a")?.incentive, { name: "Clean Vehicle Rebate", usd: 2000, overCapUsd: undefined, count: 2, utility: false, state: "CA" });
  assert.deepEqual(sig.get("b")?.incentive, { name: "Clean Vehicle Rebate", usd: undefined, overCapUsd: undefined, count: 1, utility: true, state: "CA" });
  assert.equal(sig.get("b")?.askVsMarket, undefined);
  const pub = publicRows(rows);
  const merged = mergePro(pub, sig);
  assert.notEqual(merged, pub, "a fresh array for React");
  assert.deepEqual(merged[0].askVsMarket, rows[0].askVsMarket);
  // Through JSON, because the unpacker writes absent figures as explicit
  // undefined keys — the same shape lib/listings/pack.ts unpacks to.
  assert.deepEqual(JSON.parse(JSON.stringify(merged[1].incentive)), rows[1].incentive);
  assert.equal(merged[0].askVsSold, undefined, "ask-vs-sold is not carried anywhere");
});

test("seal/open round-trip; a wrong key or a tampered byte refuses", () => {
  const plain = JSON.stringify(packPro(rows, "2026-09-05T00:00:00Z"));
  const sealed = seal(plain, "k1");
  assert.equal(open(sealed, "k1"), plain);
  assert.equal(sealed.toString("utf8").includes("Clean Vehicle"), false, "ciphertext carries no plaintext");
  assert.throws(() => open(sealed, "k2"));
  const tampered = Buffer.from(sealed);
  tampered[20] ^= 1;
  assert.throws(() => open(tampered, "k1"));
  assert.throws(() => open(new Uint8Array(5), "k1"));
});
