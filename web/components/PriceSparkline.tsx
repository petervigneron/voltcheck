import { PRICE_FLOOR_USD } from "@/lib/listings/price";

// The asking price's observed path, under the price in the listing detail
// page's sticky summary card (app/listing/[id]/page.tsx). It is the only
// place this renders — there is no card version.
//
// A step, not a slope: an ask holds its value until the seller moves it, and
// drawing diagonals would invent prices nobody listed.
//
// Rebuilt 2026-08-25 because the old version was, in the owner's words, "hard
// to even distinguish as a price graph." Four things were wrong, and each fix
// below is the answer to one of them:
//
//  - It was 36px tall with no axes, no labels and no title. Every number lived
//    in an SVG <title>, which a phone has no way to open. Now the dollar
//    figures at both ends and both dates are drawn, so nothing needs a hover.
//  - The y-axis auto-scaled to the data, so a $500 trim and a $20,000 collapse
//    drew the identical cliff — the chart's loudest signal was noise. The plot
//    range now has a floor of 6% of the car's price (Y_RANGE_FLOOR), so a small
//    move draws small. Printing both dollar values is the belt; this is the
//    braces, because a shopper reads the shape before the digits.
//  - Most histories are two or three points, and the old design fought that
//    instead of using it. Two points is not a trend line, it is one sentence:
//    "-$1,500 on Aug 18." That sentence is now the caption, drawn beneath the
//    chart at a readable size rather than compressed into the line's geometry.
//  - It returned null for the great majority of cars, unexplained, so the
//    section simply vanished with no way to tell "no cuts" from "we don't
//    know". Roughly 82% of live inventory shows no change in a 14-day window
//    (any-cut ran ~18% measured over fourteen days; the 7.3% this file used to
//    cite came from three days of history, see lib/listings/price.ts). A quiet
//    one-line empty state is the honest answer for those cars.
//
// What the caption does NOT say is "listed on". The first point is when OUR
// tracking of this listing began — always true, unlike a listing date we do
// not have — so a car cut before we arrived shows only what we saw, and the
// wording says "first seen" rather than claiming a listing date.
//
// Since 2026-09-03 the chart can carry a second, earlier segment: the series
// this car drew BEFORE its current seller (Listing.priorSite — an earlier
// listing whose page went away, after which the car came back under another
// domain at another price; 1FT6W3L78RWG27106 left Hobson at $41,581 and
// reappeared on Recharged at $47,500). It draws in grey, runs flat to the day
// that listing went away, and then there is a gap before the current series
// starts in cobalt. The rise across the gap is NOT a step: no "+$5,919" line
// is printed for it, because nobody raised a price — one listing ended and
// another began. The owner's rule for this surface is that nothing about it
// is written: no domain labels, no sentence. Grey is before this listing,
// blue is this one, and the dollar figures at the ends of each say the rest.
//
// Server-rendered SVG, no client JS and no dependencies; the per-path <title>
// is a bonus hover layer, never the only copy of a number.

const INK = "#121212";
const COBALT = "#1f3fd1";
const PUTTY = "#e8e7e2";
const PAPER = "#ffffff";
// The earlier segment: recessive, so the current series reads as the subject.
const ASH = "#9b9a94";

// viewBox units; the SVG is w-full so these scale with the card. At the 280px
// card the chart lands ~112px tall, at phone width ~137px.
const W = 310;
const H = 124;
const M = { l: 10, r: 12, t: 24, b: 28 };
const PLOT_W = W - M.l - M.r;
const PLOT_H = H - M.t - M.b;
// The last change sits at 82% of the width so the current price gets a visible
// shelf instead of a cliff at the margin.
const TAIL = PLOT_W * 0.18;

// The plot's y-range never falls below this share of the price, so the drawn
// amplitude means something. A $500 move on a $50k car fills a sixth of the
// height; a $8,000 cut on the same car fills most of it.
const Y_RANGE_FLOOR = 0.06;
// Headroom multiplier when the data's own span is the binding constraint:
// the run of prices occupies ~59% of the plot, the rest is air.
const Y_HEADROOM = 1.7;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthDay = (iso: string) => {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const usd = (n: number) => `$${n.toLocaleString()}`;
// U+2212, not a hyphen: at 12px a hyphen next to a dollar sign reads as a dash.
const signed = (n: number) => (n < 0 ? `−${usd(-n)}` : `+${usd(n)}`);

type Pt = { priceUsd: number; observedAt: string };

/** Drop each observation whose price equals the one kept before it. */
const plateaus = (ps: Pt[]) => ps.filter((p, i) => i === 0 || p.priceUsd !== ps[i - 1].priceUsd);

export function PriceSparkline({
  history,
  prior,
}: {
  history: Pt[];
  prior?: { delistedAt: string; series: Pt[] };
}) {
  // Same junk floor as everywhere else: a lease payment observed once must not
  // draw a cliff. db.ts already applies the tiered hasRealPrice() floor; this
  // is the backstop for any caller that does not. Sorted ascending by the
  // caller (db.ts).
  // Consecutive observations at one price are one plateau, not a step: the
  // history view records every observation that re-asserted a price after
  // another site's row (three $47,500 rows on the Lightning), and drawing
  // each would print "+$0 on Sep 2" twice.
  const pts = plateaus(history.filter((h) => h.priceUsd >= PRICE_FLOOR_USD));
  const ppts = plateaus((prior?.series ?? []).filter((h) => h.priceUsd >= PRICE_FLOOR_USD));
  const hasPrior = ppts.length > 0 && pts.length > 0 && prior !== undefined;

  // Both of these used to get a sentence — "No asking-price history recorded
  // for this listing", "Asking price unchanged since first seen Aug 15" — on
  // the reasoning that nothing-observed and nothing-changed are different
  // claims and neither should be silent. The owner overruled that on
  // 2026-08-25: a line that reports the absence of a price move is a line the
  // shopper reads for nothing. A price chart appears when the price moved,
  // and otherwise the price above it stands on its own. An earlier listing
  // that ended at a different price is a move of that kind, so it draws even
  // when the current seller has held one price.
  if (pts.length === 0) return null;
  if (!hasPrior && pts.length < 2) return null;

  const first = hasPrior ? ppts[0] : pts[0];
  const last = pts[pts.length - 1];
  const t0 = Date.parse(first.observedAt);
  const tLast = Date.parse(last.observedAt);
  const tGone = hasPrior ? Date.parse(prior!.delistedAt) : tLast;
  // The earlier listing can outlive the current one's first sighting (the two
  // sites overlapped for a day on the Lightning), so the "last change" x is
  // whichever came later; the current shelf still runs to the right edge.
  const t1 = Math.max(tLast, tGone);
  const span = Math.max(t1 - t0, 1);

  const vals = [...ppts, ...pts].map((p) => p.priceUsd);
  const hi = Math.max(...vals);
  const lo = Math.min(...vals);
  const mid = (hi + lo) / 2;
  const range = Math.max((hi - lo) * Y_HEADROOM, mid * Y_RANGE_FLOOR);
  const yLo = mid - range / 2;

  const px = (t: number) => M.l + ((t - t0) / span) * (PLOT_W - TAIL);
  const py = (v: number) => H - M.b - ((v - yLo) / range) * PLOT_H;

  // Step path: hold each price until the next observation, then drop or rise,
  // and run flat to the right edge — that shelf is the price still standing.
  const xCur0 = hasPrior ? px(Date.parse(pts[0].observedAt)) : M.l;
  let d = `M ${xCur0.toFixed(1)} ${py(pts[0].priceUsd).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` H ${px(Date.parse(pts[i].observedAt)).toFixed(1)} V ${py(pts[i].priceUsd).toFixed(1)}`;
  }
  d += ` H ${W - M.r}`;

  // The earlier segment: the same step, ending flat at the day the listing
  // went away. No wash under it — the wash is what has come off THIS price.
  let dp = "";
  if (hasPrior) {
    dp = `M ${M.l} ${py(ppts[0].priceUsd).toFixed(1)}`;
    for (let i = 1; i < ppts.length; i++) {
      dp += ` H ${px(Date.parse(ppts[i].observedAt)).toFixed(1)} V ${py(ppts[i].priceUsd).toFixed(1)}`;
    }
    dp += ` H ${px(tGone).toFixed(1)}`;
  }
  const priorLast = hasPrior ? ppts[ppts.length - 1] : undefined;

  const yNow = py(last.priceUsd);
  // The wash between the path and today's price: its height is what has come
  // off (or gone on), its width is how long the car asked the older number.
  const wash = `${d} L ${W - M.r} ${yNow.toFixed(1)} L ${xCur0.toFixed(1)} ${yNow.toFixed(1)} Z`;

  // Steps are within a segment only. The jump from the earlier listing's last
  // price to this one's first is not a step and gets no signed line.
  const stepsOf = (ps: Pt[]) => ps.slice(1).map((p, i) => ({ delta: p.priceUsd - ps[i].priceUsd, at: p.observedAt }));
  const curSteps = stepsOf(pts);
  const steps = [...stepsOf(ppts), ...curSteps];
  const titleOf = (ps: Pt[]) => ps.map((p) => `${monthDay(p.observedAt)}: ${usd(p.priceUsd)}`).join(" → ");
  const title = hasPrior ? `${titleOf(ppts)} | ${titleOf(pts)}` : titleOf(pts);

  // Axis dates: the first sighting, the day the earlier listing went away, and
  // the last change — the latter two only when they have room apart.
  const xLastChange = px(tLast);
  const xGone = px(tGone);
  const lastChangeFits = !hasPrior || Math.abs(xLastChange - xGone) > 48;

  return (
    <figure className="mt-4">
      <figcaption className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink/50 dark:text-zinc-400">
        Asking price history
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 w-full"
        role="img"
        aria-label={`Asking price history: ${title}, still ${usd(last.priceUsd)}`}
      >
        {/* Today's price as a recessive rule the whole width, so the distance
            from the old plateau down to it is readable as a distance. */}
        <line x1={M.l} x2={W - M.r} y1={yNow} y2={yNow} stroke={PUTTY} strokeWidth="1" />
        {hasPrior && (
          <path d={dp} fill="none" stroke={ASH} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
            <title>{titleOf(ppts)}</title>
          </path>
        )}
        <path d={wash} fill={COBALT} fillOpacity="0.1" stroke="none" />
        <path d={d} fill="none" stroke={COBALT} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
          <title>{titleOf(pts)}</title>
        </path>

        {/* Each observation is a dot with a paper ring, so vertices stay legible
            where a riser crosses the rule. The last one is bigger: it is the
            price the shopper would pay today. */}
        {ppts.map((p, i) => (
          <circle
            key={`p${i}`}
            cx={px(Date.parse(p.observedAt))}
            cy={py(p.priceUsd)}
            r="2.6"
            fill={ASH}
            stroke={PAPER}
            strokeWidth="1.5"
          />
        ))}
        {pts.slice(0, -1).map((p, i) => (
          <circle
            key={i}
            cx={px(Date.parse(p.observedAt))}
            cy={py(p.priceUsd)}
            r="2.6"
            fill={COBALT}
            stroke={PAPER}
            strokeWidth="1.5"
          />
        ))}
        <circle cx={px(tLast)} cy={yNow} r="4.5" fill={COBALT} stroke={PAPER} strokeWidth="2" />

        {/* Both ends carry their dollar value. Placed above their own runs and
            pinned to opposite edges, so they cannot collide however the risers
            fall between them. Text wears ink, never the series colour. The
            paper halo (paint-order: stroke) keeps them crisp where a rising
            price puts the start label inside the wash. With an earlier
            segment, its last price sits above the point where it ended. */}
        <text
          x={M.l}
          y={py(first.priceUsd) - 9}
          textAnchor="start"
          fontSize="11"
          fill={INK}
          opacity="0.8"
          stroke={PAPER}
          strokeWidth="3"
          paintOrder="stroke"
          className="tabular-nums"
        >
          {usd(first.priceUsd)}
        </text>
        {priorLast && priorLast.priceUsd !== first.priceUsd && (
          <text
            x={xGone}
            y={py(priorLast.priceUsd) - 9}
            textAnchor="end"
            fontSize="11"
            fill={INK}
            opacity="0.8"
            stroke={PAPER}
            strokeWidth="3"
            paintOrder="stroke"
            className="tabular-nums"
          >
            {usd(priorLast.priceUsd)}
          </text>
        )}
        <text
          x={W - M.r}
          y={yNow - 11}
          textAnchor="end"
          fontSize="11"
          fontWeight="600"
          fill={INK}
          stroke={PAPER}
          strokeWidth="3"
          paintOrder="stroke"
          className="tabular-nums"
        >
          {usd(last.priceUsd)}
        </text>

        <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke={INK} strokeWidth="1.25" />
        <text x={M.l} y={H - M.b + 15} textAnchor="start" fontSize="10" fill={INK} opacity="0.5" className="tabular-nums">
          {monthDay(first.observedAt)}
        </text>
        {hasPrior && (
          <text x={xGone} y={H - M.b + 15} textAnchor="middle" fontSize="10" fill={INK} opacity="0.5" className="tabular-nums">
            {monthDay(prior!.delistedAt)}
          </text>
        )}
        {/* The last change always lands at the same x (the tail is fixed), so
            this label has a fixed position and can never run into the one on
            the left. */}
        {lastChangeFits && (
          <text x={xLastChange} y={H - M.b + 15} textAnchor="middle" fontSize="10" fill={INK} opacity="0.5" className="tabular-nums">
            {monthDay(last.observedAt)}
          </text>
        )}
      </svg>

      {/* The story, at a size a phone can read. Two or three points is not a
          trend, it is one or two sentences — so print the sentences. With an
          earlier segment and more than three steps in all, only this seller's
          steps get lines; the grey shape and its end figures carry the rest. */}
      <div className="mt-1.5 space-y-0.5 text-[12px] leading-snug tabular-nums">
        {steps.length <= 3 ? (
          steps.map((s, i) => (
            <p key={i}>
              <span className="font-semibold text-ink dark:text-zinc-100">{signed(s.delta)}</span>
              <span className="text-ink/55 dark:text-zinc-400"> on {monthDay(s.at)}</span>
            </p>
          ))
        ) : hasPrior && curSteps.length <= 3 ? (
          curSteps.map((s, i) => (
            <p key={i}>
              <span className="font-semibold text-ink dark:text-zinc-100">{signed(s.delta)}</span>
              <span className="text-ink/55 dark:text-zinc-400"> on {monthDay(s.at)}</span>
            </p>
          ))
        ) : (
          <p className="text-ink/55 dark:text-zinc-400">
            <span className="font-semibold text-ink dark:text-zinc-100">{(hasPrior ? curSteps : steps).length} price changes</span> since{" "}
            {monthDay(pts[0].observedAt)}, {usd(pts[0].priceUsd)} to {usd(last.priceUsd)}
          </p>
        )}
      </div>
    </figure>
  );
}

/** The one-line answer for a car with nothing to plot. Never null: a vanished
 *  section reads as "we don't know", which is a different and worse claim. */
