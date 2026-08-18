import type { Fact } from "@/lib/types";
import { SourceBadge } from "./SourceBadge";

// Two things get written into a note, and only one of them is for the reader.
//
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
// distrusted. 96 notes are that, some over 30 words, and they were the bulk of
// the fact table's word count on a surface whose whole promise is a glance.
// They are not deleted — they move to the row's tooltip, where our workings
// stay auditable without being the page.
const MAX_NOTE_WORDS = 14;

function inlineNote(note: string | undefined): string | undefined {
  if (!note || CITATION.test(note)) return undefined;
  return note.trim().split(/\s+/).length <= MAX_NOTE_WORDS ? note : undefined;
}

export function FactRow({
  label,
  fact,
  format,
}: {
  label: string;
  fact?: Fact<unknown>;
  format?: (v: unknown) => string;
}) {
  const note = inlineNote(fact?.note);
  return (
    <div
      title={fact?.note && !note ? fact.note : undefined}
      className="flex items-baseline justify-between gap-4 py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0"
    >
      <div className="text-sm text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="text-right">
        {fact ? (
          <>
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {format ? format(fact.value) : String(fact.value)}
            </span>{" "}
            <SourceBadge fact={fact} />
            {note && <div className="mt-0.5 max-w-xs text-xs text-zinc-500 dark:text-zinc-400">{note}</div>}
          </>
        ) : (
          <span className="text-sm text-zinc-400 dark:text-zinc-500">Unknown</span>
        )}
      </div>
    </div>
  );
}
