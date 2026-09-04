import test from "node:test";
import assert from "node:assert/strict";
import { withWall, sealReport } from "../lib/wall.mjs";

const never = () => new Promise(() => {});
const after = (ms, value) => new Promise((r) => setTimeout(() => r(value), ms));

test("work that finishes in time wins and hands back its value", async () => {
  const { finished, value } = await withWall(after(5, "done"), Date.now() + 5000);
  assert.equal(finished, true);
  assert.equal(value, "done");
});

test("a promise that never settles loses to the wall instead of hanging", async () => {
  const t0 = Date.now();
  const { finished } = await withWall(never(), Date.now() + 60);
  assert.equal(finished, false);
  assert.ok(Date.now() - t0 < 2000, "returned on the wall, not on the work");
});

test("no wall means wait — a whole-fleet run has hours and wants every domain", async () => {
  const { finished, value } = await withWall(after(5, 7), 0);
  assert.equal(finished, true);
  assert.equal(value, 7);
});

// A rejection is not a hang. crawl.mjs's worker catches a crashed domain and
// files a truncated report for it; the wall must not swallow the crash and
// leave the worker thinking the visit succeeded.
test("work that rejects before the wall still throws to the caller", async () => {
  await assert.rejects(() => withWall(Promise.reject(new Error("boom")), Date.now() + 5000), /boom/);
});

// The reason this file exists: the process has to be able to LEAVE. A
// rejection landing after the wall has nobody awaiting it, and an unhandled
// rejection exits node non-zero — which in the rolling crawl means the slice
// is marked failed and its sync step is skipped, the exact loss the wall was
// added to prevent.
test("work that rejects after the wall does not kill the process", async () => {
  const late = new Promise((_, reject) => setTimeout(() => reject(new Error("late")), 40));
  const { finished } = await withWall(late, Date.now() + 5);
  assert.equal(finished, false);
  const seen = [];
  process.on("unhandledRejection", (e) => seen.push(e));
  await after(120);
  assert.deepEqual(seen, []);
});

test("sealReport keeps the cars the abandoned visit had already found", () => {
  const report = { domain: "x.com", evs: [{ vin: "A" }], errors: [], notes: ["n"] };
  const sealed = sealReport(report, "abandoned after 500s without returning");
  assert.equal(sealed.evs.length, 1);
  assert.equal(sealed.notes[0], "n");
  assert.equal(sealed.stoppedEarly, "abandoned after 500s without returning");
});

// THE delisting guard. The abandoned call is still running and its own last
// line is `report.truncated = queue.length > 0 || Boolean(report.stoppedEarly)`
// — on a queue that happened to drain that is FALSE, and a false there tells
// db-sync the visit saw the whole lot. A visit we walked away from saw a
// fraction of it, so every car it had not reached would be delisted.
test("sealReport cannot be un-truncated by the call that lost the race", () => {
  const report = { domain: "x.com", evs: [], errors: [], notes: [] };
  const sealed = sealReport(report, "abandoned after 500s without returning");
  // …the abandoned visit runs on and finishes its own bookkeeping:
  report.truncated = false;
  report.evs.push({ vin: "LATE" });
  report.notes.push("later");
  assert.equal(sealed.truncated, true);
  assert.equal(sealed.evs.length, 0);
  assert.equal(sealed.notes.length, 0);
});

// A visit that named its own reason keeps it: "8-minute per-domain cap after
// 40 pages" says more than "abandoned", and both mean truncated.
test("sealReport does not overwrite a reason the visit gave itself", () => {
  const report = { domain: "x.com", evs: [], errors: [], notes: [], stoppedEarly: "8-minute per-domain cap after 40 pages" };
  assert.equal(sealReport(report, "abandoned").stoppedEarly, "8-minute per-domain cap after 40 pages");
});
