import type { RecentSale } from "@/lib/listings/sales";
import type { AskVsSold } from "@/lib/listings/comps";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Above this many sales the rows fold behind a one-line summary. */
const SHOW_INLINE = 4;

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
/** One line saying what the rows below add up to, so the block can be read
 *  without being opened: how many sales, and the range of money involved. */
function summary(sales: RecentSale[]): string {
  const prices = sales.map((s) => s.salePrice);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const n = `${sales.length} ${sales.length === 1 ? "sale" : "sales"}`;
  return lo === hi ? `${n} at $${lo.toLocaleString()}` : `${n}, $${lo.toLocaleString()}–$${hi.toLocaleString()}`;
}

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

  const rows = (
    <>
      {same.length > 0 && (
        <ul className="mt-3 divide-y divide-ink/10">
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
          <ul className={`${same.length > 0 ? "mt-1" : "mt-3"} divide-y divide-ink/10`}>
            {other.map((s, i) => (
              <Row key={i} s={s} />
            ))}
          </ul>
        </>
      )}
    </>
  );

  return (
    <div className="min-w-0 border-[3px] border-ink bg-paper p-5">
      <h2 className="text-[10.5px] font-extrabold tracking-[0.14em] text-ink/55 uppercase">
        Recently sold
      </h2>

      {/* 2026-08-20 (docs/agents/pricing-model-2026-08-20.md): this panel no
          longer restates vsSold as a claim — the single-state (WA) sold
          model reached 4.7% of listings and measured 7-35% high outside the
          Northwest, so it's withheld from every display surface until a
          second regional dataset validates an offset. vsSold is still
          passed in and still computed (comps.ts); the raw rows below are
          the honest version of this panel's job — facts, no verdict.

          The second dataset is still outstanding. ca_cc4a_used_ev_sales was
          measured against WA on 2026-09-12 and is not it — it records the
          contract total rather than the vehicle price, and lands above WA in
          15 of 15 nameplates while California's own asking prices sit below
          WA's. The numbers and the control test are in lib/listings/sales.ts;
          the offset this panel is waiting on cannot be computed from it. */}

      {scatter}

      {/* Ten rows of year/version/miles/price/date was the tallest thing on
          the page, and the chart above already plots every one of them. Past a
          handful the table stops being the answer and becomes the workings, so
          it folds: the count and the money it spans stay on the face of the
          card, and the rows are one click away for anyone checking. */}
      {sales.length > SHOW_INLINE ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-[14px] font-semibold text-ink hover:text-cobalt">
            {summary(sales)}
          </summary>
          {rows}
        </details>
      ) : (
        rows
      )}

      {/* ODbL attribution: required wherever these rows render, so this line
          is a licence term and not a design choice. Kept to a bare credit. */}
      <p className="mt-3 border-t border-ink/10 pt-2">
        <a
          href="https://data.wa.gov/Transportation/Electric-Vehicle-Title-and-Registration-Activity/rpr4-cgyd"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10.5px] font-extrabold tracking-[0.14em] text-ink/40 uppercase hover:text-cobalt"
        >
          WA DOL (ODbL)
        </a>
      </p>
    </div>
  );
}
