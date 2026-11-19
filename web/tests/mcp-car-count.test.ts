// lib/mcp/carCount.ts: which cars a connector call is about, and that only an
// assistant acting for a person is counted. fetch is stubbed; nothing leaves
// the process.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calledCars, countCalledCars } from "../lib/mcp/carCount";

const A = "KNDC3DLC3N5088652";
const B = "5YJ3E1EA5RF824810";
const call = (name: string, args: unknown) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

test("get_listing and compare_listings name their cars; nothing else does", () => {
  assert.deepEqual(calledCars(call("get_listing", { vin: A.toLowerCase() })), [A]);
  assert.deepEqual(calledCars(call("compare_listings", { vins: [A, B, A] })), [A, B]);
  assert.deepEqual(calledCars([call("get_listing", { vin: A }), call("get_listing", { vin: B })]), [A, B]);
  for (const body of [
    call("search_listings", { make: "kia", vin: A }),
    call("battery_warranty", { vin: A }),
    call("get_listing", { vin: "NOTAVIN" }),
    call("get_listing", { vin: 12345678901234567 }),
    call("get_listing", {}),
    call("compare_listings", { vins: A }),
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    { method: "tools/call" },
    null,
    "x",
  ])
    assert.deepEqual(calledCars(body), [], JSON.stringify(body));
});

test("one request never asks for more than five counts", () => {
  const vins = Array.from({ length: 9 }, (_, i) => `KNDC3DLC8P510000${i}`);
  assert.equal(calledCars(vins.map((vin) => call("get_listing", { vin }))).length, 5);
});

async function counted(ua: string | null, body: unknown): Promise<string[]> {
  const realFetch = globalThis.fetch;
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY };
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_ANON_KEY = "anon";
  const calls: string[] = [];
  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    calls.push(`${String(url).replace("https://db.example/rest/v1/rpc/", "")} ${init?.body}`);
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    await countCalledCars(ua, body);
    return calls;
  } finally {
    globalThis.fetch = realFetch;
    if (saved.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = saved.key;
  }
}

test("an assistant acting for a person is counted, by its label and the car", async () => {
  assert.deepEqual(await counted("Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)", call("get_listing", { vin: A })), [
    `agent_car_fetch_bump ${JSON.stringify({ _agent: "claude-user", _vin: A })}`,
  ]);
});

test("a crawler, a script and a caller with no user-agent are not", async () => {
  for (const ua of ["Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "python-httpx/0.27", "claude-code/2.1", null])
    assert.deepEqual(await counted(ua, call("get_listing", { vin: A })), [], String(ua));
});

test("a database that does not answer never reaches the caller", async () => {
  const realFetch = globalThis.fetch;
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_ANON_KEY = "anon";
  globalThis.fetch = (async () => {
    throw new Error("down");
  }) as typeof fetch;
  try {
    await assert.doesNotReject(countCalledCars("Mozilla/5.0 (compatible; Claude-User/1.0)", call("get_listing", { vin: A })));
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
  }
});
