import { levelTo, type PriceTrend, type TrendPoint, type TrendSeries } from "@/lib/trend";

// Market trend for one car, on the /worth result and the listing page (Pro):
// what a car like this one is being ASKED, day by day, from our own
// listings. One line. The owner (2026-09-05) took the Washington sales chart
// out of this block — two charts at two grains from two sources was the
// pair nobody could read, and the sale-vs-ask figure already lives on cards
// and the listing page with its own guardrails.
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
// Copy is kept to the axis: what the line is, what the standard car is, and
// how many listings stand behind each day. Server-rendered, no client JS.

const INK = "#121212";
const COBALT = "#1f3fd1";
const PUTTY = "#e8e7e2";
const PAPER = "#ffffff";

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

function Chart({ series, label }: { series: TrendSeries; label: string }) {
  const pts = series.points;
  const t0 = Date.parse(pts[0].period);
  const t1 = Date.parse(pts[pts.length - 1].period);
  const span = Math.max(t1 - t0, 1);
  const vals = pts.flatMap((p) => [p.price, p.p25, p.p75]).filter((v) => Number.isFinite(v));
  const hi = Math.max(...vals);
  const lo = Math.min(...vals);
  const mid = (hi + lo) / 2;
  const range = Math.max((hi - lo) * Y_HEADROOM, mid * Y_RANGE_FLOOR);
  const yLo = mid - range / 2;
  const px = (t: number) => M.l + ((t - t0) / span) * PLOT_W;
  const py = (v: number) => H - M.b - ((v - yLo) / range) * PLOT_H;

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${px(Date.parse(p.period)).toFixed(1)} ${py(p.price).toFixed(1)}`).join(" ");
  const band =
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${px(Date.parse(p.period)).toFixed(1)} ${py(p.p75).toFixed(1)}`).join(" ") +
    " " +
    [...pts].reverse().map((p) => `L ${px(Date.parse(p.period)).toFixed(1)} ${py(p.p25).toFixed(1)}`).join(" ") +
    " Z";

  const first = pts[0];
  const last = pts[pts.length - 1];
  const ends = first === last ? [first] : [first, last];
  const ns = pts.map((p) => p.n);
  const nLo = Math.min(...ns);
  const nHi = Math.max(...ns);
  const titleOf = (p: TrendPoint) =>
    `${dayLabel(p.period)}: ${usd(p.price)} (${usd(p.p25)}–${usd(p.p75)}), ${p.n} listings` +
    (p.odometer != null ? `, median ${miles(p.odometer)}` : "");
  const std = series.stdOdometer != null ? ` · at ${miles(series.stdOdometer)}` : "";

  return (
    <figure>
      <figcaption className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink/50">
        {label}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label={`${label}: ${ends.map(titleOf).join("; ")}`}>
        <path d={band} fill={COBALT} fillOpacity="0.12" stroke="none" />
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
        <line x1={M.l} x2={W - M.r} y1={H - M.b + 4} y2={H - M.b + 4} stroke={PUTTY} strokeWidth="1" />
        <text x={M.l} y={H - 8} fontSize="10" fontWeight="700" fill={INK} fillOpacity="0.55" textAnchor="start">
          {dayLabel(first.period)}
        </text>
        <text x={W - M.r} y={H - 8} fontSize="10" fontWeight="700" fill={INK} fillOpacity="0.55" textAnchor="end">
          {dayLabel(last.period)}
        </text>
      </svg>
      <p className="mt-1 text-[11px] font-bold text-ink/55 tabular-nums">
        {nLo === nHi ? `${nLo}` : `${nLo}–${nHi}`} listings a day
        {std}
      </p>
    </figure>
  );
}

export function PriceTrendCharts({ trend, miles }: { trend: PriceTrend; miles?: number | null }) {
  if (!trend.asks) return null;
  return (
    <div className="max-w-[420px]">
      <Chart series={levelTo(trend.asks, miles)} label="Listing prices" />
    </div>
  );
}
