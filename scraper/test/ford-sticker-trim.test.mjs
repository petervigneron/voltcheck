import test from "node:test";
import assert from "node:assert/strict";
import { stickerTrim, contradicts, applyFordStickerTrims } from "../lib/ford-sticker-trim.mjs";

// pdftotext -layout output from Ford's own window sticker for
// 1FT6W1EV8NWG06203, the 2022 F-150 Lightning a dealer fed to Ford Blue
// Advantage as an "XLT". The  is verbatim: the label's font maps its
// bullet to that control character, which is why a first cut of this parser
// found every Equipment Group code and not one series name.
const PRO_110A = [
  "EQUIPMENT GROUP 110A                                        PRICE INFORMATION",
  "PRO SERIES                                             BASE PRICE          $39,974.00",
  "                                                            TOTAL OPTIONS/OTHER  10,485.00",
].join("\n");

const FLASH_312A = [
  "EQUIPMENT GROUP 312A                                        PRICE INFORMATION",
  "FLASH                                                   BASE PRICE          $69,995.00",
].join("\n");

test("reads the equipment group and the series bulleted under it", () => {
  assert.deepEqual(stickerTrim(PRO_110A), { group: "110A", series: "PRO SERIES" });
  assert.deepEqual(stickerTrim(FLASH_312A), { group: "312A", series: "FLASH" });
});

test("a label with no equipment group is no answer, not agreement", () => {
  assert.equal(stickerTrim("Please check back later. The window sticker has not yet been released"), null);
  assert.equal(stickerTrim(""), null);
  // Code found, name unreadable: series null, so nothing downstream fires.
  const only = stickerTrim("EQUIPMENT GROUP 110A\n   TOTAL OPTIONS/OTHER   10,485.00\n\n\n\n");
  assert.equal(only.group, "110A");
  assert.equal(only.series, null);
});

test("the contradiction is the version, not the padding a feed adds to it", () => {
  // The reported truck.
  assert.equal(contradicts("XLT", "PRO SERIES"), true);
  assert.equal(contradicts("Lariat", "PLATINUM LIGHTNING SERIES"), true);
  assert.equal(contradicts("XLT", "FLASH"), true);
  // Same version, written differently — none of these is a disagreement.
  assert.equal(contradicts("Pro", "PRO SERIES"), false);
  assert.equal(contradicts("Flash™", "FLASH"), false);
  assert.equal(contradicts("XLT SuperCrew 5.5' Box", "XLT"), false);
  assert.equal(contradicts("Lariat", "LARIAT LIGHTNING SERIES"), false);
  // Nothing on either side is not evidence of anything.
  assert.equal(contradicts("", "FLASH"), false);
  assert.equal(contradicts("XLT", ""), false);
  assert.equal(contradicts("XLT", null), false);
});

test("suppresses the contradicted trim and leaves everything else alone", () => {
  const listings = [
    { vin: "1FT6W1EV8NWG06203", trim: "XLT" }, // contradicted -> refuted
    { vin: "1FT6W1EV4PWG45034", trim: "Pro" }, // agrees -> untouched
    { vin: "1FT6W3LU0SWG14667", trim: "Flash" }, // agrees -> untouched
    { vin: "1FT6W1EV1PWG50563", trim: "" }, // claims nothing -> nothing to contradict
    { vin: "5YJ3E1EA7KF000001", trim: "Long Range" }, // not in the cache at all
  ];
  const byVin = new Map([
    ["1FT6W1EV8NWG06203", "PRO SERIES"],
    ["1FT6W1EV4PWG45034", "PRO SERIES"],
    ["1FT6W3LU0SWG14667", "FLASH"],
    ["1FT6W1EV1PWG50563", "LARIAT"],
  ]);
  assert.equal(applyFordStickerTrims(listings, byVin), 1);
  assert.deepEqual(
    listings.map((l) => l.trimRefuted),
    [true, undefined, undefined, undefined, undefined],
  );
  // Every trim is left exactly as the feed gave it: this suppresses, it never
  // substitutes. web/lib/listings/trimClaim.ts decides what to print.
  assert.deepEqual(
    listings.map((l) => l.trim),
    ["XLT", "Pro", "Flash", "", "Long Range"],
  );
});

test("the description detector's own flag is a separate slot, untouched", () => {
  const listings = [{ vin: "1FT6W1EV7PWG27174", trim: "XLT", trimSuspect: "Platinum" }];
  applyFordStickerTrims(listings, new Map([["1FT6W1EV7PWG27174", "PLATINUM"]]));
  assert.equal(listings[0].trimSuspect, "Platinum");
});

test("a feed that corrects itself clears the flag on the next sync", () => {
  const listings = [{ vin: "1FT6W1EV8NWG06203", trim: "Pro", trimRefuted: true }];
  assert.equal(applyFordStickerTrims(listings, new Map([["1FT6W1EV8NWG06203", "PRO SERIES"]])), 0);
  assert.equal("trimRefuted" in listings[0], false);
});

test("an empty or missing cache changes nothing", () => {
  const listings = [{ vin: "1FT6W1EV8NWG06203", trim: "XLT" }];
  assert.equal(applyFordStickerTrims(listings, new Map()), 0);
  assert.equal(applyFordStickerTrims(listings, undefined), 0);
  assert.equal(listings[0].trimRefuted, undefined);
});
