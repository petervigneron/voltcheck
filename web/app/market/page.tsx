import type { Metadata } from "next";
import Link from "next/link";
import { fetchMarket } from "@/lib/market";
import { openGraph, OWN_IMAGE } from "@/lib/og/meta";

// The public market page: what used EVs sold for, month by month, and where
// asking prices stand now, site-wide and per model. lib/market.ts and
// migrations 0115/0116 say what every figure is and which guards it passed;
// this file only draws.
//
// The national section (0119) is a second measurement, not a second line on
// the first chart: one retailer's fixed prices by quarter, beside a state's
// title records by month. The source is described and not named — the
// owner's decision, 2026-11-10 — and the label must keep saying "one
// retailer": without it the section claims to be the market.
//
// ORDER IS THE POINT. The first version (2026-11-10) led with the asking
// index alone: "-5.0%, Aug 15 to Nov 8". True for its window, and the owner
// read it as contradicting a year of coverage about used-EV prices rising —
// because the asking archive starts after the spring run-up ended. So sold
// prices come first and run back twenty months, where the rise and the turn
// are both visible, and the asking index sits under them as the recent
// detail it is. No section prints a single headline percentage for "used EV
// prices": the months are printed, and the reader can see the arc.
//
// Rendered on first request and cached for a day, like the hubs.
// /api/revalidate names this path, so a publish turns it over.
// fetchMarket() throws rather than returning an empty market, which leaves
// the previous render in place.
//
// COPY. Every visible string here is a placeholder label of mine, kept to
// the fewest words that make a figure readable; the owner writes the copy.
// "Washington sales prices" is his (2026-09-03). There is deliberately no
// paragraph explaining the numbers.
export const dynamic = "force-static";
export const revalidate = 86400;

/** Models with fewer used cars than this are left to their hub pages. */
const MIN_CARS = 100;
/** Months printed as figures above the sold chart. */
const STRIP = 6;

const TITLE = "Used EV prices: monthly sold prices and asking-price index | Census EV";
const DESCRIPTION =
  "What used electric cars sold for month by month, from Washington title records, and mileage-adjusted asking prices by model across the US. Updated daily from every listing on Census EV.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/market" },
  openGraph: openGraph(TITLE, DESCRIPTION, "/market", OWN_IMAGE),
};

const nf = new Intl.NumberFormat("en-US");
const usd = (n: number) => `$${nf.format(n)}`;
const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;
const utc = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
const longDay = (iso: string) => utc(iso, { month: "short", day: "numeric", year: "numeric" });
const shortDay = (iso: string) => utc(iso, { month: "short", day: "numeric" });
const monthName = (iso: string) => utc(iso, { month: "short" });
const monthYear = (iso: string) => utc(iso, { month: "short", year: "numeric" });
const quarter = (iso: string) => `Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
const quarterYear = (iso: string) => `${quarter(iso)} ${iso.slice(0, 4)}`;

function LineChart({ values, marks, label }: { values: number[]; marks: { i: number; text: string }[]; label: string }) {
  const W = 640;
  const H = 220;
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const lo = Math.floor(Math.min(...values) - 1);
  const hi = Math.ceil(Math.max(...values) + 1);
  const x = (i: number) => pad.l + (i / (values.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  const path = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const step = Math.max(1, Math.round((hi - lo) / 4));
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-5 w-full" role="img" aria-label={label}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-ink/10" />
          <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="fill-ink/50 text-[11px]">
            {v}
          </text>
        </g>
      ))}
      {marks.map((m) => (
        <text key={m.i} x={x(m.i)} y={H - 6} textAnchor={m.i === 0 ? "start" : m.i === values.length - 1 ? "end" : "middle"} className="fill-ink/50 text-[11px]">
          {m.text}
        </text>
      ))}
      <path d={path} fill="none" stroke="var(--color-violet)" strokeWidth={2.5} strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={4} fill="var(--color-violet)" />
    </svg>
  );
}

// The national series is drawn as each quarter's own change, not chained into
// a level. A cohort is a fixed model year, so every quarter carries three
// months of ageing; chained over six years the line falls from 100 to 56 and
// reads as "EV prices fell 44%", which nothing here measured. As bars, the
// usual few points of ageing are a visible baseline and the quarters that
// broke from it (2021's rises, early 2023's fall) stand out as what they were.
function BarChart({ values, marks, label }: { values: number[]; marks: { i: number; text: string }[]; label: string }) {
  const W = 640;
  const H = 220;
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const hi = Math.max(5, Math.ceil(Math.max(...values) / 5) * 5);
  const lo = Math.min(-5, Math.floor(Math.min(...values) / 5) * 5);
  const slot = (W - pad.l - pad.r) / values.length;
  const x = (i: number) => pad.l + i * slot;
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += 5) ticks.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-5 w-full" role="img" aria-label={label}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="currentColor" className={v === 0 ? "text-ink/40" : "text-ink/10"} />
          <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="fill-ink/50 text-[11px]">
            {v > 0 ? `+${v}` : v}%
          </text>
        </g>
      ))}
      {values.map((v, i) => (
        <rect key={i} x={x(i) + slot * 0.15} width={slot * 0.7} y={Math.min(y(v), y(0))} height={Math.max(1, Math.abs(y(v) - y(0)))} fill="var(--color-violet)" />
      ))}
      {marks.map((m) => (
        <text key={m.i} x={x(m.i) + slot * 0.15} y={H - 6} textAnchor="start" className="fill-ink/50 text-[11px]">
          {m.text}
        </text>
      ))}
    </svg>
  );
}

const sectionLabel = "text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-ink/60";

export default async function MarketPage() {
  const market = await fetchMarket();
  const { sold, national, site } = market;
  const first = site[0];
  const last = site[site.length - 1];
  const move = (last.idx / first.idx - 1) * 100;
  const rows = market.rows.filter((r) => r.cars >= MIN_CARS);
  const strip = sold.slice(-STRIP);
  const quarters = national.slice(-STRIP);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Used EV prices, United States: monthly sold prices and asking-price index",
    description:
      "Month-over-month change in used electric and plug-in hybrid vehicle sale prices from Washington State title records, and a daily mileage-adjusted asking-price index site-wide and by model from Census EV listings.",
    url: "https://censusev.com/market",
    creator: { "@type": "Organization", name: "Census EV", url: "https://censusev.com" },
    temporalCoverage: `${sold[0]?.month ?? first.day}/${last.day}`,
    dateModified: market.asOf,
    spatialCoverage: "United States",
    isBasedOn: "https://data.wa.gov/d/rpr4-cgyd",
    variableMeasured: [
      "Monthly change in sale price, same model and model year",
      "Quarterly change in sale price nationwide, one retailer, same model and model year",
      "Asking price index",
      "Asking price at 40,000 miles",
      "30-day change",
      "60-day change",
    ],
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label="Breadcrumb" className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink/40">
        <Link href="/" className="hover:text-cobalt">
          Census
        </Link>{" "}
        / <span className="text-ink/70">Market</span>
      </nav>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink">Used EV prices</h1>

      {sold.length >= 2 && (
        <section className="mt-8 border-[3px] border-ink bg-paper p-5">
          <h2 className={sectionLabel}>Washington sales prices · same model and model year · mileage-adjusted</h2>
          <ol className="mt-4 grid grid-cols-3 gap-px bg-ink/10 sm:grid-cols-6">
            {strip.map((m) => (
              <li key={m.month} className="bg-paper px-2 py-2.5 text-center">
                <div className="text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-ink/50">{monthName(m.month)}</div>
                <div className="mt-1 text-xl font-extrabold tracking-tight tabular-nums text-violet">{pct(m.change)}</div>
                <div className="mt-0.5 text-[11px] tabular-nums text-ink/50">{nf.format(m.sales)} sales</div>
              </li>
            ))}
          </ol>
          <LineChart
            values={[100, ...sold.map((m) => m.idx)]}
            marks={[
              { i: 0, text: "" },
              ...sold.map((m, i) => ({ i: i + 1, text: m.month.slice(5, 7) === "01" ? monthYear(m.month) : "" })).filter((m) => m.text),
              { i: sold.length, text: monthYear(sold[sold.length - 1].month) },
            ].filter((m, i, all) => m.text && all.findIndex((o) => o.i === m.i) === i)}
            label="Washington used EV sale prices by month, chained index"
          />
          <p className="mt-2 text-[12px] text-ink/50">
            {monthYear(sold[0].month)} to {monthYear(sold[sold.length - 1].month)} · month before the first = 100 · WA DOL (ODbL)
          </p>
        </section>
      )}

      {national.length >= 2 && (
        <section className="mt-8 border-[3px] border-ink bg-paper p-5">
          <h2 className={sectionLabel}>Sales prices nationwide · one national used-car retailer · same model and model year</h2>
          <ol className="mt-4 grid grid-cols-3 gap-px bg-ink/10 sm:grid-cols-6">
            {quarters.map((m) => (
              <li key={m.month} className="bg-paper px-2 py-2.5 text-center">
                <div className="text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-ink/50">{quarterYear(m.month)}</div>
                <div className="mt-1 text-xl font-extrabold tracking-tight tabular-nums text-violet">{pct(m.change)}</div>
                <div className="mt-0.5 text-[11px] tabular-nums text-ink/50">{nf.format(m.sales)} sales</div>
              </li>
            ))}
          </ol>
          <BarChart
            values={national.map((m) => m.change)}
            marks={national.map((m, i) => ({ i, text: m.month.slice(5, 7) === "01" ? m.month.slice(0, 4) : "" })).filter((m) => m.text)}
            label="Quarterly change in used EV sale prices nationwide, one retailer"
          />
          <p className="mt-2 text-[12px] text-ink/50">
            Change from the quarter before · {quarterYear(national[0].month)} to {quarterYear(national[national.length - 1].month)} · financed
            purchases, from public financial filings · not mileage-adjusted
          </p>
        </section>
      )}

      <section className="mt-8 border-[3px] border-ink bg-paper p-5">
        <h2 className={sectionLabel}>Mileage-adjusted asking prices · all used cars on the site</h2>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-3">
          <span className="text-2xl font-extrabold tracking-tight tabular-nums text-violet">{pct(move)}</span>
          <span className="text-sm font-semibold text-ink/70">
            {longDay(first.day)} to {longDay(last.day)}
          </span>
        </p>
        <p className="mt-1 text-[13px] text-ink/60">
          {nf.format(last.cars)} cars · {shortDay(first.day)} = 100
        </p>
        <LineChart
          values={site.map((p) => p.idx * 100)}
          marks={site.map((p, i) => ({ i, text: i === 0 || p.day.endsWith("-01") ? shortDay(p.day) : "" })).filter((m) => m.text)}
          label="Used EV asking-price index by day"
        />
      </section>

      <section className="mt-8">
        <h2 className={sectionLabel}>By model · used · asking prices</h2>
        <div className="mt-2 overflow-x-auto border-[3px] border-ink bg-paper">
          <table className="w-full min-w-[520px] text-left text-[14px]">
            <thead>
              <tr className="border-b-[3px] border-ink text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-ink/60">
                <th className="px-4 py-2.5">Model</th>
                <th className="px-3 py-2.5 text-right">For sale</th>
                <th className="px-3 py-2.5 text-right">Asking at 40,000 mi</th>
                <th className="px-3 py-2.5 text-right">30 days</th>
                <th className="px-4 py-2.5 text-right">60 days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {rows.map((r) => (
                <tr key={r.path}>
                  <td className="px-4 py-2.5">
                    <Link href={r.path} className="font-bold text-ink hover:text-cobalt">
                      {r.make} {r.model}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink/70">{nf.format(r.cars)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{usd(r.ask)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.change30 == null ? "" : pct(r.change30)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.change60 == null ? "" : pct(r.change60)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-ink/50">
          {longDay(market.asOf)} ·{" "}
          <Link href="/methodology" className="underline underline-offset-2 hover:text-cobalt">
            How we source this data
          </Link>
        </p>
      </section>
    </div>
  );
}
