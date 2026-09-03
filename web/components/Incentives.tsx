import type { IncentiveMatch } from "@/lib/incentives/match";
import { INCENTIVE_COPY } from "@/lib/incentives/copy";
import { incentivesToRender } from "@/lib/incentives/visible";

// Incentive programs this car meets the car-side conditions of.
//
// What this component is allowed to say, and no more: the program's name, the
// program's own figure for this car's condition and kind (only when the
// matcher settled exactly one), the cap when the asking price sits over it,
// the further figures that depend on who the buyer is (each with the
// program's own label, never summed), the car-side conditions the listing
// could not settle, and the purchaser-side conditions stated as conditions.
// It never says a shopper qualifies, never says what they will get, and
// renders nothing at all when there is no match — no sentence reporting the
// absence.
//
// Every figure here IS the program's own figure (lib/incentives/registry.ts
// holds nothing else), so nothing in this block carries an "est." mark. If a
// derived or estimated figure is ever added, it must render with SourceBadge's
// mark like every other soft number on the site.
//
// COPY: every string a shopper reads comes from lib/incentives/copy.ts, and
// the block is dark (INCENTIVES_COPY_READY) until the owner has replaced the
// placeholders there. A Fact `note` never renders here or anywhere
// (lib/enrichment/noteRule.ts); the registry's `statusNote` and `usedNote`
// are working notes and reach nobody.

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

export function Incentives({ matches: all }: { matches: IncentiveMatch[] }) {
  // Empty while the copy is unwritten (lib/incentives/visible.ts), and empty
  // when nothing matched: either way, no block and no sentence.
  const matches = incentivesToRender(all);
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
        {INCENTIVE_COPY.heading}
      </h2>
      <MatchList matches={statewide} />
      {utility.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {INCENTIVE_COPY.utilityHeading}
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
        const overCap = m.cap?.askOverByUsd ? m.cap : undefined;
        return (
          <li key={m.program.id} className="py-3" title={m.checked.join(" · ")}>
            <div className="flex items-baseline justify-between gap-4">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{m.program.name}</div>
              {/* Over the cap: the cap is the value, not the figure. The
                  shopper sees the asking price a few lines up; the gap is
                  theirs to close. */}
              {overCap ? (
                <div className="text-right text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {usd(overCap.usd)}
                  <span className="ml-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">cap</span>
                </div>
              ) : (
                m.amountUsd !== undefined && (
                  <div className="text-right text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {usd(m.amountUsd)}
                    {m.amountLabel && (
                      <span className="ml-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">{m.amountLabel}</span>
                    )}
                  </div>
                )
              )}
            </div>

            {m.purchaserSideAmounts.length > 0 && (
              <div className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                <span className="text-zinc-500 dark:text-zinc-400">{INCENTIVE_COPY.purchaserSideAmounts}</span>
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

            {(m.toCheckOnTheCar.length > 0 || overCap) && (
              <div className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                <span className="text-zinc-500 dark:text-zinc-400">{INCENTIVE_COPY.toCheck}</span>
                <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                  {overCap && (
                    <li>
                      {overCap.basis} at or under {usd(overCap.usd)}.
                    </li>
                  )}
                  {m.toCheckOnTheCar.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {m.purchaserConditions.length > 0 && (
              <div className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                <span className="text-zinc-500 dark:text-zinc-400">{INCENTIVE_COPY.purchaserConditions}</span>
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
                {INCENTIVE_COPY.programLink} ↗
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
