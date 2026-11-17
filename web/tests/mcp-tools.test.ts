// lib/mcp/tools.ts: what the five tools tell an agent about themselves.
// Agents choose a tool and fill its arguments from these strings alone, and
// directories refuse a server whose tools carry no read-only or destructive
// hint, so an argument added without a description is a regression.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, MCP_REF, labelled, goLink } from "../lib/mcp/tools";
import { visitSrc } from "../lib/visit";

test("every tool has a title and says it only reads", () => {
  assert.deepEqual(TOOLS.map((t) => t.name), ["search_listings", "get_listing", "list_models", "battery_warranty", "market_snapshot"]);
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

test("a connector result's links carry the label the visit report reads, and the seller link goes through /go", () => {
  const rec = {
    url: "https://censusev.com/listing/kndc3dlc8p5104606",
    seller: { type: "dealer", name: "Example Kia", domain: "dealer.example", url: "https://dealer.example/car?id=1" },
    vin: "KNDC3DLC8P5104606",
  };
  const out = labelled(rec);
  assert.equal(out.url, `https://censusev.com/listing/kndc3dlc8p5104606?ref=${MCP_REF}`);
  // What the page will record for that visit.
  assert.equal(visitSrc(new URL(out.url).search), MCP_REF);
  // The seller link counts the click and forwards; where it ends stays visible.
  assert.equal(out.seller.url, "https://censusev.com/go/kndc3dlc8p5104606?ref=mcp");
  assert.equal(out.seller.url, goLink(rec.vin));
  assert.equal(out.seller.name, "Example Kia");
  assert.equal(out.seller.domain, "dealer.example");
  assert.equal(rec.url, "https://censusev.com/listing/kndc3dlc8p5104606", "the input record is not mutated");
  assert.equal(rec.seller.url, "https://dealer.example/car?id=1", "the input seller is not mutated");
  // No seller URL, no link: /go would only 404.
  const noSeller = labelled({ vin: "KNDC3DLC8P5104606", seller: { type: "dealer", name: "X" } });
  assert.deepEqual(noSeller.seller, { type: "dealer", name: "X" });
  // No url, or one that already has a query, is left alone.
  const bare: { url?: string; vin: string } = { vin: "X" };
  assert.deepEqual(labelled(bare), { vin: "X" });
  assert.equal(labelled({ url: "https://censusev.com/x?a=1" }).url, "https://censusev.com/x?a=1");
});

// Claude's connector directory: every tool carries a title and a read-only
// hint, and a description says what the tool returns, never what to call
// next or how a model should behave (that lives in INSTRUCTIONS). The phrase
// list is a crude guard, not a parser: it catches the shapes instructions
// crept in as before ("Use it ... before searching").
test("directory rule: titles, read-only hints, and no instructions in any description", () => {
  const banned = ["use it", "call ", "before ", "then "];
  for (const t of TOOLS) {
    assert.ok(t.title, `${t.name} has no title`);
    assert.equal(t.annotations?.readOnlyHint, true, `${t.name}`);
    const props = (t.inputSchema as { properties?: Record<string, { description?: string }> }).properties ?? {};
    const texts = [t.description, ...Object.values(props).map((p) => p.description ?? "")];
    for (const text of texts) {
      for (const b of banned) assert.ok(!text.toLowerCase().includes(b), `${t.name}: "${b.trim()}" in: ${text}`);
    }
  }
});
