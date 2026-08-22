// What a Fact's `note` is allowed to say on the page.
//
// Two things get written into a note, and only one of them is for the reader.
// The rule the owner has now stated twice, after finding it broken on a VW ID.
// Buzz page (2026-08-20) and a Toyota bZ page (2026-08-22): a note either
// CITES a source, states a FACT ("77 kWh"), or says nothing at all. Citing is
// already a solved problem — `sourceUrl` renders a hover citation naming the
// publisher and the date we checked (FactRow's Citation), and `source`
// renders the "est" marker. So what is left for the note is the fact, and
// only the fact: which pack, which trim, under what condition. Everything
// else — who published it, how hard it was to find, what we could not
// confirm — is our working, not the shopper's answer, and it was the bulk of
// the fact table's word count on a surface whose whole promise is a glance.
//
// inlineNote() decides what renders under the value. reason() is the same
// judgement made machine-checkable, so a note of the shapes we have already
// had to sweep out twice fails in CI (scripts/note-hygiene.mjs) instead of
// reaching a shopper and being noticed by eye.

// A CITATION is the source's own words plus an attribution, restating the
// value directly above it — “Retaining a minimum of 70 percent of its original
// capacity” — Ford spec sheet, under a row that already reads "70% SOH".
// Testing for a leading quote caught 134 of these and missed 53 more written
// as `GM booklet: “transferable at no cost to any subsequent person(s)”
// (verified via extracted booklet text)`, which is the same sentence with our
// filing note in front of it, and which shipped under a row already reading
// "Yes". So the test is a quoted span anywhere in the note, not just at the
// front. Single quotes are left alone: they name variants ('Model Y AWD'),
// which is the note doing its job.
const CITATION = /[“"][^”"]{12,}[”"]/;

// A note is a qualifier — it says which car the number is for, or under what
// conditions it holds ("EPA rating for the Extended Range pack, non-Platinum
// trims"). Past about this length it has stopped qualifying and started being
// the research transcript: test protocols, rejected figures, why a source was
// distrusted. 96 notes were that, some over 30 words, and they are not
// deleted — they move to the row's tooltip, where our workings stay auditable
// without being the page.
const MAX_NOTE_WORDS = 14;

export function inlineNote(note: string | undefined): string | undefined {
  if (!note || CITATION.test(note)) return undefined;
  return note.trim().split(/\s+/).length <= MAX_NOTE_WORDS ? note : undefined;
}

// Naming the document a figure came from. The ⓘ citation does this already,
// from `sourceUrl`, without spending a line of the page on it. Every pattern
// here matched a note that was live on the site in August 2026.
const ATTRIBUTION =
  /\b(press|spec (?:sheets?|table)|specs? page|order guide|booklet|owner'?s manual|newsroom|Part 565|feature sheet|configurator|warranty[- ]page|trade outlet|secondary sources?|secondhand)\b|\b\w+'s own (?:\w+ )*(?:page|release|submission|figure|data)\b|\bmanual:/i;

// Our research diary: what this pass did, did not do, or could not find. The
// `source` tag ("est", "agg") is how the page says a figure isn't the maker's
// own, and it says it in two characters instead of a sentence.
const TRANSCRIPT =
  /\b(this pass|not (?:independently|control-)|independently re-?(?:derived|confirmed)|inferred by|no .{0,40}(?:document|source|primary)\b|not confirmed|unpublished|could ?n[o']t|universally reported|widely reported)\b/i;

/** Why this note must not render inline, or undefined if it may. */
export function reason(note: string | undefined): string | undefined {
  const n = inlineNote(note);
  if (!n) return undefined; // never reaches the page; the tooltip may hold anything
  if (ATTRIBUTION.test(n)) return "names its source — sourceUrl renders that as a citation already";
  if (TRANSCRIPT.test(n)) return "narrates the research rather than stating the fact";
  return undefined;
}
