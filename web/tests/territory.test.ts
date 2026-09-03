// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/territory.test.ts
//
// A shopper's ZIP narrows the programs a car page names to the ones whose
// territory holds it. Wrong in the hiding direction is the expensive error
// (money a customer never hears about), so every case below pairs a ZIP
// that must keep a program with one that must drop it — a control on both
// sides of each line.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { keepForZip } from "@/lib/incentives/territory";
import { programById } from "@/lib/incentives/registry";

const table = JSON.parse(readFileSync(new URL("../data/utility-zips.json", import.meta.url), "utf8"));
const keep = (zip: string) => keepForZip(zip, table)?.keep ?? [];

test("San Francisco keeps PG&E and the statewide program, not the Southern California utilities", () => {
  const sf = keepForZip("94110", table)!;
  assert.equal(sf.state, "CA");
  assert.ok(sf.keep.includes("ca-pge-pre-owned-ev"), "PG&E distributes in the city, though its own ZIP report omits it");
  assert.ok(sf.keep.includes("ca-clean-cars-4-all"), "a regional program is kept for the whole state");
  for (const id of ["ca-sce-pre-owned-ev", "ca-ladwp-used-ev", "ca-sdge-pre-owned-ev", "ca-svce-ev-rebate", "ca-3ce-electrify-your-ride"]) {
    assert.ok(!sf.keep.includes(id), `${id} is not a San Francisco utility`);
  }
});

test("Los Angeles keeps LADWP and drops PG&E; San Diego keeps SDG&E", () => {
  const la = keep("90012");
  assert.ok(la.includes("ca-ladwp-used-ev"));
  assert.ok(!la.includes("ca-pge-pre-owned-ev"));
  const sd = keep("92101");
  assert.ok(sd.includes("ca-sdge-pre-owned-ev"));
  assert.ok(!sd.includes("ca-ladwp-used-ev"));
});

test("the community-choice aggregators narrow by county or hand-listed ZIP", () => {
  assert.ok(keep("94901").includes("ca-mce-ev-instant-rebate"), "San Rafael is Marin, MCE");
  assert.ok(!keep("94110").includes("ca-mce-ev-instant-rebate"));
  assert.ok(keep("94402").includes("ca-westlight-used-ev"), "San Mateo");
  assert.ok(keep("93940").includes("ca-3ce-electrify-your-ride"), "Monterey");
  assert.ok(keep("95014").includes("ca-svce-ev-rebate"), "Cupertino is an SVCE member");
  assert.ok(!keep("95112").includes("ca-svce-ev-rebate"), "San Jose is not");
});

test("outside California: Philadelphia keeps PECO, Manhattan keeps only New York's program, Las Vegas keeps nothing", () => {
  assert.deepEqual(keep("19103"), ["pa-peco-smart-driver"]);
  assert.deepEqual(keep("10001"), ["ny-drive-clean-rebate"]);
  assert.equal(keepForZip("89101", table)!.state, "NV");
  assert.deepEqual(keep("89101"), []);
});

test("a utility with no territory data is kept for its whole state, never dropped", () => {
  // Stowe Electric is not in the EIA ZIP table; a Burlington ZIP keeps it
  // beside Burlington Electric, and a Vermont shopper is never told it is gone.
  assert.equal(programById("vt-stowe-electric-ev-incentive")?.jurisdiction.kind, "utility");
  assert.equal(table.programs["vt-stowe-electric-ev-incentive"], undefined);
  const btv = keep("05401");
  assert.ok(btv.includes("vt-burlington-electric-ev-rebate"));
  assert.ok(btv.includes("vt-stowe-electric-ev-incentive"));
  assert.ok(!btv.includes("vt-washington-electric-coop-ev-incentive"), "the co-op's territory is known and does not hold Burlington");
});

test("a malformed or unknown ZIP answers null, so the page shows every match rather than none", () => {
  assert.equal(keepForZip("9411", table), null);
  assert.equal(keepForZip("abcde", table), null);
  assert.equal(keepForZip("00000", table), null);
});
