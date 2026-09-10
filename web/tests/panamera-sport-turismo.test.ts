// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/panamera-sport-turismo.test.ts
//
// The 971 Panamera came in three bodies and VIN position 4 says which: A
// standard wheelbase, B Executive, C Sport Turismo. The keying pass listed
// A and B; the verifier's sweep found C carrying the same three plug-in
// grades, and a real Sport Turismo sits in the vPIC cache. (A bare "Panamera"
// with no trim is refused by design even with a VIN; the feed files these
// under "Panamera E-Hybrid".)

import test from "node:test";
import assert from "node:assert/strict";
import { matchEnrichment } from "@/lib/enrichment/match";

test("a 971 Sport Turismo resolves to its grade's row on the VIN alone", () => {
  const r = matchEnrichment({ vin: "WP0CK2A70PL161021", usMarket: true, make: "PORSCHE", model: "Panamera E-Hybrid", modelYear: 2023 }, null);
  assert.equal(r.exact?.id, "panamera-4s-ehybrid-2021-23");
  const four = matchEnrichment({ vin: "WP0CE2A72KL100001", usMarket: true, make: "PORSCHE", model: "Panamera E-Hybrid", modelYear: 2019 }, null);
  assert.equal(four.exact?.id, "panamera-4-ehybrid-2019-20");
});
