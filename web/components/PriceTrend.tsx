import { levelTo, type PriceTrend, type SiteTrend, type TrendPoint, type TrendSeries } from "@/lib/trend";

// Market trend for one car, on the /worth result and the listing page (Pro):
// what a car like this one is being ASKED, day by day, from our own
// listings. The owner (2026-09-05) took the Washington sales chart out of
// this block — two charts at two grains from two sources was the pair nobody
// could read, and the sale-vs-ask figure already lives on cards and the
// listing page with its own guardrails.
//
// 2026-09-07, owner: the block was "still confusing". Three changes, in his
// words — stop saying how many cars were listed (the "N listings a day" line
// is gone; n survives only in the end-points' hover), say that the line is a
// MILEAGE-ADJUSTED trend (the caption), and show two comparisons on the same
// plot: the car in front of the shopper (`price`, a dashed rule at its
// asking price) and every car on the site (`trend.site`, a second, quieter
// line). The site line is an index — each day's move is every used cohort's
// own move, weighted by cars, chained — so it is drawn in this cohort's
// dollars by scaling it to the cohort's first day. Its shape is the
// market's; its level is borrowed, which is the only way one axis can hold
// both.
//
// "Standard car": lib/trend.ts. The line moves when the market moves, not
// when the mix of cars does — which is the whole reason a raw median would
// not do here. It is drawn at the shopper's own `miles` when that is inside
// the fitted window, else at the series' own odometer, and prints which.
//
// Drawn in the same idiom as components/PriceSparkline.tsx: a fixed viewBox,
// the dollar figures at both ends printed rather than hovered, a y-range
// floor so a small move draws small, and the ends carrying their n and
// odometer in a <title>. What this file adds is the interquartile band under
// the line — a day with eight listings spread $10k wide should look wider
// than one with sixty stacked at one number. A day series is dozens of
// points on a 310-wide plot, so only its ends get a dot.
//
// Server-rendered, no client JS. The strings here (caption, legend) are the
// owner's own words from 2026-09-07 or the car's own name; nothing explains
// the number underneath the number.

const INK = "#121212";
const COBALT = "#1f3fd1";
const PUTTY = "#e8e7e2";
const PAPER = "#ffffff";
/** The site line is context, not the answer: ink at less than half weight. */
const SITE_OPACITY = 0.38;

const W = 310;
const H = 132;
const M = { l: 10, r: 12, t: 22, b: 26 };
const PLOT_W = W - M.l - M.r;
const PLOT_H = H - M.t - M.b;
const Y_RANGE_FLOOR = 0.08;
const Y_HEADROOM = 1.5;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const miles = (n: number) => `${Math.round(n).toLocaleString("en-US")} mi`;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * The site index in this cohort's dollars: anchored to the cohort's first
 * day that the index also covers, then scaled by the index's move since.
 * Only the cohort's own days are drawn, so the two lines share an x-range;
 * fewer than two shared days is no line.
 */
export function siteInCohortDollars(series: TrendSeries, site: SiteTrend | null): { period: string; price: number }[] {
  if (!site) return [];
  const idx = new Map(site.points.map((p) => [p.period, p.idx]));
  const base = series.points.find((p) => idx.has(p.period));
  if (!base) return [];
  const b = idx.get(base.period)!;
  const out: { period: string; price: number }[] = [];
  for (const p of series.points) {
    const i = idx.get(p.period);
    if (i === undefined) continue;
    out.push({ period: p.period, price: base.price * (i / b) });
  }
  return out.length >= 2 ? out : [];
}

function Chart({
  series,
  site,
  price,
  subject,
  label,
}: {
  series: TrendSeries;
  site: SiteTrend | null;
  /** The asking price of the car on the page, drawn as a rule across the plot. */
  price?: number;
  /** What the cobalt line is — the car's own name, for the legend. */
  subject?: string;
  label: string;
}) {
  const pts = series.points;
  const siteLine = siteInCohortDollars(series, site);
  const t0 = Date.parse(pts[0].period);
  const t1 = Date.parse(pts[pts.length - 1].period);
  const span = Math.max(t1 - t0, 1);
  const marker = price != null && Number.isFinite(price) && price > 0 ? price : undefined;
  const vals = [
    ...pts.flatMap((p) => [p.price, p.p25, p.p75]),
    ...siteLine.map((p) => p.price),
    ...(marker != null ? [marker] : []),
  ].filter((v) => Number.isFinite(v));
  const hi = Math.max(...vals);
  const lo = Math.min(...vals);
  const mid = (hi + lo) / 2;
  const range = Math.max((hi - lo) * Y_HEADROOM, mid * Y_RANGE_FLOOR);
  const yLo = mid - range / 2;
  const px = (t: number) => M.l + ((t - t0) / span) * PLOT_W;
  const py = (v: number) => H - M.b - ((v - yLo) / range) * PLOT_H;
  const pathOf = (ps: { period: string; price: number }[]) =>
    ps.map((p, i) => `${i === 0 ? "M" : "L"} ${px(Date.parse(p.period)).toFixed(1)} ${py(p.price).toFixed(1)}`).join(" ");

  const line = pathOf(pts);
  const band =
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${px(Date.parse(p.period)).toFixed(1)} ${py(p.p75).toFixed(1)}`).join(" ") +
    " " +
    [...pts].reverse().map((p) => `L ${px(Date.parse(p.period)).toFixed(1)} ${py(p.p25).toFixed(1)}`).join(" ") +
    " Z";

  const first = pts[0];
  const last = pts[pts.length - 1];
  const ends = first === last ? [first] : [first, last];
  const titleOf = (p: TrendPoint) =>
    `${dayLabel(p.period)}: ${usd(p.price)} (${usd(p.p25)}–${usd(p.p75)}), ${p.n} listings` +
    (p.odometer != null ? `, median ${miles(p.odometer)}` : "");
  const std = series.stdOdometer != null ? ` · at ${miles(series.stdOdometer)}` : "";

  // The marker's figure sits at the right end, on whichever side of the rule
  // keeps it clear of the last point's own figure (printed 8px above it).
  let markerLabelY = 0;
  if (marker != null) {
    const my = py(marker);
    const lastLabelY = py(last.price) - 8;
    markerLabelY = my <= py(last.price) ? Math.min(my - 5, lastLabelY - 13) : Math.max(my + 13, lastLabelY + 13);
  }

  const legend = [
    ...(subject ? [{ swatch: COBALT, opacity: 1, text: subject }] : []),
    ...(siteLine.length ? [{ swatch: INK, opacity: SITE_OPACITY, text: "All cars on the site" }] : []),
  ];

  return (
    <figure>
      <figcaption className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink/50">
        {label}
        {std}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label={`${label}: ${ends.map(titleOf).join("; ")}`}>
        <path d={band} fill={COBALT} fillOpacity="0.12" stroke="none" />
        {siteLine.length > 0 && (
          <path
            d={pathOf(siteLine)}
            fill="none"
            stroke={INK}
            strokeOpacity={SITE_OPACITY}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        <path d={line} fill="none" stroke={COBALT} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {ends.map((p) => (
          <circle key={p.period} cx={px(Date.parse(p.period))} cy={py(p.price)} r={3.5} fill={COBALT} stroke={PAPER} strokeWidth="1.5">
            <title>{titleOf(p)}</title>
          </circle>
        ))}
        {/* The figures at both ends, printed: a shopper reads the shape first
            and the digits second, and neither should need a hover. */}
        <text x={px(t0)} y={py(first.price) - 8} fontSize="11" fontWeight="800" fill={INK} textAnchor="start">
          {usd(first.price)}
        </text>
        <text x={px(t1)} y={py(last.price) - 8} fontSize="11" fontWeight="800" fill={INK} textAnchor="end">
          {usd(last.price)}
        </text>
        {marker != null && (
          <>
            <line
              x1={M.l}
              x2={W - M.r}
              y1={py(marker)}
              y2={py(marker)}
              stroke={INK}
              strokeWidth="1.5"
              strokeDasharray="4 3"
              strokeLinecap="round"
            >
              <title>{usd(marker)}</title>
            </line>
            <text x={W - M.r} y={markerLabelY} fontSize="11" fontWeight="800" fill={INK} textAnchor="end">
              {usd(marker)}
            </text>
          </>
        )}
        <line x1={M.l} x2={W - M.r} y1={H - M.b + 4} y2={H - M.b + 4} stroke={PUTTY} strokeWidth="1" />
        <text x={M.l} y={H - 8} fontSize="10" fontWeight="700" fill={INK} fillOpacity="0.55" textAnchor="start">
          {dayLabel(first.period)}
        </text>
        <text x={W - M.r} y={H - 8} fontSize="10" fontWeight="700" fill={INK} fillOpacity="0.55" textAnchor="end">
          {dayLabel(last.period)}
        </text>
      </svg>
      {legend.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold text-ink/55">
          {legend.map((l) => (
            <li key={l.text} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-[3px] w-4 rounded-full" style={{ background: l.swatch, opacity: l.opacity }} />
              {l.text}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

export function PriceTrendCharts({
  trend,
  miles,
  price,
  subject,
}: {
  trend: PriceTrend;
  miles?: number | null;
  /** The asking price of the car on the page; absent on /worth, where there is no ask. */
  price?: number | null;
  /** The car's name ("2023 Tesla Model Y"), for the legend beside the site line. */
  subject?: string;
}) {
  if (!trend.asks) return null;
  return (
    <div className="max-w-[420px]">
      <Chart
        series={levelTo(trend.asks, miles)}
        site={trend.site ?? null}
        price={price ?? undefined}
        subject={subject}
        label="Mileage-adjusted asking prices"
      />
    </div>
  );
}
