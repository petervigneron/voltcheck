// From web/:
//   npx tsx --test tests/price-sparkline.test.tsx
//
// The chart's job is amplitude: a $500 trim must not draw with the same
// height as a $20,000 collapse, and a $1,493 lease payment must not draw a
// cliff at all. Those tests are below and unchanged.
//
// What DID change, on 2026-08-25: a car whose price never moved now renders
// nothing. This file used to assert the opposite — that a vanished section
// reads as "we don't know" rather than "no cuts", so silence had to be
// replaced by a sentence ("Asking price unchanged since first seen Aug 12").
// The owner read that sentence and ruled against it: a line reporting that
// nothing happened is a line the shopper reads for nothing. See CLAUDE.md,
// "The house rule on copy". The tests below now pin the silence, so the
// sentence cannot come back by argument.
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

test("a car whose price never moved renders nothing at all", () => {
  const html = renderToStaticMarkup(<PriceSparkline history={[{ priceUsd: 41_990, observedAt: AUG12 }]} />);
  assert.equal(html, "");
});

test("two observations at the same price are silent too, not a flat line", () => {
  const html = renderToStaticMarkup(
    <PriceSparkline
      history={[
        { priceUsd: 41_990, observedAt: AUG12 },
        { priceUsd: 41_990, observedAt: AUG18 },
      ]}
    />
  );
  assert.equal(html, "");
});

test("no observations at all is silent as well", () => {
  // This used to get its own sentence, on the reasoning that never-observed
  // and never-moved are different claims. They are, and neither is one the
  // shopper needs read aloud.
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
  // Under the floor the $493 is not an observation at all, so this car has
  // one price and draws nothing — not a $40k collapse.
  assert.equal(html, "");
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
  // One series, so no legend is owed — but the values must be text, and the
  // text must not wear the series colour.
  assert.ok(!html.includes('fill="#1f3fd1"><text') && !html.includes('<text fill="#1f3fd1"'), html);
  assert.ok(html.includes('role="img"'), html);
  assert.ok(html.includes("aria-label"), html);
});
