import type { PriceTrend, TrendPoint, TrendSeries } from "@/lib/trend";

// Market trends for one car, on the /worth result (Pro): two charts, kept
// apart on purpose (owner, 2026-09-03) — what a standard car of this cohort
// FETCHED, by quarter, from Washington title sales; and what one is being
// ASKED, by week, from our own listings. Different questions, different
// flaws, and the gap between them is itself the number a buyer negotiates
// with, so neither is ever drawn over the other.
//
// "Standard car": lib/trend.ts. The line moves when the market moves, not
// when the mix of cars does — which is the whole reason a raw median would
// not do here.
//
// Drawn in the same idiom as components/PriceSparkline.tsx: a fixed viewBox,
// the dollar figures at both ends printed rather than hovered, a y-range
// floor so a small move draws small, and every point carrying its own n and
// odometer in a <title>. What this file adds is the interquartile band under
// the line — a quarter with eight sales spread $10k wide should look wider
// than one with sixty sales stacked at one number.
//
// Copy is kept to the axis: what the line is, what the standard car is, and
// how many sales or listings stand behind each point. Server-rendered, no
// client JS.

const INK = "#121212";
const COBALT = "#1f3fd1";
const TEAL = "#0f7b6c";
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

function periodLabel(iso: string, grain: "quarter" | "week"): string {
  const d = new Date(iso);
  if (grain === "quarter") return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function Chart({
  series,
  grain,
  colour,
  unit,
  label,
}: {
  series: TrendSeries;
  grain: "quarter" | "week";
  colour: string;
  /** "sales" or "listings" — what n counts. */
  unit: string;
  label: string;
}) {
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
  const ns = pts.map((p) => p.n);
  const nLo = Math.min(...ns);
  const nHi = Math.max(...ns);
  const titleOf = (p: TrendPoint) =>
    `${periodLabel(p.period, grain)}: ${usd(p.price)} (${usd(p.p25)}–${usd(p.p75)}), ${p.n} ${unit}` +
    (p.odometer != null ? `, median ${miles(p.odometer)}` : "");

  const per = grain === "quarter" ? "a quarter" : "a week";
  const std = series.stdOdometer != null ? ` · at ${miles(series.stdOdometer)}` : "";

  return (
    <figure>
      <figcaption className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink/50">
        {label}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label={`${label}: ${pts.map(titleOf).join("; ")}`}>
        <path d={band} fill={colour} fillOpacity="0.12" stroke="none" />
        <path d={line} fill="none" stroke={colour} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p) => (
          <circle
            key={p.period}
            cx={px(Date.parse(p.period))}
            cy={py(p.price)}
            r={p === first || p === last ? 3.5 : 2.5}
            fill={colour}
            stroke={PAPER}
            strokeWidth="1.5"
          >
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
          {periodLabel(first.period, grain)}
        </text>
        <text x={W - M.r} y={H - 8} fontSize="10" fontWeight="700" fill={INK} fillOpacity="0.55" textAnchor="end">
          {periodLabel(last.period, grain)}
        </text>
      </svg>
      <p className="mt-1 text-[11px] font-bold text-ink/55 tabular-nums">
        {nLo === nHi ? `${nLo}` : `${nLo}–${nHi}`} {unit} {per}
        {std}
      </p>
    </figure>
  );
}

export function PriceTrendCharts({ trend }: { trend: PriceTrend }) {
  if (!trend.sales && !trend.asks) return null;
  return (
    <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
      {trend.sales && <Chart series={trend.sales} grain="quarter" colour={TEAL} unit="sales" label="Sale prices, Washington" />}
      {trend.asks && <Chart series={trend.asks} grain="week" colour={COBALT} unit="listings" label="Listing prices" />}
    </div>
  );
}
