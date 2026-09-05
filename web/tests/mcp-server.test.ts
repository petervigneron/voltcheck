// The MCP transport (lib/mcp/server.ts): initialize, tools/list, tools/call,
// notifications, batches, and the errors, driven with plain JSON-RPC.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMcpServer, PROTOCOL_VERSION } from "../lib/mcp/server.ts";

const server = createMcpServer({
  name: "t",
  version: "0.0.1",
  instructions: "hi",
  tools: [
    { name: "echo", description: "echoes", inputSchema: { type: "object" }, handler: async (a) => ({ got: a }) },
    { name: "boom", description: "fails", inputSchema: { type: "object" }, handler: async () => { throw new Error("bad args"); } },
  ],
});

test("initialize negotiates a version it supports and falls back to its own", async () => {
  const r = await server.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } });
  assert.equal(r.status, 200);
  const body = r.body as { result: { protocolVersion: string; capabilities: unknown; serverInfo: { name: string }; instructions: string } };
  assert.equal(body.result.protocolVersion, "2025-03-26");
  assert.equal(body.result.serverInfo.name, "t");
  assert.equal(body.result.instructions, "hi");
  const r2 = await server.handle({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } });
  assert.equal((r2.body as { result: { protocolVersion: string } }).result.protocolVersion, PROTOCOL_VERSION);
});

test("a notification is accepted with no body; tools/list and tools/call answer", async () => {
  assert.deepEqual(await server.handle({ jsonrpc: "2.0", method: "notifications/initialized" }), { status: 202 });
  const list = await server.handle({ jsonrpc: "2.0", id: "x", method: "tools/list" });
  assert.deepEqual((list.body as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name), ["echo", "boom"]);
  const call = await server.handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "echo", arguments: { a: 1 } } });
  const res = (call.body as { result: { content: { type: string; text: string }[]; structuredContent: unknown; isError: boolean } }).result;
  assert.equal(res.isError, false);
  assert.deepEqual(res.structuredContent, { got: { a: 1 } });
  assert.deepEqual(JSON.parse(res.content[0].text), { got: { a: 1 } });
});

test("a tool that throws is a tool error the model can read, not a protocol error", async () => {
  const call = await server.handle({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "boom", arguments: {} } });
  const res = (call.body as { result: { content: { text: string }[]; isError: boolean } }).result;
  assert.equal(res.isError, true);
  assert.equal(res.content[0].text, "bad args");
  const unknown = await server.handle({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "nope" } });
  assert.equal((unknown.body as { error: { code: number } }).error.code, -32602);
  const method = await server.handle({ jsonrpc: "2.0", id: 6, method: "resources/list" });
  assert.equal((method.body as { error: { code: number } }).error.code, -32601);
});

test("batches and garbage", async () => {
  const b = await server.handle([
    { jsonrpc: "2.0", id: 1, method: "ping" },
    { jsonrpc: "2.0", method: "notifications/initialized" },
  ]);
  assert.equal(b.status, 200);
  assert.deepEqual(b.body, [{ jsonrpc: "2.0", id: 1, result: {} }]);
  assert.equal((await server.handle([{ jsonrpc: "2.0", method: "notifications/x" }])).status, 202);
  assert.equal((await server.handle({ hello: "world" })).status, 400);
  assert.equal((await server.handle([])).status, 400);
});
