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
  hint,
}: {
  label: string;
  fact?: Fact<unknown>;
  format?: (v: unknown) => string;
  // Explanatory content revealed when the shopper hovers or focuses the value.
  // When set, the value gets a dotted underline to signal there's more to read;
  // a CSS-only popover keeps this a server component and works from the keyboard
  // (focus) and touch (tap) as well as the mouse.
  hint?: React.ReactNode;
}) {
  const note = fact?.note && !CITATION.test(fact.note) ? fact.note : undefined;
  const valueText = fact ? (format ? format(fact.value) : String(fact.value)) : "";
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <div className="text-sm text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="text-right">
        {fact ? (
          <>
            {hint ? (
              <span className="group relative inline-block">
                <span
                  tabIndex={0}
                  className="cursor-help border-b border-dotted border-zinc-400 text-sm font-medium text-zinc-900 outline-none focus-visible:border-solid focus-visible:border-zinc-600 dark:border-zinc-500 dark:text-zinc-100"
                >
                  {valueText}
                </span>
                <span
                  role="tooltip"
                  className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-64 rounded-lg border border-zinc-200 bg-white p-3 text-left text-xs leading-relaxed text-zinc-600 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  {hint}
                </span>
              </span>
            ) : (
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{valueText}</span>
            )}{" "}
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
