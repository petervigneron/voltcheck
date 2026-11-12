// lib/mcp/tools.ts: what the three tools tell an agent about themselves.
// Agents choose a tool and fill its arguments from these strings alone, and
// directories refuse a server whose tools carry no read-only or destructive
// hint, so an argument added without a description is a regression.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS } from "../lib/mcp/tools";

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
