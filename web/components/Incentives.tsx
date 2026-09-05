"use client";

import { useEffect, useState } from "react";
import type { IncentiveMatch } from "@/lib/incentives/match";
import { INCENTIVE_COPY } from "@/lib/incentives/copy";
import { incentivesToRender, narrowToZip, type ZipAnswer } from "@/lib/incentives/visible";
import { useShopperZip } from "@/lib/shopperZip";
import { proBenefitTitle } from "@/lib/proOffer";
import { ProBlur } from "./ProBlur";

// Incentive programs this car meets the vehicle conditions of, narrowed to
// the ones the shopper's ZIP can use.
//
// The matcher names every program the car qualifies for in the dealer's
// state; a used car in California meets a dozen utility programs at once and
// the shopper is a customer of one. Given a ZIP — typed on the browse rail or
// in the field at the foot of this block, else Vercel's IP guess
// (lib/shopperZip.ts) — /api/rebates/[zip] says which of them hold that ZIP
// (lib/incentives/territory.ts). Which of the answer's programs that leaves
// standing is lib/incentives/visible.ts's narrowToZip, and the rules it
// keeps are the reason this block used to disappear from every car outside
// the shopper's own state. With no ZIP known, every match renders. Owner,
// 2026-09-03: a ZIP, not a picker — "I want the site to be easy and smooth
// to use."
//
// One collapsed line per program: its name, and its own figure for this car's
// condition and kind when the matcher settled exactly one, or its price cap
// when the asking price sits over it. Pressing the line opens the program's
// conditions, its further figures with their own labels, and a link to the
// program's own page. One line at the foot says eligibility is the shopper's
// to confirm. Pro, blurred like the price trends until the browser holds a
// pass (components/ProBlur.tsx).
//
// It never says a shopper qualifies, never sums figures, and renders nothing
// when there is no match — before or after narrowing — or while the copy is
// unwritten (lib/incentives/visible.ts). Every figure is the program's own,
// so nothing here carries an "est." mark; a derived figure would have to.
//
// The blur carries the benefit's own /pro title as its caption, never blurred
// itself. Owner, 2026-09-04: a visitor needs "to know what's actually blurred
// out below the blur, so it should say something about the rebate, not just
// voltcheck pro." It is read from lib/proOffer.ts rather than retyped, so the
// caption cannot promise something the /pro page does not sell.
//
// A client component because the page is static and the ZIP is the
// shopper's; the matches arrive as props, plain data.

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

// The link text is the program's own host, not a phrase of ours.
function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// One answer per ZIP per page load; the route is CDN-cached a day anyway.
// The ZIP's own state rides along with the ids: without it the narrowing
// cannot tell "no program of yours" from "not your state at all".
type ZipPrograms = Omit<ZipAnswer, "typed">;
const keepCache = new Map<string, Promise<ZipPrograms | null>>();
function keepFor(zip: string): Promise<ZipPrograms | null> {
  let p = keepCache.get(zip);
  if (!p) {
    p = fetch(`/api/rebates/${zip}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((r: { state?: string; keep?: string[] } | null) =>
        r && typeof r.state === "string" && Array.isArray(r.keep) ? { state: r.state, keep: r.keep } : null
      )
      .catch(() => null);
    keepCache.set(zip, p);
  }
  return p;
}

export function Incentives({ matches: all }: { matches: IncentiveMatch[] }) {
  const matches = incentivesToRender(all);
  const { zip, typed, setZip } = useShopperZip();
  // The answer for the ZIP it was asked about; `programs` null means no ZIP,
  // or the lookup failed — show all. Keyed by ZIP so a stale answer for the
  // last ZIP is never read as this one's.
  const [answer, setAnswer] = useState<{ zip: string | null; programs: ZipPrograms | null } | undefined>(undefined);
  useEffect(() => {
    if (zip === undefined) return;
    let alive = true;
    (zip === null ? Promise.resolve(null) : keepFor(zip)).then((programs) => {
      if (alive) setAnswer({ zip, programs });
    });
    return () => {
      alive = false;
    };
  }, [zip]);

  if (matches.length === 0) return null;
  // Hold the block until the ZIP question is settled, so a pass-holder never
  // watches twelve lines collapse into one.
  if (zip === undefined || answer === undefined || answer.zip !== zip) return null;

  const usable = narrowToZip(matches, answer.programs && { ...answer.programs, typed });
  if (usable.length === 0) return null;
  // Statewide programs first; a utility program is for its own customers only.
  const ordered = [
    ...usable.filter((m) => m.program.jurisdiction.kind !== "utility"),
    ...usable.filter((m) => m.program.jurisdiction.kind === "utility"),
  ];
  return (
    <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <ProBlur label={proBenefitTitle("rebates")}>
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
        <div className="mt-3 flex items-baseline justify-between gap-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{INCENTIVE_COPY.confirmLine}</p>
          {/* The ZIP the list is answering for, editable in place: five digits
              and the list re-narrows. Same word the rail's field uses. */}
          <input
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            aria-label="ZIP"
            placeholder="ZIP"
            defaultValue={zip ?? ""}
            onChange={(e) => {
              if (/^\d{5}$/.test(e.target.value)) setZip(e.target.value);
            }}
            className="w-16 shrink-0 border-b-2 border-zinc-300 bg-transparent text-right text-xs tabular-nums text-zinc-700 outline-none focus:border-cobalt dark:border-zinc-600 dark:text-zinc-200"
          />
        </div>
      </ProBlur>
    </section>
  );
}
