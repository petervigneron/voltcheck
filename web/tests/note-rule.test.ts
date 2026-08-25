// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/note-rule.test.ts
//
// A Fact's `note` is the researcher's working and never page copy — the whole
// rationale is in lib/enrichment/noteRule.ts.
//
// This file used to be the opposite test. It carried a MUST_NOT_CATCH list
// asserting that "Standard on AWD", "697 V nominal, long-range pack" and
// "Performance Battery Plus" must keep rendering, on the theory that a note
// naming which pack or trim a number belongs to earns its line. On 2026-08-25
// the owner read those three strings on an Ioniq 5 card and named them as the
// problem. A test defending them was the reason the third sweep did not stick.
import test from "node:test";
import assert from "node:assert/strict";
import { inlineNote } from "@/lib/enrichment/noteRule";

// Every one of these was live on voltcheck.net. The first four are the ones
// the owner read on the Ioniq 5 card; the rest are the shapes the two earlier
// sweeps deleted, kept here so the list reads as the full history.
const WAS_ON_THE_PAGE = [
  "Long Range pack",
  "697 V nominal, long-range pack",
  "Standard on AWD",
  "Native NACS from the MY2025 facelift; 2025 cars shipped with a CCS adapter included",
  "Performance Battery Plus",
  "Extended Range peak",
  "82 gross / 77 usable",
  "AC charging only, no DC fast charge",
  "Electric-only EPA range",
  "Toyota press: single AWD pack shared by XLE AWD and Limited AWD",
  "Secondary-sourced; no Ford press document found this pass",
  'Ford spec sheet: “Retaining a minimum of 70 percent of its original capacity”',
];

test("no note becomes page copy, whatever it says", () => {
  for (const n of WAS_ON_THE_PAGE) assert.equal(inlineNote(n), undefined, `should not render: ${n}`);
});

test("no note at all is fine", () => {
  assert.equal(inlineNote(undefined), undefined);
  assert.equal(inlineNote(""), undefined);
});
