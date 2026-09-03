// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/watchlist.test.ts
//
// The free alert sends the saved shelf to the server as a list of listing
// ids. The server (0060) refuses anything that is not lowercase 17-character
// ids, at most fifty — so the client must never build a list it would refuse.

import test from "node:test";
import assert from "node:assert/strict";
import { watchlistIds, WATCHLIST_MAX } from "@/lib/watchlist";

const vin = (n: number) => `1fadp3f2${String(n).padStart(9, "0")}`.slice(0, 17);

test("ids are lowercased, de-duplicated, and junk is dropped", () => {
  assert.deepEqual(watchlistIds(["1FADP3F20HL000001", "1fadp3f20hl000001", "not-a-vin", ""]), ["1fadp3f20hl000001"]);
});

test("the list is capped at the server's ceiling, keeping the first (newest) ids", () => {
  const many = Array.from({ length: 80 }, (_, i) => vin(i));
  const out = watchlistIds(many);
  assert.equal(out.length, WATCHLIST_MAX);
  assert.equal(out[0], vin(0));
  assert.equal(out.at(-1), vin(WATCHLIST_MAX - 1));
  // And what it builds is exactly the shape 0060 accepts.
  assert.match(`ids=${out.join(",")}`, /^ids=([a-z0-9]{17}(,[a-z0-9]{17}){0,49})?$/);
});
