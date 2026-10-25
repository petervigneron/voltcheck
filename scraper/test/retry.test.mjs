// node --test scraper/test/retry.test.mjs
//
// fetchWithRetry's `fatal` predicate: a 500 that names a statement_timeout
// (Postgres 57014) is answered once and not retried. Before 2026-10-25 the
// helper re-ran such a call four times, 30/120/240 s apart, and two outgrown
// materialized views cost refresh-variants.mjs ~54 minutes a night.
import test from "node:test";
import assert from "node:assert/strict";
import { fetchWithRetry } from "../lib/retry.mjs";

const timeoutBody = '{"code":"57014","details":null,"hint":null,"message":"canceling statement due to statement timeout"}';
const res = (status, body) => ({ ok: status < 400, status, text: async () => body });

test("a statement_timeout 500 is not retried when the caller calls it fatal", async () => {
  let calls = 0;
  const out = await fetchWithRetry(
    "t",
    async () => (calls++, res(500, timeoutBody)),
    { waits: [0, 0, 0], fatal: (_r, body) => /"code"\s*:\s*"57014"/.test(body) }
  );
  assert.equal(calls, 1);
  assert.equal(out.status, 500);
  // The body is still readable by the caller after the predicate consumed it.
  assert.equal(await out.text(), timeoutBody);
});

test("a 500 the predicate does not recognise is still retried", async () => {
  let calls = 0;
  const out = await fetchWithRetry(
    "t",
    async () => (calls++, calls < 3 ? res(503, "upstream down") : res(200, "ok")),
    { waits: [0, 0, 0], fatal: (_r, body) => /57014/.test(body) }
  );
  assert.equal(calls, 3);
  assert.equal(out.ok, true);
});

test("without a predicate the schedule is unchanged", async () => {
  let calls = 0;
  await fetchWithRetry("t", async () => (calls++, res(500, timeoutBody)), { waits: [0, 0] });
  assert.equal(calls, 3);
});
