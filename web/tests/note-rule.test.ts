// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/note-rule.test.ts
//
// The rule a Fact's note follows on the page — cite, state a fact, or say
// nothing — as examples rather than as a regex. Every string in the "must
// catch" list was live on voltcheck.net in August 2026; every string in the
// "must not" list is a note that survived the sweep and should keep
// surviving, because it says which pack, which trim, or under what condition
// the number holds. A pattern that starts flagging those has stopped
// enforcing the rule and started deleting the answer.
import test from "node:test";
import assert from "node:assert/strict";
import { inlineNote, reason } from "@/lib/enrichment/noteRule";

const MUST_CATCH = [
  // The Toyota bZ page the owner read on 2026-08-22.
  "Toyota press: single AWD pack shared by XLE AWD and Limited AWD",
  "Toyota's own release, stated as approximate",
  // Attribution with no scope of its own.
  "Mercedes-Benz USA spec page",
  "Cadillac's own Optiq specs page (cadillac.com)",
  "Rivian's own Part 565 submission: 128.9 kWh (Large pack)",
  "BMW USA press, same spec table",
  "Kia manual: everything except the Power Train warranty is fully transferable",
  // The research diary.
  "Secondary-sourced; no Ford press document found this pass",
  "Universally reported; not control-tested against a Ford primary document",
  "Not independently re-derived from a primary GM document this pass",
  "GM quotes 102 kWh; usable split unpublished",
];

const MUST_NOT_CATCH = [
  "Extended Range peak",
  "82 gross / 77 usable",
  "Standard on AWD",
  "Large pack",
  "Performance Battery Plus",
  "MY2026 Macan 4 Electric, EPA",
  "70-mph steady-state highway (InsideEVs)",
  "With a ≥250 kW 800V charger",
  "Repairs restore to ≥70%, not to as-new",
  "1,650 lb unbraked",
  "Heat pump unavailable on the Light trim",
  "AC charging is standard J1772",
  "697 V nominal, long-range pack",
];

test("the notes that reached shoppers twice are refused", () => {
  for (const n of MUST_CATCH) assert.ok(reason(n), `should be refused: ${n}`);
});

test("a note that says which car the number is for is kept", () => {
  for (const n of MUST_NOT_CATCH) assert.equal(reason(n), undefined, `should be kept: ${n}`);
});

test("only what renders is judged — a long note or a quote is tooltip-only and unjudged", () => {
  const long =
    "Widely reported flat across the 2026 bZ lineup; Toyota's own release states only around 30 minutes, with no kW figure given anywhere in it";
  assert.equal(inlineNote(long), undefined);
  assert.equal(reason(long), undefined);
  const quoted = 'Ford spec sheet: “Retaining a minimum of 70 percent of its original capacity”';
  assert.equal(inlineNote(quoted), undefined);
  assert.equal(reason(quoted), undefined);
});

test("no note at all is always fine", () => {
  assert.equal(reason(undefined), undefined);
  assert.equal(inlineNote(undefined), undefined);
});
