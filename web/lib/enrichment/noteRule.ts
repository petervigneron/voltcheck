// What a Fact's `note` is allowed to put on the page. The answer is now:
// nothing.
//
// HISTORY, because this rule has been re-litigated four times and the earlier
// versions all failed the same way. A `note` is the researcher's qualifier on
// a figure — which pack, which trim, which document, under what conditions.
// Every version of this rule until now tried to sort the good notes from the
// bad ones and render the good ones under the value:
//
//   2026-08-20 (VW ID. Buzz)  — deleted ~120 notes that repeated the number
//                               above them or named the document they came
//                               from. Rule: don't do that.
//   2026-08-22 (Toyota bZ)    — the same shapes had been written again by a
//                               later research tranche. Rule made machine-
//                               checkable: no quoted citation, no source
//                               attribution, no research narration, ≤14 words.
//   2026-08-25 (Hyundai       — the filter passed 2,463 notes, and the owner's
//    Ioniq 5)                   objection was to notes that PASSED it:
//
//        "84 kWh"   / "Long Range pack"      — the size is the answer
//        "800V"     / "697 V nominal, long-range pack"
//        "NACS"     / "Native NACS from the MY2025 facelift; 2025 cars
//                      shipped with a CCS adapter included"
//        "Standard" / "Standard on AWD"      — on a row already keyed to AWD
//
// The through-line is not length, attribution, or narration. It is that the
// note was never the shopper's answer. The value is. Three sweeps tried to
// find the subset of notes that earn a line of the page; each shipped a
// filter, each was re-broken by the next tranche of research, and the only
// detector was the owner opening a listing and finding it again.
//
// So the rule is no longer a filter. A note never renders as page copy. It
// stays on the Fact — the working stays auditable, and FactRow hands it to
// the row's hover tooltip — but a shopper reading the card sees the label and
// the value, and the provenance rides on `sourceUrl` (the ⓘ citation) and
// `source` (the "est" marker) exactly as before.
//
// The property this buys, which no filter could: the next research tranche can
// write whatever note it likes and no shopper will ever read it.

/** Page copy a Fact's note may contribute: none, by rule. See above. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function inlineNote(note: string | undefined): undefined {
  return undefined;
}
