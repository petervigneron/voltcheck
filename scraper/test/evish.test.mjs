import { test } from "node:test";
import assert from "node:assert/strict";
import { evish, EVISH_RE } from "../lib/sitemap.mjs";

// The candidacy net decides what the crawl READS. A car it does not match on
// an HTML-walk or Dealer Inspire rooftop never has its page fetched, so a
// nameplate missing here is missing cars, not just ranking.
//
// Every case below is a real name or slug from feldmanchevyoflivonia.com's
// 4,814-car DealerOn lot (2026-09-05), where 27 of the 260 cars classifyEv
// calls electrified were invisible to the old hand-kept list.
const seen = [
  // The maker writes it with a space; the old entry read `pacifica-?hybrid`.
  "2023 Chrysler Pacifica Hybrid Touring L",
  "2022 BMW 5 Series 530e iPerformance",
  "2024 BrightDrop Zevo 600 EJY",
  "2025 Dodge Hornet R/T Plus EAWD",
  // Slugs, which is the other shape this predicate is handed.
  "used-2021-bmw-x3-xdrive30e-sport",
  "used-2023-volvo-xc40-recharge-plus",
  "used-2024-alfa-romeo-tonale-veloce-eawd",
  "used-2022-jeep-grand-cherokee-4xe-trailhawk",
  "used-2021-toyota-rav4-prime-xse",
];
for (const s of seen) {
  test(`the net sees ${s}`, () => assert.equal(evish(s), true));
}

// Petrol and conventional-hybrid cars the net must not spend a page on. A
// false match here costs a fetch, never a claim — but the budget is the whole
// reason the net exists.
const unseen = [
  "used-2019-toyota-camry-le",
  "used-2022-honda-cr-v-hybrid-ex",
  "used-2023-toyota-sequoia-hybrid-4wd-limited",
  "used-2020-ford-f-150-xlt-4x4",
];
for (const s of unseen) {
  test(`the net leaves ${s} unread`, () => assert.equal(evish(s), false));
}

// The Sequoia above is why the ID.4 entry now carries a \\b: unanchored,
// `id-?\\.?4` matched inside "hybrid-4wd", so every Sequoia Hybrid 4WD, F-150
// Hybrid 4x4 and Panamera E-Hybrid 4 in a sitemap ranked EV-ish and bought
// itself a fetch. lib/ev.mjs anchored the same pattern for the same reason on
// 2026-08-23; this list had not caught up.

test("everything the old list matched, the net still matches", () => {
  for (const s of ["tesla-model-3", "used-2022-ford-mustang-mach-e", "id-4-pro", "taycan-4s", "escalade-iq"]) {
    assert.equal(EVISH_RE.test(s), true, s);
    assert.equal(evish(s), true, s);
  }
});
