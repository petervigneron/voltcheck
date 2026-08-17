import type { RecentSale } from "@/lib/listings/sales";
import type { PriceSignals } from "@/lib/listings/peers";

// Price against mileage: real sales (cobalt, WA title records — the card's
// attribution line covers them), the cohort's live asks (recessive gray),
// and this car (saffron diamond — the system's "look closer" color, and the
// chart's subject). Server-rendered SVG, no client JS; per-point <title>
// is the hover layer.
//
// Honesty rules, in order of importance:
//  - Same-version and other-version points are DIFFERENT marks (solid vs
//    hollow) with a legend. One undifferentiated cloud would re-create the
//    biased-mixture read that migration 0022 suppresses in the fitted
//    models: a Platinum floating above a sea of Pros looks overpriced, a
//    Pro under Platinums looks like a find, every time. Shape carries the
//    split alongside color, so it survives colorblindness and print.
//  - No fitted line. The models' line is guarded by 0015/0022 and earns its
//    place only where those gates pass; drawing it here would re-assert it
//    on pages where the gates said no. Observations only.
//  - Renders only when this car itself can be plotted (real price and a
//    mileage) among at least four other points — a chart that can't locate
//    its subject is decoration.

const INK = "#121212";
const COBALT = "#1f3fd1";
const GRAY = "#8a887f";
const SAFFRON = "#f7b500";
const PUTTY = "#e8e7e2";

const W = 560;
const H = 230;
const M = { l: 50, r: 14, t: 12, b: 34 };
const MAX_ASKS = 150;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const kUsd = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);
const kMi = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** A round step (1/2/2.5/5 × 10^k) giving 3-5 ticks over the span. */
function niceStep(span: number, target: number): number {
  const raw = span / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

function ticks(min: number, max: number, target: number): number[] {
  const step = niceStep(max - min || 1, target);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
  return out;
}

export function PriceScatter({
  sales,
  peerAsks,
  self,
}: {
  sales: RecentSale[];
  peerAsks: PriceSignals["peerAsks"];
  self: { mileage: number; priceUsd: number };
}) {
  const sold = sales.filter((s) => s.odometer > 100 && s.salePrice >= 1000);
  // A cohort can run to a few hundred live asks; past ~150 points the cloud
  // is ink, not information. Deterministic thinning (every nth by mileage
  // order), never random — the same page must render the same chart.
  const asksAll = [...peerAsks].sort((a, b) => a.mileage - b.mileage);
  const asks =
    asksAll.length > MAX_ASKS
      ? asksAll.filter((_, i) => i % Math.ceil(asksAll.length / MAX_ASKS) === 0)
      : asksAll;

  if (sold.length + asks.length < 4) return null;

  const xs = [self.mileage, ...sold.map((s) => s.odometer), ...asks.map((a) => a.mileage)];
  const ys = [self.priceUsd, ...sold.map((s) => s.salePrice), ...asks.map((a) => a.priceUsd)];
  const xMax = Math.max(...xs) * 1.06;
  const ySpan = Math.max(...ys) - Math.min(...ys);
  const yMin = Math.max(0, Math.min(...ys) - ySpan * 0.1 - 500);
  const yMax = Math.max(...ys) + ySpan * 0.1 + 500;

  const px = (v: number) => M.l + (v / xMax) * (W - M.l - M.r);
  const py = (v: number) => H - M.b - ((v - yMin) / (yMax - yMin)) * (H - M.t - M.b);

  const soldSame = sold.filter((s) => s.sameVariant);
  const soldOther = sold.filter((s) => !s.sameVariant);
  const askSame = asks.filter((a) => a.sameTrim === true);
  const askOther = asks.filter((a) => a.sameTrim !== true);

  const soldTitle = (s: RecentSale) => {
    const [y, m] = s.saleDate.split("-");
    return `${s.modelYear ?? ""} ${s.variant ?? "version unknown"} · ${s.odometer.toLocaleString()} mi · sold $${s.salePrice.toLocaleString()} (${MONTHS[Number(m) - 1]} ${y})`;
  };
  const askTitle = (a: { mileage: number; priceUsd: number }) =>
    `${a.mileage.toLocaleString()} mi · asking $${a.priceUsd.toLocaleString()}`;

  const d = 6.5; // this-car diamond half-diagonal
  const sx = px(self.mileage);
  const sy = py(self.priceUsd);

  const legend: { label: string; swatch: React.ReactNode; show: boolean }[] = [
    {
      label: "Sold, this version",
      swatch: <circle cx="6" cy="6" r="4" fill={COBALT} />,
      show: soldSame.length > 0,
    },
    {
      label: "Sold, other versions",
      swatch: <circle cx="6" cy="6" r="3.5" fill="none" stroke={COBALT} strokeWidth="1.8" />,
      show: soldOther.length > 0,
    },
    {
      label: "Asking, same trim",
      swatch: <circle cx="6" cy="6" r="4" fill={GRAY} />,
      show: askSame.length > 0,
    },
    {
      label: "Asking, other or unknown trim",
      swatch: <circle cx="6" cy="6" r="3.5" fill="none" stroke={GRAY} strokeWidth="1.8" />,
      show: askOther.length > 0,
    },
    {
      label: "This car",
      swatch: <rect x="1.5" y="1.5" width="9" height="9" fill={SAFFRON} stroke={INK} strokeWidth="1.5" transform="rotate(45 6 6)" />,
      show: true,
    },
  ];

  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Price against mileage: sales, current asking prices, and this car" className="w-full">
        {/* Recessive grid: y ticks only, putty lines under everything. */}
        {ticks(yMin, yMax, 4).map((v) => (
          <g key={`y${v}`}>
            <line x1={M.l} x2={W - M.r} y1={py(v)} y2={py(v)} stroke={PUTTY} strokeWidth="1" />
            <text x={M.l - 6} y={py(v) + 3} textAnchor="end" fontSize="10" fill={INK} opacity="0.5" className="tabular-nums">
              {kUsd(v)}
            </text>
          </g>
        ))}
        {ticks(0, xMax, 5).map((v) => (
          <text key={`x${v}`} x={px(v)} y={H - M.b + 14} textAnchor="middle" fontSize="10" fill={INK} opacity="0.5" className="tabular-nums">
            {kMi(v)}
          </text>
        ))}
        <text x={W - M.r} y={H - 6} textAnchor="end" fontSize="10" fill={INK} opacity="0.5">
          miles
        </text>
        <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke={INK} strokeWidth="1.5" />

        {/* Asks under sales under the subject: the claim-bearing points win overlaps. */}
        {askOther.map((a, i) => (
          <circle key={`ao${i}`} cx={px(a.mileage)} cy={py(a.priceUsd)} r="3.5" fill="none" stroke={GRAY} strokeWidth="1.6">
            <title>{askTitle(a)}</title>
          </circle>
        ))}
        {askSame.map((a, i) => (
          <circle key={`as${i}`} cx={px(a.mileage)} cy={py(a.priceUsd)} r="4" fill={GRAY} stroke="#ffffff" strokeWidth="1">
            <title>{askTitle(a)}</title>
          </circle>
        ))}
        {soldOther.map((s, i) => (
          <circle key={`so${i}`} cx={px(s.odometer)} cy={py(s.salePrice)} r="3.5" fill="none" stroke={COBALT} strokeWidth="1.8">
            <title>{soldTitle(s)}</title>
          </circle>
        ))}
        {soldSame.map((s, i) => (
          <circle key={`ss${i}`} cx={px(s.odometer)} cy={py(s.salePrice)} r="4.5" fill={COBALT} stroke="#ffffff" strokeWidth="1">
            <title>{soldTitle(s)}</title>
          </circle>
        ))}
        <g transform={`rotate(45 ${sx} ${sy})`}>
          <rect x={sx - d / 1.41} y={sy - d / 1.41} width={(2 * d) / 1.41} height={(2 * d) / 1.41} fill={SAFFRON} stroke={INK} strokeWidth="1.5">
            <title>{`This car · ${self.mileage.toLocaleString()} mi · asking $${self.priceUsd.toLocaleString()}`}</title>
          </rect>
        </g>
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        {legend
          .filter((l) => l.show)
          .map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              <svg width="12" height="12" aria-hidden="true">
                {l.swatch}
              </svg>
              {l.label}
            </span>
          ))}
      </figcaption>
    </figure>
  );
}
