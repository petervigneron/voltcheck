import type { RecentSale } from "@/lib/listings/sales";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthYear(isoDate: string): string {
  const [y, m] = isoDate.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

/** Recent real-world sales of the same make/model: what each car sold for,
 *  with its mileage. Transaction prices from state title records — the
 *  counterpart to the asking price above it on the page. */
export function RecentSales({ sales, make, model }: { sales: RecentSale[]; make: string; model: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <h2 className="text-sm font-semibold">
        Recent sales — {make} {model}
      </h2>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        What buyers actually paid, not asking prices.
      </p>

      <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
        {sales.map((s, i) => (
          <li key={i} className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
            <span className="flex items-baseline gap-3 tabular-nums">
              <span className="w-10 font-medium">{s.modelYear ?? "—"}</span>
              <span className="text-zinc-500 dark:text-zinc-400">{s.odometer.toLocaleString()} mi</span>
            </span>
            <span className="flex items-baseline gap-3">
              <span className="font-semibold tabular-nums">${s.salePrice.toLocaleString()}</span>
              <span className="w-16 text-right text-xs text-zinc-400 dark:text-zinc-500">{monthYear(s.saleDate)}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-zinc-100 dark:border-zinc-800 pt-3 text-xs text-zinc-500 dark:text-zinc-400">
        <a
          href="https://data.wa.gov/Transportation/Electric-Vehicle-Title-and-Registration-Activity/rpr4-cgyd"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-emerald-600"
        >
          Source: Washington State Department of Licensing
        </a>{" "}
        (ODbL)
      </p>
    </div>
  );
}
