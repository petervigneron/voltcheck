import type { IncentiveMatch } from "@/lib/incentives/match";
import { INCENTIVE_COPY } from "@/lib/incentives/copy";
import { incentivesToRender } from "@/lib/incentives/visible";

// Incentive programs this car meets the vehicle conditions of.
//
// Per program: its name, linked to its own page; its own figure for this car's
// condition and kind when the matcher settled exactly one, or its price cap
// when the asking price sits over it; then one list of conditions — the ones
// only the buyer can settle and the ones the listing could not (an MSRP on the
// sticker, an eligible-vehicle list, a participating dealer) — as sentences,
// followed by the program's further figures with their own labels. One line at
// the foot says eligibility is the shopper's to confirm. No label sits over
// any of it: the value is the answer (owner, 2026-09-03).
//
// It never says a shopper qualifies, never sums figures, and renders nothing
// when there is no match or while the copy is unwritten (lib/incentives/
// visible.ts). Every figure is the program's own, so nothing here carries an
// "est." mark; a derived figure would have to.

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

export function Incentives({ matches: all }: { matches: IncentiveMatch[] }) {
  const matches = incentivesToRender(all);
  if (matches.length === 0) return null;
  // Statewide programs first; a utility program is for its own customers only
  // and a used car in California meets a dozen of them at once.
  const ordered = [
    ...matches.filter((m) => m.program.jurisdiction.kind !== "utility"),
    ...matches.filter((m) => m.program.jurisdiction.kind === "utility"),
  ];
  return (
    <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {ordered.map((m) => {
          const url = m.program.sources[0]?.url;
          const overCap = m.cap?.askOverByUsd ? m.cap : undefined;
          const conditions = [
            ...(overCap ? [`${overCap.basis.replace(/\.$/, "")} at or under ${usd(overCap.usd)}.`] : []),
            ...m.toCheckOnTheCar,
            ...m.purchaserConditions,
          ];
          return (
            <li key={m.program.id} className="py-3 first:pt-0 last:pb-0" title={m.checked.join(" · ")}>
              <div className="flex items-baseline justify-between gap-4">
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-zinc-900 hover:text-emerald-700 dark:text-zinc-100 dark:hover:text-emerald-500"
                  >
                    {m.program.name}
                  </a>
                ) : (
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{m.program.name}</div>
                )}
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
              {conditions.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-zinc-600 dark:text-zinc-300">
                  {conditions.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}
              {m.purchaserSideAmounts.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                  {m.purchaserSideAmounts.map((a, i) => (
                    <li key={i} className="flex justify-between gap-4">
                      <span>{a.label}</span>
                      <span className="tabular-nums">{usd(a.usd)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{INCENTIVE_COPY.confirmLine}</p>
    </section>
  );
}
