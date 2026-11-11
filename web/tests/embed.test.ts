// lib/embed/card.ts: the card another site frames and the snippet that frames it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMBED_ROWS, embedHeight, embedHtml, embedSnippet, embedYears, esc } from "../lib/embed/card";
import type { HubStats } from "../lib/listings/hubIndex";
import type { ModelHub } from "../lib/listings/modelHubs";

const hub: ModelHub = { makeSlug: "tesla", make: "Tesla", modelSlug: "model-3", model: "Model 3", keys: ["model3"] };
const stats = (years: HubStats["years"]): HubStats => ({
  asOf: "2026-11-10",
  byCondition: { new: 0, used: 0, certified: 0 },
  cuts: 0,
  years,
  configs: [],
  states: [],
});
const YEARS: HubStats["years"] = [
  { year: 2019, n: 300, priced: 290, medianUsd: 19000 },
  { year: 2020, n: 40, priced: 40, medianUsd: 21000 },
  { year: 2021, n: 500, priced: 480, medianUsd: 23000 },
  { year: 2022, n: 600, priced: 590, medianUsd: 25000 },
  { year: 2023, n: 900, priced: 880, medianUsd: 27998 },
  // Too few priced cars for a median: hubStats left it out, so the card does too.
  { year: 2026, n: 3, priced: 3 },
];

test("the card lists the most numerous model years that have a median, newest first", () => {
  const rows = embedYears(stats(YEARS));
  assert.equal(rows.length, EMBED_ROWS);
  assert.deepEqual(rows.map((r) => r.year), [2023, 2022, 2021, 2019]);
});

test("the card states the count with its month, the rows, and links to the model page with the embed label", () => {
  const html = embedHtml(hub, 3445, stats(YEARS));
  assert.match(html, /3,445 for sale · November 2026/);
  assert.match(html, /<th scope="row">2023<\/th><td class="n">900<\/td><td class="p">\$27,998<\/td>/);
  assert.match(html, /href="https:\/\/censusev\.com\/ev\/tesla\/model-3\?ref=embed"/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/censusev\.com\/ev\/tesla\/model-3">/);
  assert.doesNotMatch(html, /<script/);
});

test("no cars, or no date for the count, prints no count; no medians prints no table", () => {
  assert.doesNotMatch(embedHtml(hub, 0, stats(YEARS)), /for sale ·/);
  assert.doesNotMatch(embedHtml(hub, 3445, undefined), /for sale ·/);
  const bare = embedHtml(hub, 12, stats([{ year: 2026, n: 3, priced: 3 }]));
  assert.doesNotMatch(bare, /<table/);
  assert.match(bare, /12 for sale · November 2026/);
});

test("a nameplate cannot break out of the markup", () => {
  const odd: ModelHub = { ...hub, model: `3"><script>alert(1)</script>` };
  const html = embedHtml(odd, 5, stats([]));
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(embedSnippet(odd), /<script>/);
  assert.equal(esc(`a&b<c>"d'`), "a&amp;b&lt;c&gt;&quot;d&#39;");
});

test("the snippet is the frame plus one plain followed link the host page carries itself", () => {
  const s = embedSnippet(hub);
  assert.match(s, /^<iframe src="https:\/\/censusev\.com\/embed\/tesla\/model-3" title="Tesla Model 3 for sale" width="360" height="\d+"/);
  assert.match(s, /<\/iframe>\n<p><a href="https:\/\/censusev\.com\/ev\/tesla\/model-3">Tesla Model 3 for sale<\/a> on Census EV<\/p>$/);
  assert.doesNotMatch(s, /nofollow|display:\s*none|<script/);
});

test("the frame is as tall as the rows the model has", () => {
  assert.ok(embedHeight(0) < embedHeight(1));
  assert.equal(embedHeight(4) - embedHeight(3), embedHeight(2) - embedHeight(1));
  assert.match(embedSnippet(hub, 1), new RegExp(`height="${embedHeight(1)}"`));
});
