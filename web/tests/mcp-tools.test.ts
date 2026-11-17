// lib/mcp/tools.ts: what the three tools tell an agent about themselves.
// Agents choose a tool and fill its arguments from these strings alone, and
// directories refuse a server whose tools carry no read-only or destructive
// hint, so an argument added without a description is a regression.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, MCP_REF, labelled } from "../lib/mcp/tools";
import { visitSrc } from "../lib/visit";

test("every tool has a title and says it only reads", () => {
  assert.equal(TOOLS.length, 3);
  for (const t of TOOLS) {
    assert.ok(t.title && t.title.length > 3, `${t.name} has no title`);
    assert.equal(t.annotations?.readOnlyHint, true, `${t.name} does not say it is read-only`);
    assert.equal(t.annotations?.destructiveHint, false, `${t.name}`);
  }
});

test("every argument of every tool is described", () => {
  for (const t of TOOLS) {
    const props = (t.inputSchema as { properties?: Record<string, { description?: string }> }).properties ?? {};
    for (const [arg, spec] of Object.entries(props)) {
      assert.ok(spec.description && spec.description.length > 8, `${t.name}.${arg} has no description`);
    }
  }
});

test("a connector result's Census link carries the label the visit report reads, and nothing else is touched", () => {
  const rec = { url: "https://censusev.com/listing/kndc3dlc8p5104606", seller: { url: "https://dealer.example/car?id=1" }, vin: "X" };
  const out = labelled(rec);
  assert.equal(out.url, `https://censusev.com/listing/kndc3dlc8p5104606?ref=${MCP_REF}`);
  // What the page will record for that visit.
  assert.equal(visitSrc(new URL(out.url).search), MCP_REF);
  // The dealer's own link is the dealer's.
  assert.deepEqual(out.seller, rec.seller);
  assert.equal(rec.url, "https://censusev.com/listing/kndc3dlc8p5104606", "the input record is not mutated");
  // No url, or one that already has a query, is left alone.
  const bare: { url?: string; vin: string } = { vin: "X" };
  assert.deepEqual(labelled(bare), { vin: "X" });
  assert.equal(labelled({ url: "https://censusev.com/x?a=1" }).url, "https://censusev.com/x?a=1");
});
