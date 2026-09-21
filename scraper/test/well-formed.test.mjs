// node --test scraper/test/well-formed.test.mjs
//
// A description cut in the middle of an emoji ends in a lone UTF-16
// surrogate. Node serializes it ("\ud83d") and PostgREST refuses the whole
// chunk as invalid JSON (HTTP 400 PGRST102) — every rolling-crawl and
// browser-crawl failure 2026-09-19..21. lib/well-formed.mjs has the account.
import test from "node:test";
import assert from "node:assert/strict";
import { cut, repairWellFormed } from "../lib/well-formed.mjs";

test("cut never ends on half a character", () => {
  const s = "Great deal 🔥 today";
  const i = s.indexOf("🔥");
  assert.equal(cut(s, i + 1), "Great deal "); // the cut fell between the two halves
  assert.equal(cut(s, i + 2), "Great deal 🔥"); // whole emoji fits
  assert.equal(cut(s, 100), s);
  assert.equal(cut("abc", 2), "ab");
  assert.equal(cut(undefined, 5), undefined);
  assert.ok(JSON.stringify({ d: cut(s, i + 1) }).indexOf("\\ud") === -1);
});

test("repairWellFormed fixes every string in a row and names it", () => {
  const rows = [
    { vin: "1FT6W1EV0PWG00001", domain: "example.com", description: "Welcome 🔥 deal".slice(0, 9), images: ["ok", "x\udc00"], nested: { a: { b: "fine" } } },
    { vin: "1FT6W1EV0PWG00002", domain: "other.com", description: "all good 🔥" },
  ];
  const repaired = repairWellFormed(rows);
  assert.equal(repaired.length, 2);
  assert.deepEqual(repaired.map((r) => [r.vin, r.domain, r.field]), [
    ["1FT6W1EV0PWG00001", "example.com", "description"],
    ["1FT6W1EV0PWG00001", "example.com", "images[1]"],
  ]);
  for (const row of rows) for (const v of Object.values(row)) if (typeof v === "string") assert.ok(v.isWellFormed());
  assert.ok(rows[0].images[1].isWellFormed());
  assert.equal(rows[1].description, "all good 🔥");
  // What db-sync sends must now parse as strict JSON: no \ud escapes left.
  assert.ok(!/\\ud[89ab]/i.test(JSON.stringify(rows)));
});
