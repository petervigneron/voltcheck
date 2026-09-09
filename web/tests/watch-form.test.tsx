// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/watch-form.test.tsx
//
// The standing order's intake has to offer the axes the sender filters on.
// It shipped 2026-09-02 with no range, pack, heat-pump or newest-year field,
// and the owner's own order mailed him short-range versions of the model he
// named for a week. These pin the four fields to the form, and pin the
// value-watch control to its two states.
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { WatchForm } from "@/components/WatchForm";
import { TrackValue } from "@/components/TrackValue";

test("the standing order asks for range, battery, heat pump and newest year", () => {
  const html = renderToStaticMarkup(<WatchForm email="a@b.co" />);
  for (const id of ["watch-range", "watch-kwh", "watch-max-year", "watch-year", "watch-price", "watch-miles"]) {
    assert.ok(html.includes(`id="${id}"`), `${id} missing`);
  }
  assert.ok(html.includes("Heat pump"));
});

test("the value watch is a button for a pass-holder and a link to /pro for everyone else", () => {
  const pro = renderToStaticMarkup(<TrackValue params="worth=1&year=2023&make=Kia&model=EV6&miles=1000" label="2023 Kia EV6 · 1,000 mi" pro email="a@b.co" />);
  assert.ok(pro.includes("<button"));
  assert.ok(pro.includes("Track this car"));
  const free = renderToStaticMarkup(<TrackValue params="worth=1&year=2023&make=Kia&model=EV6&miles=1000" label="2023 Kia EV6 · 1,000 mi" pro={false} email={null} />);
  assert.ok(free.includes('href="/pro"'));
  assert.ok(!free.includes("<button"));
});
