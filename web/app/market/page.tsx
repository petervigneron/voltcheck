import type { Metadata } from "next";
import Link from "next/link";
import { fetchMarket, type Market } from "@/lib/market";

// The public market page: where used-EV asking prices stand and how they
// have moved, site-wide and per model. lib/market.ts and migration 0115 say
// what every figure is and which guards it passed; this file only draws.
//
// Rendered on first request and cached for a day, like the hubs — the
// tables underneath close one day at a time. /api/revalidate names this
// path, so a publish turns it over. fetchMarket() throws rather than
// returning an empty market, which leaves the previous render in place.
//
// COPY. Every visible string here is a placeholder label of mine, kept to
// the fewest words that make a column readable; the owner writes the copy.
// There is deliberately no paragraph explaining the numbers.
export const dynamic = "force-static";
export const revalidate = 86400;

/** Models with fewer used cars than this are left to their hub pages. */
const MIN_CARS = 100;

export const metadata: Metadata = {
  title: "Used EV prices: asking-price index by model | Census EV",
  description:
    "Mileage-adjusted asking prices for used electric and plug-in hybrid cars in the US, by model, with 30- and 60-day changes. Updated daily from every listing on Census EV.",
  alternates: { canonical: "/market" },
};

const nf = new Intl.NumberFormat("en-US");
const usd = (n: number) => `$${nf.format(n)}`;
const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;
const longDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function IndexChart({ site }: { site: Market["site"] }) {
  const W = 640;
  const H = 220;
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const vals = site.map((p) => p.idx * 100);
  const lo = Math.floor(Math.min(...vals) - 1);
  const hi = Math.ceil(Math.max(...vals) + 1);
  const x = (i: number) => pad.l + (i / (site.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  const path = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += Math.max(1, Math.round((hi - lo) / 4))) ticks.push(v);
  const months = site
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => i === 0 || p.day.endsWith("-01"));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-6 w-full" role="img" aria-label="Used EV asking-price index by day">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-ink/10" />
          <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="fill-ink/50 text-[11px]">
            {v}
          </text>
        </g>
      ))}
      {months.map(({ p, i }) => (
        <text key={p.day} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : "middle"} className="fill-ink/50 text-[11px]">
          {shortDay(p.day)}
        </text>
      ))}
      <path d={path} fill="none" stroke="var(--color-violet)" strokeWidth={2.5} strokeLinejoin="round" />
      <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r={4} fill="var(--color-violet)" />
    </svg>
  );
}

export default async function MarketPage() {
  const market = await fetchMarket();
  const first = market.site[0];
  const last = market.site[market.site.length - 1];
  const move = (last.idx / first.idx - 1) * 100;
  const rows = market.rows.filter((r) => r.cars >= MIN_CARS);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Used EV asking-price index, United States",
    description:
      "Daily mileage-adjusted asking prices for used electric and plug-in hybrid vehicles listed for sale in the United States, site-wide and by model, from Census EV listings.",
    url: "https://censusev.com/market",
    creator: { "@type": "Organization", name: "Census EV", url: "https://censusev.com" },
    temporalCoverage: `${first.day}/${last.day}`,
    dateModified: market.asOf,
    spatialCoverage: "United States",
    variableMeasured: ["Asking price index", "Asking price at 40,000 miles", "30-day change", "60-day change"],
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

      <section className="mt-8 border-[3px] border-ink bg-paper p-5">
        <h2 className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-ink/60">
          Mileage-adjusted asking prices · all used cars on the site
        </h2>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-3">
          <span className="text-5xl font-extrabold tracking-tight text-violet">{pct(move)}</span>
          <span className="text-sm font-semibold text-ink/70">
            {longDay(first.day)} to {longDay(last.day)}
          </span>
        </p>
        <p className="mt-1 text-[13px] text-ink/60">
          {nf.format(last.cars)} cars · {shortDay(first.day)} = 100
        </p>
        <IndexChart site={market.site} />
      </section>

      <section className="mt-8">
        <h2 className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-ink/60">By model · used</h2>
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
