import type { RecentSale } from "@/lib/listings/sales";
import type { AskVsSold } from "@/lib/listings/comps";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthYear(isoDate: string): string {
  const [y, m] = isoDate.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

function Row({ s }: { s: RecentSale }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="w-10 shrink-0 font-medium tabular-nums">{s.modelYear ?? "—"}</span>
        {/* min-w-0 so truncate can actually shrink this span: without it the
            variant's full nowrap width is the row's minimum, which on a
            375pt phone pushed the whole page grid past the screen edge. */}
        <span className={`min-w-0 truncate ${s.variant ? "" : "text-zinc-400 dark:text-zinc-500"}`}>
          {s.variant ?? "Unknown"}
        </span>
      </span>
      <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
        <span className="w-20 text-right text-zinc-500 dark:text-zinc-400">
          {s.odometer.toLocaleString()} mi
        </span>
        <span className="w-20 text-right font-semibold">${s.salePrice.toLocaleString()}</span>
        <span className="w-16 text-right text-xs text-zinc-400 dark:text-zinc-500">
          {monthYear(s.saleDate)}
        </span>
      </span>
    </li>
  );
}

/** What these actually sold for, by version.
 *
 *  The version column is the point. Without it a Lightning Pro and a Lightning
 *  Platinum sit in one list $30k apart and the whole thing reads as a price
 *  range for the truck on this page, which it isn't. Versions come from the
 *  seller's VIN via migration 0016; "Unknown" is a kept answer, because Ford
 *  stamped no trim code on 2022-23 Lightnings and Tesla files none at all.
 *
 *  Sales of this car's own version sort first (recent_sales takes its VIN),
 *  so the top of the list is the comparison the shopper is actually making. */
export function RecentSales({
  sales,
  vsSold,
  scatter,
}: {
  sales: RecentSale[];
  vsSold?: AskVsSold;
  /** The price-vs-mileage chart (components/PriceScatter.tsx), rendered here
   *  so its sold points sit above the rows they plot and under the card's
   *  ODbL attribution line, which covers both. */
  scatter?: React.ReactNode;
}) {
  const same = sales.filter((s) => s.sameVariant);
  const other = sales.filter((s) => !s.sameVariant);

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Recently sold
      </h2>

      {vsSold && (
        <p className="mt-2 border-l-4 border-emerald-500 pl-3 text-sm font-semibold">
          Asks ${Math.abs(vsSold.deltaUsd).toLocaleString()} {vsSold.deltaUsd < 0 ? "under" : "over"} $
          {vsSold.soldUsd.toLocaleString()}
        </p>
      )}

      {scatter}

      {same.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
          {same.map((s, i) => (
            <Row key={i} s={s} />
          ))}
        </ul>
      )}

      {other.length > 0 && (
        <>
          {/* Only labelled when both groups are present — with one group the
              heading would name something the reader can't contrast it with. */}
          {same.length > 0 && (
            <p className="mt-3 text-xs font-medium text-zinc-400 dark:text-zinc-500">Other versions</p>
          )}
          <ul className={`${same.length > 0 ? "mt-1" : "mt-3"} divide-y divide-zinc-100 dark:divide-zinc-800`}>
            {other.map((s, i) => (
              <Row key={i} s={s} />
            ))}
          </ul>
        </>
      )}

      {/* ODbL attribution: required wherever these rows render, so this line
          is a licence term and not a design choice. Kept to a bare credit. */}
      <p className="mt-3 border-t border-zinc-100 dark:border-zinc-800 pt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
        <a
          href="https://data.wa.gov/Transportation/Electric-Vehicle-Title-and-Registration-Activity/rpr4-cgyd"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-emerald-600"
        >
          WA DOL (ODbL)
        </a>
      </p>
    </div>
  );
}
