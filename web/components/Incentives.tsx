import type { IncentiveMatch } from "@/lib/incentives/match";
import { INCENTIVE_COPY } from "@/lib/incentives/copy";
import { incentivesToRender } from "@/lib/incentives/visible";
import { ProBlur } from "./ProBlur";

// Incentive programs this car meets the vehicle conditions of.
//
// One collapsed line per program: its name, and its own figure for this
// car's condition and kind when the matcher settled exactly one, or its price
// cap when the asking price sits over it. Pressing the line opens the
// program's conditions — the ones only the buyer can settle and the ones the
// listing could not (an MSRP on the sticker, an eligible-vehicle list, a
// participating dealer) — then its further figures with their own labels,
// then a link to the program's own page. One line at the foot says
// eligibility is the shopper's to confirm.
//
// Collapsed because a used car in California meets a dozen programs at once
// and the open form was "an overwhelming amount of information — it's not
// helpful" (owner, 2026-09-03); the dropdown is how a shopper checks the one
// program that is theirs. Pro, blurred like the price trends until the
// browser holds a pass (components/ProBlur.tsx), the same owner decision.
//
// It never says a shopper qualifies, never sums figures, and renders nothing
// when there is no match or while the copy is unwritten (lib/incentives/
// visible.ts). Every figure is the program's own, so nothing here carries an
// "est." mark; a derived figure would have to.

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

// The link text is the program's own host, not a phrase of ours.
function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function Incentives({ matches: all }: { matches: IncentiveMatch[] }) {
  const matches = incentivesToRender(all);
  if (matches.length === 0) return null;
  // Statewide programs first; a utility program is for its own customers only.
  const ordered = [
    ...matches.filter((m) => m.program.jurisdiction.kind !== "utility"),
    ...matches.filter((m) => m.program.jurisdiction.kind === "utility"),
  ];
  return (
    <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <ProBlur>
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
              <li key={m.program.id} className="py-2 first:pt-0 last:pb-0">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-baseline gap-3 py-1 [&::-webkit-details-marker]:hidden">
                    <span aria-hidden="true" className="w-3 shrink-0 text-sm font-extrabold text-zinc-400 group-open:hidden">
                      +
                    </span>
                    <span aria-hidden="true" className="hidden w-3 shrink-0 text-sm font-extrabold text-zinc-400 group-open:inline">
                      −
                    </span>
                    <span className="flex-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{m.program.name}</span>
                    {overCap ? (
                      <span className="text-right text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                        {usd(overCap.usd)}
                        <span className="ml-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">cap</span>
                      </span>
                    ) : (
                      m.amountUsd !== undefined && (
                        <span className="text-right text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                          {usd(m.amountUsd)}
                          {m.amountLabel && (
                            <span className="ml-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">{m.amountLabel}</span>
                          )}
                        </span>
                      )
                    )}
                  </summary>
                  <div className="pb-2 pl-6">
                    {conditions.length > 0 && (
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-zinc-600 dark:text-zinc-300">
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
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-zinc-400 hover:text-cobalt"
                      >
                        {host(url)}
                      </a>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{INCENTIVE_COPY.confirmLine}</p>
      </ProBlur>
    </section>
  );
}
