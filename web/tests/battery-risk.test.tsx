// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/battery-risk.test.tsx
//
// The point of most of these is what does NOT render. A cohort NHTSA could
// not place must produce no markup at all — not an empty state, not a
// "no data" line, and above all not a zero.
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { selectBatteryRisk, type BatteryTable } from "@/lib/nhtsa/battery";
import { BatteryRisk } from "@/components/BatteryRisk";

const VIN = "3FMTK3R76PM000001";

const TABLE: BatteryTable = {
  "FORD|MUSTANG MACH-E|2023": {
    resolved: ["MUSTANG MACH-E BEV"],
    complaintsTotal: 115,
    complaintsBattery: 11,
    complaintsPack: 11,
    fires: 1,
    recallsTotal: 5,
    recallsBattery: [
      {
        campaign: "22V412000",
        component: "ELECTRICAL SYSTEM:PROPULSION SYSTEM:TRACTION BATTERY:MANAGEMENT SYSTEM/ENERGY CONTROL MODULE (BMS/BECM):SOFTWARE",
      },
    ],
    fetchedAt: "2026-08-17",
  },
  // The name NHTSA does not know. complaintsByVehicle would answer this one
  // with HTTP 200 and an empty list, which is why it is not a zero row.
  "VOLVO|C40 RECHARGE PURE ELECTRIC|2023": { resolved: null, fetchedAt: "2026-08-17" },
  // Resolved, read, and genuinely clean.
  "NISSAN|ARIYA|2024": {
    resolved: ["ARIYA"],
    complaintsTotal: 6,
    complaintsBattery: 0,
    complaintsPack: 0,
    fires: 0,
    recallsTotal: 0,
    recallsBattery: [],
    fetchedAt: "2026-08-17",
  },
  // Resolved but the read failed halfway. Missing is not zero.
  "KIA|EV6|2023": { resolved: ["EV6"], fetchedAt: "2026-08-17", error: "complaints HTTP 504" },
};

test("a cohort NHTSA could not place selects to nothing", () => {
  assert.equal(selectBatteryRisk(TABLE, "Volvo", "C40 Recharge Pure Electric", 2023), null);
});

test("a cohort the refresh has never seen selects to nothing", () => {
  assert.equal(selectBatteryRisk(TABLE, "Rivian", "R1T", 2023), null);
  assert.equal(selectBatteryRisk(undefined, "Ford", "Mustang Mach-E", 2023), null);
});

test("a failed read selects to nothing rather than to zero", () => {
  assert.equal(selectBatteryRisk(TABLE, "Kia", "EV6", 2023), null);
});

test("the key folds the capitalisation dealers disagree about", () => {
  assert.ok(selectBatteryRisk(TABLE, "nissan", "ariya", 2024));
  assert.ok(selectBatteryRisk(TABLE, "NISSAN", "ARIYA", 2024));
});

test("the panel is absent when the data is absent", () => {
  assert.equal(renderToStaticMarkup(<BatteryRisk data={null} vin={VIN} />), "");
  const unresolved = selectBatteryRisk(TABLE, "Volvo", "C40 Recharge Pure Electric", 2023);
  assert.equal(renderToStaticMarkup(<BatteryRisk data={unresolved} vin={VIN} />), "");
});

test("a battery recall renders as one line: campaign number and component", () => {
  const data = selectBatteryRisk(TABLE, "Ford", "Mustang Mach-E", 2023);
  assert.ok(data);
  const html = renderToStaticMarkup(<BatteryRisk data={data} vin={VIN} />);
  assert.ok(html.includes("22V412000"), html);
  assert.ok(html.includes("TRACTION BATTERY"), html);
  assert.ok(html.includes("11 (11 pack-level)"), html);
  // The count is our classification of NHTSA's rows, so it wears the site's
  // aggregate qualifier (components/SourceBadge.tsx), which reads "est.".
  assert.ok(html.includes("est."), html);
  // The VIN is the shopper's own answer, and NHTSA gives it per VIN.
  assert.ok(html.includes(`nhtsa.gov/recalls?vin=${VIN}`), html);
});

test("nothing on the panel reads as a rating", () => {
  const data = selectBatteryRisk(TABLE, "Ford", "Mustang Mach-E", 2023);
  const html = renderToStaticMarkup(<BatteryRisk data={data!} vin={VIN} />);
  // No severity colour, no comparison, no advice — the palette words that
  // carry meaning elsewhere on the site (vermilion = something absent,
  // saffron = outlier) must not appear here.
  for (const word of ["vermilion", "saffron", "text-red", "bg-red", "worse", "than average", "should"]) {
    assert.ok(!html.includes(word), `${word} in ${html}`);
  }
});

test("a clean cohort states its zero and stays quiet about recalls", () => {
  const data = selectBatteryRisk(TABLE, "Nissan", "Ariya", 2024);
  assert.ok(data);
  const html = renderToStaticMarkup(<BatteryRisk data={data} vin={VIN} />);
  assert.ok(html.includes("0 (0 pack-level)"), html);
  // "No recalls" is a claim we cannot make: NHTSA answers an unknown model
  // name with the same empty result it uses for a clean one.
  assert.ok(!/no recalls/i.test(html), html);
});
