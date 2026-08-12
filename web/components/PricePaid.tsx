import type { PriceComps } from "@/lib/listings/prices";
import { describeBasis } from "@/lib/listings/prices";

const money = (n: number) => `$${n.toLocaleString()}`;

/**
 * What people actually paid for this model, from Washington DOL title
 * records. Listings show asking prices; this is the only public dataset of
 * real transaction prices in the US, so it is the one place a shopper can
 * see both numbers side by side.
 *
 * House rules apply: the source is named, the sample size and its basis are
 * stated, and nothing is editorialised — the comparison is shown, the
 * shopper draws the conclusion.
 */
export function PricePaid({ comps, askingPrice }: { comps: PriceComps; askingPrice: number }) {
  const diff = askingPrice - comps.median;
  const pct = Math.round((Math.abs(diff) / comps.median) * 100);
  // Below 3% the difference is noise against a median of a few hundred cars.
  const meaningful = pct >= 3;

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <h2 className="text-sm font-semibold">What people actually paid</h2>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        Recorded sale prices from Washington State vehicle title records — not asking prices.
      </p>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div>
          <div className="text-2xl font-bold tabular-nums">{money(comps.median)}</div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">median paid</div>
        </div>
        <div>
          <div className="text-sm font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
            {money(comps.p25)} – {money(comps.p75)}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">middle half of sales</div>
        </div>
        {comps.medianOdometer != null && (
          <div>
            <div className="text-sm font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
              {comps.medianOdometer.toLocaleString()} mi
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">median odometer</div>
          </div>
        )}
      </div>

      {meaningful && (
        <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
          This car is listed{" "}
          <span className="font-semibold tabular-nums">
            {money(Math.abs(diff))} {diff > 0 ? "above" : "below"}
          </span>{" "}
          that median ({pct}%).
        </p>
      )}

      <p className="mt-3 border-t border-zinc-100 dark:border-zinc-800 pt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        Based on {describeBasis(comps)}. Washington is the only state that publishes what buyers
        actually paid, so these are Washington sales — a national reference point, not local
        pricing. Sales under $5,000 are excluded because the state&apos;s figure is a declared
        price and the low end includes family transfers.{" "}
        <a
          href="https://data.wa.gov/Transportation/Electric-Vehicle-Title-and-Registration-Activity/rpr4-cgyd"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-emerald-600"
        >
          Source: Washington State Department of Licensing
        </a>{" "}
        (ODbL).
      </p>
    </div>
  );
}
