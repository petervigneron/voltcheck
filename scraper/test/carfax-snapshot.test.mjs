import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSnapshot, snapshotKeyFromHtml, isSnapshotKey, needsSnapshot, snapshotUrl } from "../lib/carfax-snapshot.mjs";

// victoryfordkc.com's 2024 F-150 Lightning Flash 1FT6W3L70RWG19114, as
// snapshot.carfax.com answered on 2026-09-07 — the car the owner found on
// the Carfax and nowhere on the site.
const buyback = JSON.parse(readFileSync(new URL("./fixtures/carfax-snapshot-buyback.json", import.meta.url), "utf8"));
const KEY = "YyRRQrkqw6sWuMy8sOpfA9N8jI8LEtPxawkbpSPcptAaSjhQ_VV2uAGK0JxvRlseS12HYLUNz9xH-rBvYUKtu5jMEuKULuBhLZ4";

test("the title brand comes off the snapshot's own row and nothing else is kept", () => {
  const { titleBrand, rows } = parseSnapshot(buyback);
  assert.equal(titleBrand, "Buyback/Lemon");
  // The other rows are Carfax claims this site has no footing for; the
  // parser exposes them for tests and the lane stores none of them.
  assert.equal(rows.length, 6);
  assert.match(rows[1], /No Accidents/);
});

test("a clean snapshot has no title brand, and that asserts nothing", () => {
  const clean = { snapshotReportHtml: buyback.snapshotReportHtml.replace(/<div class="history-row row5">[\s\S]*?<\/div>\s*<\/div>/, "") };
  const { titleBrand, rows } = parseSnapshot(clean);
  assert.equal(titleBrand, undefined);
  assert.equal(rows.length, 5);
  assert.equal(parseSnapshot({}).titleBrand, undefined);
  assert.equal(parseSnapshot(null).titleBrand, undefined);
});

test("a buyback that Carfax states as its own row, not under Branded Title, is read", () => {
  // victoryfordkc.com 1FTVW3L70RWG09842, 2026-09-09: no "Branded Title:" row;
  // the panel's first row reads "Reacquired by Manufacturer". The first cut of
  // the parser cached this car as clean.
  const html = buyback.snapshotReportHtml.replace("Branded Title: Buyback/Lemon", "Reacquired by Manufacturer");
  assert.equal(parseSnapshot({ snapshotReportHtml: html }).titleBrand, "Reacquired by Manufacturer");
  const lemon = buyback.snapshotReportHtml.replace("Branded Title: Buyback/Lemon", "Lemon Law Buyback Reported");
  assert.equal(parseSnapshot({ snapshotReportHtml: lemon }).titleBrand, "Lemon Law Buyback Reported");
  const salvage = buyback.snapshotReportHtml.replace("Branded Title: Buyback/Lemon", "Salvage Title Reported");
  assert.equal(parseSnapshot({ snapshotReportHtml: salvage }).titleBrand, "Salvage Title Reported");
  // The other rows never become the fact, however they are worded.
  const none = buyback.snapshotReportHtml.replace("Branded Title: Buyback/Lemon", "CARFAX 1-Owner Vehicle");
  assert.equal(parseSnapshot({ snapshotReportHtml: none }).titleBrand, undefined);
});

test("other brands come through as their own words", () => {
  const salvage = { snapshotReportHtml: buyback.snapshotReportHtml.replace("Branded Title: Buyback/Lemon", "Branded Title: Salvage") };
  assert.equal(parseSnapshot(salvage).titleBrand, "Salvage");
});

test("a key is read off a page that publishes one, and off nothing else", () => {
  assert.equal(snapshotKeyFromHtml(`var cfx = {"snapshotkey":"${KEY}","partner":"TMO_0"};`), KEY);
  assert.equal(snapshotKeyFromHtml('<a href="https://www.carfax.com/vehiclehistory/ar20/abc">report</a>'), undefined);
  assert.equal(snapshotKeyFromHtml("snapshotkey: 'short'"), undefined);
  assert.equal(isSnapshotKey(KEY), true);
  assert.equal(isSnapshotKey("1FT6W3L70RWG19114"), false);
  assert.equal(snapshotUrl(KEY), `https://snapshot.carfax.com/partnerReportCarfaxConnect?snapshotkey=${KEY}`);
});

test("only a used car whose seller published a key is asked, and not twice inside the window", () => {
  const truck = { vin: "1FT6W3L70RWG19114", sourceUrl: "https://www.victoryfordkc.com/viewdetails/used/1FT6W3L70RWG19114/2024-Ford-F-150-Lightning-Flash", carfaxSnapshotKey: KEY };
  assert.equal(needsSnapshot(truck, { refreshCutoff: "2026-07-24" }), true);
  assert.equal(needsSnapshot({ ...truck, carfaxSnapshotKey: undefined }, { refreshCutoff: "2026-07-24" }), false);
  assert.equal(needsSnapshot({ ...truck, sourceUrl: truck.sourceUrl.replace("/used/", "/new/") }, { refreshCutoff: "2026-07-24" }), false);
  assert.equal(needsSnapshot(truck, { refreshCutoff: "2026-07-24", cached: { brand: null, checkedAt: "2026-09-01" } }), false);
  assert.equal(needsSnapshot(truck, { refreshCutoff: "2026-07-24", cached: { brand: "Buyback/Lemon", checkedAt: "2026-06-01" } }), true);
});
