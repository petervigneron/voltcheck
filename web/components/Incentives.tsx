import type { IncentiveMatch } from "@/lib/incentives/match";

// Incentive programs this car meets the car-side conditions of.
//
// What this component is allowed to say, and no more: the program's name, the
// program's own figure for this car's condition and kind (only when the
// matcher settled exactly one), the further figures that depend on who the
// buyer is (each with the program's own label, never summed), the car-side
// conditions the listing could not settle (only under the relaxed policy),
// and the purchaser-side conditions stated as conditions. It never says a
// shopper qualifies, never says what they will get, and renders nothing at
// all when there is no match — no sentence reporting the absence.
//
// Every figure here IS the program's own figure (lib/incentives/registry.ts
// holds nothing else), so nothing in this block carries an "est." mark. If a
// derived or estimated figure is ever added, it must render with SourceBadge's
// mark like every other soft number on the site.
//
// COPY: the owner writes all shopper-facing wording (2026-09-02). The strings
// in PLACEHOLDER below are structural stand-ins that state the technical
// constraint each line carries; they are the exact places the owner's words
// go. Nothing else in this file is prose. A Fact `note` never renders here or
// anywhere (lib/enrichment/noteRule.ts); the registry's `statusNote` and
// `usedNote` are working notes and reach nobody.
const PLACEHOLDER = {
  /** Section heading. Constraint: names programs, promises nothing. */
  heading: "[OWNER COPY] Programs this car meets the vehicle conditions of",
  /** Label over the purchaser-side condition list. Constraint: these are
   *  conditions on the buyer that the site does not and cannot check. */
  purchaserConditions: "[OWNER COPY] Conditions on the buyer",
  /** Label over car-side conditions the listing could not settle (relaxed
   *  policy only). Constraint: checkable at the dealer, not here. */
  toCheck: "[OWNER COPY] To check on this car",
  /** Label beside further figures that depend on the buyer. Constraint: each
   *  is the program's own figure for a buyer who meets a further condition. */
  purchaserSideAmounts: "[OWNER COPY] Also, for buyers who meet a further condition",
  /** Sub-heading over utility programs. Constraint: each is for that
   *  utility's own customers, which the listing cannot narrow. */
  utilityHeading: "[OWNER COPY] Utility programs, for that utility's customers",
  /** Link text to the program's own page. */
  programLink: "[OWNER COPY] Program page",
} as const;

function usd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

export function Incentives({ matches }: { matches: IncentiveMatch[] }) {
  if (matches.length === 0) return null;
  // State and regional programs first, then utility programs under their own
  // label: a utility program is only ever for that utility's own customers,
  // which the dealer's state cannot narrow, so a used car in California can
  // meet a dozen of them at once. Grouping keeps the statewide answer on top.
  const statewide = matches.filter((m) => m.program.jurisdiction.kind !== "utility");
  const utility = matches.filter((m) => m.program.jurisdiction.kind === "utility");
  return (
    <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {PLACEHOLDER.heading}
      </h2>
      <MatchList matches={statewide} />
      {utility.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {PLACEHOLDER.utilityHeading}
          </h3>
          <MatchList matches={utility} />
        </>
      )}
    </section>
  );
}

function MatchList({ matches }: { matches: IncentiveMatch[] }) {
  if (matches.length === 0) return null;
  return (
      <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
        {matches.map((m) => {
          const primary = m.program.sources[0];
          return (
            <li key={m.program.id} className="py-3" title={m.checked.join(" · ")}>
              <div className="flex items-baseline justify-between gap-4">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{m.program.name}</div>
                {m.amountUsd !== undefined && (
                  <div className="text-right text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {usd(m.amountUsd)}
                    {m.amountLabel && (
                      <span className="ml-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">{m.amountLabel}</span>
                    )}
                  </div>
                )}
              </div>

              {m.purchaserSideAmounts.length > 0 && (
                <div className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                  <span className="text-zinc-500 dark:text-zinc-400">{PLACEHOLDER.purchaserSideAmounts}</span>
                  <ul className="mt-0.5 space-y-0.5">
                    {m.purchaserSideAmounts.map((a, i) => (
                      <li key={i} className="flex justify-between gap-4">
                        <span>{a.label}</span>
                        <span className="tabular-nums">{usd(a.usd)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {m.toCheckOnTheCar.length > 0 && (
                <div className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                  <span className="text-zinc-500 dark:text-zinc-400">{PLACEHOLDER.toCheck}</span>
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                    {m.toCheckOnTheCar.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {m.purchaserConditions.length > 0 && (
                <div className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                  <span className="text-zinc-500 dark:text-zinc-400">{PLACEHOLDER.purchaserConditions}</span>
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                    {m.purchaserConditions.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {primary && (
                <a
                  href={primary.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-block text-xs text-emerald-700 hover:underline dark:text-emerald-500"
                >
                  {PLACEHOLDER.programLink} ↗
                </a>
              )}
            </li>
          );
        })}
      </ul>
  );
}
