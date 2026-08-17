// The asking price's whole observed path, as a step line in the summary
// card. A step, not a slope: an ask holds its value until the seller moves
// it, and drawing diagonals would invent prices nobody listed. The claim is
// scoped by the caption — "since Aug 12" is when OUR tracking of this
// listing began (always true, unlike a listing date), so a car that was cut
// before we arrived shows only what we saw. Renders nothing for the great
// majority of cars whose observed ask has never moved (any-cut ran 7.3% of
// inventory when measured 2026-08-14, lib/listings/price.ts); on the rest,
// the shape is the story the cut tile compresses into one number.

const COBALT = "#1f3fd1";
const PUTTY = "#e8e7e2";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthDay = (iso: string) => {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

export function PriceSparkline({ history }: { history: { priceUsd: number; observedAt: string }[] }) {
  // Junk floor as everywhere else: a lease payment observed once must not
  // draw a cliff. Sorted ascending by the caller (db.ts).
  const pts = history.filter((h) => h.priceUsd >= 1000);
  if (pts.length < 2 || new Set(pts.map((p) => p.priceUsd)).size < 2) return null;

  // Time runs first observation → last change; the final horizontal run to
  // the right edge says "still the price" without needing a clock in a pure
  // render (react-hooks/purity forbids Date.now here).
  const t0 = Date.parse(pts[0].observedAt);
  const t1 = Date.parse(pts[pts.length - 1].observedAt);
  const span = Math.max(t1 - t0, 1);
  const yMin = Math.min(...pts.map((p) => p.priceUsd));
  const yMax = Math.max(...pts.map((p) => p.priceUsd));

  const W = 280;
  const H = 36;
  const PAD = 4;
  // The last change lands at 85% width so the current price gets a visible
  // shelf to the right edge instead of a cliff at the margin.
  const TAIL = W * 0.15;
  const px = (t: number) => ((t - t0) / span) * (W - TAIL);
  const py = (v: number) => (yMax === yMin ? H / 2 : PAD + ((yMax - v) / (yMax - yMin)) * (H - 2 * PAD));

  // Step path: hold each price until the next observation, then drop/rise.
  let d = `M 0 ${py(pts[0].priceUsd).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const x = px(Date.parse(pts[i].observedAt)).toFixed(1);
    d += ` H ${x} V ${py(pts[i].priceUsd).toFixed(1)}`;
  }
  d += ` H ${W}`;

  const last = pts[pts.length - 1];
  const title = pts.map((p) => `${monthDay(p.observedAt)}: $${p.priceUsd.toLocaleString()}`).join(" → ");

  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-9 w-full" preserveAspectRatio="none" role="img" aria-label={`Asking price history: ${title}`}>
        <line x1="0" x2={W} y1={H - 1} y2={H - 1} stroke={PUTTY} strokeWidth="1" />
        <path d={d} fill="none" stroke={COBALT} strokeWidth="2" vectorEffect="non-scaling-stroke">
          <title>{title}</title>
        </path>
        <circle cx={W} cy={py(last.priceUsd)} r="3" fill={COBALT} />
      </svg>
      <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
        Asking price since {monthDay(pts[0].observedAt)}
      </p>
    </div>
  );
}
