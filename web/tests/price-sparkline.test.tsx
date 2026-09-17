// From web/:
//   npx tsx --test tests/price-sparkline.test.tsx
//
// The chart's job is amplitude: a $500 trim must not draw with the same
// height as a $20,000 collapse, and a $1,493 lease payment must not draw a
// cliff at all. Those tests are below and unchanged.
//
// 2026-08-25: a car whose price never moved rendered nothing, and this file
// pinned that silence so the deleted sentence ("Asking price unchanged since
// first seen Aug 12") could not come back by argument.
//
// 2026-09-17, owner: "It should always show what the price has done, even if
// it has not moved." The silence was measured that day at 2,480 of 6,000 live
// cars against 2,387 that drew — the tracker was missing from most of the
// pages that have one. So a held price now DRAWS: a flat line, its price, and
// the day it has held it since.
//
// The deleted sentence stays deleted, and the tests below pin BOTH halves —
// the chart renders, and it carries no caption. That distinction is the whole
// ruling: what the owner struck was a line read for nothing, not the data.
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PriceSparkline } from "@/components/PriceSparkline";

const AUG12 = "2026-08-12T09:00:00Z";
const AUG18 = "2026-08-18T09:00:00Z";
const AUG20 = "2026-08-20T09:00:00Z";
const AUG21 = "2026-08-21T09:00:00Z";
const AUG24 = "2026-08-24T09:00:00Z";

/** The y coordinates of the step path — the wash under it is the one closed
 *  with Z, so the open path is the line itself. */
function stepYs(html: string): number[] {
  const ds = [...html.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
  const step = ds.find((s) => !s.includes("Z"));
  assert.ok(step, `no open step path in ${html}`);
  const ys: number[] = [];
  const start = /^M\s+[\d.]+\s+([\d.]+)/.exec(step);
  assert.ok(start, step);
  ys.push(Number(start[1]));
  for (const m of step.matchAll(/V\s+([\d.]+)/g)) ys.push(Number(m[1]));
  return ys;
}

test("a car whose price never moved draws a flat line at the price it holds", () => {
  const html = renderToStaticMarkup(<PriceSparkline history={[{ priceUsd: 41_990, observedAt: AUG12 }]} />);
  assert.notEqual(html, "");
  assert.ok(html.includes("Asking price history"), html);
  // The price and the day it has held it since — the two facts the chart is.
  assert.ok(html.includes("$41,990"), html);
  assert.ok(html.includes(">Aug 12<"), html);
  // One price, DRAWN once: both ends are the same number on the same line, and
  // printing it twice reads as two numbers rather than one held one. Counted
  // over drawn <text> only — the aria-label and the hover title legitimately
  // repeat it for readers who get the chart as words.
  const drawn = [...html.matchAll(/<text[^>]*>([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(drawn.filter((t) => t === "$41,990").length, 1, drawn.join(" | "));
  // The line is flat: one y for the whole step path.
  assert.deepEqual([...new Set(stepYs(html))].length, 1, html);
});

test("a held price carries no caption — the deleted sentence stays deleted", () => {
  const html = renderToStaticMarkup(<PriceSparkline history={[{ priceUsd: 41_990, observedAt: AUG12 }]} />);
  // 2026-08-25, owner: "If you have no information to offer DON'T WRITE
  // ANYTHING." The chart is not a sentence; nothing under it explains what it
  // already shows, and no line reports that nothing happened.
  assert.doesNotMatch(html, /unchanged|no change|hasn.t moved|held|since first seen/i);
  // No step line of any kind, signed or zero.
  assert.doesNotMatch(html, /[−+]\$/, html);
});

test("two observations at the same price are one plateau, drawn flat", () => {
  const html = renderToStaticMarkup(
    <PriceSparkline
      history={[
        { priceUsd: 41_990, observedAt: AUG12 },
        { priceUsd: 41_990, observedAt: AUG18 },
      ]}
    />
  );
  assert.notEqual(html, "");
  // Still no "+$0 on Aug 18": re-asserting a price is not a step.
  assert.doesNotMatch(html, /\$0 on/, html);
  assert.deepEqual([...new Set(stepYs(html))].length, 1, html);
});

test("no observations at all is still silent: a chart of nothing claims nothing", () => {
  // Never-observed and never-moved ARE different claims, and now they render
  // differently: a held price draws its line, a car we hold no price row for
  // draws nothing. Neither gets a sentence.
  assert.equal(renderToStaticMarkup(<PriceSparkline history={[]} />), "");
});

test("the junk floor still holds: a payment figure cannot draw a cut", () => {
  // $1,493 finance payments reached price history before the extractor guard
  // existed; under the floor they are not observations at all, so this car
  // reads as unchanged rather than as a $40k collapse.
  const html = renderToStaticMarkup(
    <PriceSparkline
      history={[
        { priceUsd: 41_990, observedAt: AUG12 },
        { priceUsd: 493, observedAt: AUG18 },
      ]}
    />
  );
  // Under the floor the $493 is not an observation at all, so this car has one
  // price and draws it flat — not a $40k collapse.
  assert.doesNotMatch(html, /\$493/, html);
  assert.doesNotMatch(html, /[−+]\$/, html);
  assert.deepEqual([...new Set(stepYs(html))].length, 1, html);
});

test("the common two-point history reads as one sentence, not a hover", () => {
  const html = renderToStaticMarkup(
    <PriceSparkline
      history={[
        { priceUsd: 43_490, observedAt: AUG12 },
        { priceUsd: 41_990, observedAt: AUG18 },
      ]}
    />
  );
  // The step is labelled in drawn text, because a phone cannot open a tooltip.
  assert.ok(html.includes("−$1,500"), html);
  assert.ok(html.includes("on Aug 18"), html);
  // Both dollar figures and both dates are printed, so amplitude and span
  // never depend on the reader guessing the scale.
  assert.ok(html.includes("$43,490"), html);
  assert.ok(html.includes("$41,990"), html);
  assert.ok(html.includes(">Aug 12<"), html);
  assert.ok(html.includes(">Aug 18<"), html);
  // And it is framed as what it is.
  assert.ok(html.includes("Asking price history"), html);
});

test("a rise is signed as a rise", () => {
  const html = renderToStaticMarkup(
    <PriceSparkline
      history={[
        { priceUsd: 41_990, observedAt: AUG12 },
        { priceUsd: 42_990, observedAt: AUG18 },
      ]}
    />
  );
  assert.ok(html.includes("+$1,000"), html);
});

test("$500 does not draw like $8,000 — the y-range has a floor", () => {
  // The whole defect: auto-scaling to the data made every history, however
  // small, fill the box. The plot range now floors at 6% of the car's price.
  const small = stepYs(
    renderToStaticMarkup(
      <PriceSparkline
        history={[
          { priceUsd: 50_000, observedAt: AUG12 },
          { priceUsd: 49_500, observedAt: AUG18 },
        ]}
      />
    )
  );
  const big = stepYs(
    renderToStaticMarkup(
      <PriceSparkline
        history={[
          { priceUsd: 50_000, observedAt: AUG12 },
          { priceUsd: 42_000, observedAt: AUG18 },
        ]}
      />
    )
  );
  const drop = (ys: number[]) => Math.max(...ys) - Math.min(...ys);
  assert.ok(drop(big) > drop(small) * 3, `small ${drop(small)} vs big ${drop(big)}`);
  // Both stay inside the plot band rather than touching the axis: the range is
  // padded past the data at both ends.
  for (const ys of [small, big]) for (const y of ys) assert.ok(y > 24 && y < 96, `${y} outside plot band`);
});

test("every step gets its own line, up to three; more collapse to a count", () => {
  const three = renderToStaticMarkup(
    <PriceSparkline
      history={[
        { priceUsd: 45_000, observedAt: AUG12 },
        { priceUsd: 44_000, observedAt: AUG18 },
        { priceUsd: 43_000, observedAt: AUG21 },
      ]}
    />
  );
  assert.ok(three.includes("on Aug 18"), three);
  assert.ok(three.includes("on Aug 21"), three);

  // Four steps or more and the list would out-length the card, so it becomes
  // a count plus the two endpoints; the rest stays in the drawn line.
  const many = renderToStaticMarkup(
    <PriceSparkline
      history={[
        { priceUsd: 45_000, observedAt: AUG12 },
        { priceUsd: 44_000, observedAt: AUG18 },
        { priceUsd: 43_500, observedAt: AUG20 },
        { priceUsd: 43_200, observedAt: AUG21 },
        { priceUsd: 43_000, observedAt: AUG24 },
      ]}
    />
  );
  assert.ok(many.includes("4 price changes"), many);
  assert.ok(many.includes("$45,000"), many);
  assert.ok(many.includes("$43,000"), many);
  assert.ok(!many.includes("on Aug 20"), many);
});

test("the svg scales without distorting text or overflowing the card", () => {
  const html = renderToStaticMarkup(
    <PriceSparkline
      history={[
        { priceUsd: 43_490, observedAt: AUG12 },
        { priceUsd: 41_990, observedAt: AUG18 },
      ]}
    />
  );
  // preserveAspectRatio="none" is what stretched the old 36px strip and would
  // squash every glyph now that there are glyphs.
  assert.ok(!html.includes("preserveAspectRatio"), html);
  assert.ok(html.includes('class="mt-1 w-full"'), html);
  assert.ok(html.includes('viewBox="0 0 310 124"'), html);
});

test("the chart is legible without colour: nothing carries meaning by hue alone", () => {
  const html = renderToStaticMarkup(
    <PriceSparkline
      history={[
        { priceUsd: 43_490, observedAt: AUG12 },
        { priceUsd: 41_990, observedAt: AUG18 },
      ]}
    />
  );
  // One series, so no legend is owed — but the values must be text. And no
  // cobalt anywhere: it means a control, and a price line is not one (owner,
  // 2026-09-10). The series used to be cobalt; it is ink.
  assert.ok(!html.includes("#1f3fd1"), html);
  assert.ok(html.includes('role="img"'), html);
  assert.ok(html.includes("aria-label"), html);
});

// 2026-09-03: the chart can carry the series a car drew before its current
// seller (1FT6W3L78RWG27106: Hobson $47,230 > $43,924 > $41,581, page gone
// Sep 2, back on Recharged at $47,500). It draws in grey ahead of a break,
// and the rise across the break is not a step. Nothing about it is written.
const SEP1 = "2026-09-01T23:52:00Z";
const SEP2_GONE = "2026-09-02T18:17:00Z";
const hobson = {
  delistedAt: SEP2_GONE,
  series: [
    { priceUsd: 47_230, observedAt: "2026-08-26T15:51:00Z" },
    { priceUsd: 43_924, observedAt: "2026-08-28T00:57:00Z" },
    { priceUsd: 41_581, observedAt: "2026-08-31T20:38:00Z" },
  ],
};

test("an earlier listing draws even when this seller has held one price", () => {
  const html = renderToStaticMarkup(
    <PriceSparkline history={[{ priceUsd: 47_500, observedAt: SEP1 }]} prior={hobson} />
  );
  assert.notEqual(html, "");
  assert.match(html, /\$47,230/);
  assert.match(html, /\$41,581/);
  assert.match(html, /\$47,500/);
});

test("the rise across the break is not a step: no signed line for it", () => {
  const html = renderToStaticMarkup(
    <PriceSparkline history={[{ priceUsd: 47_500, observedAt: SEP1 }]} prior={hobson} />
  );
  assert.doesNotMatch(html, /\+\$5,919/);
  assert.match(html, /−\$3,306/);
  assert.match(html, /−\$2,343/);
});

test("the earlier segment is grey and ends at the day the listing went away, with no words", () => {
  const html = renderToStaticMarkup(
    <PriceSparkline history={[{ priceUsd: 47_500, observedAt: SEP1 }]} prior={hobson} />
  );
  assert.match(html, /stroke="#9b9a94"/);
  assert.match(html, />Sep 2</);
  assert.doesNotMatch(html, /hobson|recharged|sold|dealer|previous/i);
});

test("without an earlier listing, one held price draws its own flat line", () => {
  const html = renderToStaticMarkup(<PriceSparkline history={[{ priceUsd: 47_500, observedAt: SEP1 }]} prior={undefined} />);
  assert.ok(html.includes("$47,500"), html);
  assert.deepEqual([...new Set(stepYs(html))].length, 1, html);
});

test("observations that re-assert one price are a plateau, never a +$0 step", () => {
  const html = renderToStaticMarkup(
    <PriceSparkline
      history={[
        { priceUsd: 47_500, observedAt: SEP1 },
        { priceUsd: 47_500, observedAt: "2026-09-02T08:24:00Z" },
        { priceUsd: 47_500, observedAt: "2026-09-02T21:13:00Z" },
      ]}
      prior={hobson}
    />
  );
  assert.doesNotMatch(html, /\$0 on/);
  assert.match(html, /−\$3,306/);
});

// 2026-09-17, owner: "you need to fix the graph when prices move upward."
//
// The wash — the grey area between the old price and today's — means money
// that has come OFF. It was drawn in both directions, so a car whose price
// ROSE $1,500 rendered the identical slab, at the identical opacity, as one
// CUT $1,500: the one thing a price chart exists to tell apart, and the wrong
// direction to be wrong in under the house rule on claims, where a false
// bargain is the expensive error. It also swallowed the start label, which is
// what the paper halo on these labels had been papering over.
//
// The wash is now clipped to the band above today's price. These pin the
// meaning, not the mechanism: a rise shades nothing, a cut shades, and a
// series that did both shades only the part still above what it asks today.

/** The wash is the closed path (the one with Z); the clip is what bounds it. */
function washOf(html: string): { d: string; clipped: boolean } | undefined {
  const m = /<path d="([^"]*Z)"([^>]*)>/.exec(html);
  if (!m) return undefined;
  return { d: m[1], clipped: m[2].includes("clip-path") };
}

/** The height of the clip rect — the band above today's price that may shade. */
function clipHeight(html: string): number | undefined {
  const m = /<clipPath[^>]*>\s*<rect[^>]*height="([\d.]+)"/.exec(html);
  return m ? Number(m[1]) : undefined;
}

const rise = renderToStaticMarkup(
  <PriceSparkline
    history={[
      { priceUsd: 41_990, observedAt: AUG12 },
      { priceUsd: 43_490, observedAt: AUG18 },
    ]}
  />
);
const fall = renderToStaticMarkup(
  <PriceSparkline
    history={[
      { priceUsd: 43_490, observedAt: AUG12 },
      { priceUsd: 41_990, observedAt: AUG18 },
    ]}
  />
);

test("a price that went up shades nothing: the wash is money off, not money on", () => {
  const w = washOf(rise);
  assert.ok(w, rise);
  assert.ok(w.clipped, "the wash must be clipped to the band above today's price");
  // Today's price is the HIGHEST point of a pure rise, so the whole wash sits
  // below the clip and none of it paints. Verified by geometry rather than by
  // pixels: every y in the wash is at or below the clip's height.
  const h = clipHeight(rise);
  assert.ok(h !== undefined, rise);
  const ys = [...w.d.matchAll(/[MLV]\s+(?:[\d.]+\s+)?([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(
    ys.every((y) => y >= h - 0.05),
    `a rise must paint nothing above today's price: clip ${h}, wash ys ${ys.join(",")}`
  );
});

test("a price that came down still shades, and by the same geometry as before", () => {
  const w = washOf(fall);
  assert.ok(w, fall);
  const h = clipHeight(fall);
  assert.ok(h !== undefined, fall);
  // The old plateau sits ABOVE today's price, inside the clip, so the slab
  // paints exactly as it always did.
  const ys = [...w.d.matchAll(/[MLV]\s+(?:[\d.]+\s+)?([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(ys.some((y) => y < h - 0.05), `a cut must still paint: clip ${h}, wash ys ${ys.join(",")}`);
});

test("a rise and a cut of the same size no longer draw the same picture", () => {
  // The defect stated as the shopper met it. Both charts carry their signed
  // caption; only the cut carries the slab.
  assert.ok(rise.includes("+$1,500"), rise);
  assert.ok(fall.includes("−$1,500"), fall);
  const painted = (html: string) => {
    const w = washOf(html)!;
    const h = clipHeight(html)!;
    const ys = [...w.d.matchAll(/[MLV]\s+(?:[\d.]+\s+)?([\d.]+)/g)].map((m) => Number(m[1]));
    return ys.some((y) => y < h - 0.05);
  };
  assert.equal(painted(rise), false);
  assert.equal(painted(fall), true);
});

test("a car that was cut and then raised shades only what is still off", () => {
  // $45,000 → $41,000 → $43,000. The car asks $43,000 today, so the $45,000
  // plateau (above it) shades and the $41,000 dip (below it) does not.
  const html = renderToStaticMarkup(
    <PriceSparkline
      history={[
        { priceUsd: 45_000, observedAt: AUG12 },
        { priceUsd: 41_000, observedAt: AUG18 },
        { priceUsd: 43_000, observedAt: AUG24 },
      ]}
    />
  );
  const w = washOf(html);
  assert.ok(w?.clipped, html);
  const h = clipHeight(html)!;
  const ys = [...w.d.matchAll(/[MLV]\s+(?:[\d.]+\s+)?([\d.]+)/g)].map((m) => Number(m[1]));
  // Both sides are present in the path; the clip is what decides which paints.
  assert.ok(ys.some((y) => y < h - 0.05), `the $45,000 plateau must shade: ${ys.join(",")}`);
  assert.ok(ys.some((y) => y > h + 0.05), `the $41,000 dip must be below the clip: ${ys.join(",")}`);
  assert.ok(html.includes("−$4,000"), html);
  assert.ok(html.includes("+$2,000"), html);
});

test("the clip id is derived from the data, so server and browser markup agree", () => {
  // A render-order counter would differ between the server pass and hydration
  // and silently unclip the wash in the browser.
  const a = renderToStaticMarkup(
    <PriceSparkline history={[{ priceUsd: 41_990, observedAt: AUG12 }, { priceUsd: 43_490, observedAt: AUG18 }]} />
  );
  assert.equal(a, rise);
  const id = /<clipPath id="([^"]+)"/.exec(rise)?.[1];
  assert.ok(id, rise);
  assert.ok(rise.includes(`url(#${id})`), rise);
  // A different car gets a different id.
  const other = /<clipPath id="([^"]+)"/.exec(fall)?.[1];
  assert.notEqual(id, other);
});
