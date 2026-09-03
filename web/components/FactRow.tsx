import type { Fact, Source } from "@/lib/types";
import { SourceBadge } from "./SourceBadge";

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
  hint,
  yesNo = false,
}: {
  label: string;
  fact?: Fact<unknown>;
  format?: (v: unknown) => string;
  /** Working shown only on hover. For rows whose value is already the whole
   *  answer, where a note underneath would restate it in more words. */
  title?: string;
  // Richer explanatory content revealed when the shopper hovers or focuses the
  // value — unlike `title` above (plain text, the browser's native tooltip),
  // this can carry structured markup (a heading, a pros/cons list). When set,
  // the value gets a dotted underline to signal there's more to read; a
  // CSS-only popover keeps this a server component and works from the
  // keyboard (focus) and touch (tap) as well as the mouse.
  hint?: React.ReactNode;
  /** A yes-or-no fact (heat pump, DC fast charging). It never carries
   *  "est.": that mark exists for numbers, where a secondary source's figure
   *  beside a maker's is a false equivalence. On a fact that is either true
   *  or not it read as a hedge on a guess, which the claims rule forbids —
   *  the owner (2026-09-03): "there's not uncertainty around the ID.4 heat
   *  pump; we just say it doesn't exist," and again the same day, "This is
   *  empirical information." Either the source clears the bar to print, or
   *  the row does not exist. Same rule the card tiles took in 2ffa72d. */
  yesNo?: boolean;
}) {
  // No fact means no research has settled this for this car — that is
  // silence, not a value, so the row itself doesn't exist. This is distinct
  // from a Fact whose own value happens to read "unknown" (no such case
  // exists in this schema today: Source never encodes "we checked and it
  // can't be known", and the one place on the site that prints the word
  // "Unknown" as a real, kept answer — the sold-data panel's per-VIN trim,
  // where Ford stamped no trim code on 2022-23 Lightnings — is a plain
  // nullable string in RecentSales.tsx, not a Fact, and never touches
  // FactRow). If a Source is ever added for "researched, unknowable", it
  // gets its own branch here that prints the word; it must not reuse this
  // absent-fact path.
  if (!fact) return null;

  const valueText = format ? format(fact.value) : String(fact.value);
  return (
    <div
      // A Fact's `note` is the researcher's working — which pack, which trim,
      // which document — and never page copy; lib/enrichment/noteRule.ts has
      // the four sweeps that established that. It reaches the shopper only
      // here, on hover, behind a deliberate act.
      title={title ?? fact.note}
      className="flex items-baseline justify-between gap-4 py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0"
    >
      <div className="text-sm text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="text-right">
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
        {!yesNo && <SourceBadge fact={fact} />}
        {fact.sourceUrl && <Citation fact={fact} />}
      </div>
    </div>
  );
}
