import type { Fact, Source } from "@/lib/types";
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

// A citation, not a chip. The old provenance chip on every row named the
// pipeline (see SourceBadge above); this names the document instead, and
// only on hover, from the one thing every sourced fact already carries: its
// URL. No new metadata to keep in sync, and nothing added to the page's
// resting state.
const SOURCE_LABEL: Record<Source, string> = {
  mfr: "Manufacturer specification",
  vpic: "NHTSA vPIC decode",
  vin: "VIN decode",
  photo: "Listing photo",
  dealer: "Dealer data",
  tested: "Independent test",
  est: "Estimate",
  agg: "Secondary source",
  unknown: "Unverified source",
};

// A short, honest publisher name for the hostname a sourceUrl points at.
// Deliberately not a full citation engine: no per-URL document titles are
// stored anywhere, so the label is built only from what a Fact actually
// carries (its source tag and its URL's own host), never invented.
const KNOWN_HOSTS: Record<string, string> = {
  "fueleconomy.gov": "EPA, fueleconomy.gov",
  "vw.com": "Volkswagen",
  "media.vw.com": "Volkswagen newsroom",
  "ownersliterature.vw.com": "Volkswagen owner literature",
  "volkswagen-newsroom.com": "Volkswagen newsroom",
  "experience.gm.com": "GM owner center",
  "static.nhtsa.gov": "NHTSA",
  "nhtsa.gov": "NHTSA",
  "fromtheroad.ford.com": "Ford media",
  "media.ford.com": "Ford media",
  "hyundainews.com": "Hyundai newsroom",
};

function publisherLabel(sourceUrl: string): string {
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
    return KNOWN_HOSTS[host] ?? host;
  } catch {
    return sourceUrl;
  }
}

function citationText(fact: Fact<unknown>): string {
  const kind = SOURCE_LABEL[fact.source] ?? "Source";
  const publisher = publisherLabel(fact.sourceUrl!);
  return `${kind}, ${publisher}, checked ${fact.asOf}.`;
}

function Citation({ fact }: { fact: Fact<unknown> }) {
  if (!fact.sourceUrl) return null;
  return (
    <span className="group relative ml-1 inline-block align-middle">
      <a
        href={fact.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Source: ${citationText(fact)}`}
        className="text-zinc-300 no-underline hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400"
      >
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.4" className="inline-block">
          <circle cx="8" cy="8" r="6.3" />
          <path d="M8 7.3v4" strokeLinecap="round" />
          <circle cx="8" cy="5.1" r="0.15" fill="currentColor" stroke="none" />
        </svg>
      </a>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 bottom-full z-10 mb-1 hidden w-56 rounded-md border border-zinc-200 bg-white p-2 text-[11px] leading-snug text-zinc-600 shadow-md group-hover:block dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
      >
        {citationText(fact)}
      </span>
    </span>
  );
}

export function FactRow({
  label,
  fact,
  format,
  title,
}: {
  label: string;
  fact?: Fact<unknown>;
  format?: (v: unknown) => string;
  /** Working shown only on hover. For rows whose value is already the whole
   *  answer, where a note underneath would restate it in more words. */
  title?: string;
}) {
  const note = inlineNote(fact?.note);
  return (
    <div
      title={title ?? (fact?.note && !note ? fact.note : undefined)}
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
            {fact.sourceUrl && <Citation fact={fact} />}
            {note && <div className="mt-0.5 max-w-xs text-xs text-zinc-500 dark:text-zinc-400">{note}</div>}
          </>
        ) : (
          <span className="text-sm text-zinc-400 dark:text-zinc-500">Unknown</span>
        )}
      </div>
    </div>
  );
}
