import type { Fact } from "@/lib/types";
import { SourceBadge } from "./SourceBadge";

// A note that opens with a quotation mark is a citation: the source's own
// words plus an attribution, restating the value directly above it —
// “Retaining a minimum of 70 percent of its original capacity” — Ford spec
// sheet, under a row that already reads "70% SOH". 126 of the enrichment
// notes are this shape and they are the bulk of the page's word count.
//
// The rest are qualifiers that change what the number means ("EPA rating for
// the Extended Range pack, non-Platinum trims"), so they stay. The opening
// quote is the whole test — it is what separates showing our work from
// telling the shopper something.
const CITATION = /^\s*["“']/;

export function FactRow({
  label,
  fact,
  format,
}: {
  label: string;
  fact?: Fact<unknown>;
  format?: (v: unknown) => string;
}) {
  const note = fact?.note && !CITATION.test(fact.note) ? fact.note : undefined;
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
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
