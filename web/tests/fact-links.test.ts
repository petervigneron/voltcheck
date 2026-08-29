// From web/:
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        --test tests/fact-links.test.ts
//
// lib/facts/links.ts is a hand-kept mirror of registry.ts — one row per model
// instead of one entry per sheet, so Browse.tsx can bundle it without the
// registry's ~70KB of FAQ prose. A mirror can drift, and drift here has a
// specific cost: a sheet published without a link from the listing pages gets
// no internal traffic and no crawl path but the sitemap, which is the exact
// problem the links exist to fix. So the pin runs both directions.
import test from "node:test";
import assert from "node:assert/strict";
import { FACT_SHEETS } from "@/lib/facts/registry";
import { FACT_LINK_MODELS, factLinksFor } from "@/lib/facts/links";

const registryPaths = new Set(FACT_SHEETS.map((s) => `/facts/${s.make}/${s.model}/${s.topic}`));
const linkPaths = new Set(
  FACT_LINK_MODELS.flatMap((m) => m.topics.map((t) => `/facts/${m.make}/${m.model}/${t}`))
);

test("every link points at a sheet the registry publishes", () => {
  for (const p of linkPaths) assert.ok(registryPaths.has(p), `links.ts offers ${p}, registry has no such sheet`);
});

test("every published sheet has a link row — a new sheet must be wired in here", () => {
  for (const p of registryPaths) assert.ok(linkPaths.has(p), `registry publishes ${p}, links.ts never links it`);
});

test("every model's links carry a label and its own path", () => {
  for (const m of FACT_LINK_MODELS) {
    const links = factLinksFor(m.make, m.keys[0]!);
    assert.equal(links.length, m.topics.length);
    for (const l of links) {
      assert.match(l.path, /^\/facts\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/);
      assert.ok(l.label.endsWith("?"), `label "${l.label}" is not a question`);
    }
  }
});

test("feed spellings reach their sheets through the modelKey fold", () => {
  // Casing and punctuation as the feeds actually type them.
  assert.equal(factLinksFor("Tesla", "Model Y").length, 3);
  assert.equal(factLinksFor("TESLA", "MODEL 3").length, 3);
  assert.equal(factLinksFor("Volkswagen", "ID.4").length, 2);
  assert.equal(factLinksFor("Volkswagen", "ID. Buzz").length, 2);
  assert.equal(factLinksFor("Ford", "Mustang Mach-E").length, 2);
  assert.equal(factLinksFor("Ford", "F-150 Lightning").length, 2);
  assert.equal(factLinksFor("Hyundai", "IONIQ 5").length, 3);
  // Both nameplates on the shared Bolt sheet.
  assert.equal(factLinksFor("Chevrolet", "Bolt EV").length, 2);
  assert.equal(factLinksFor("Chevrolet", "Bolt EUV").length, 2);
});

test("no prefix matching: a different car sharing the nameplate's start gets nothing", () => {
  // The $67k performance N is not the car the Ioniq 5 sheets describe.
  assert.deepEqual(factLinksFor("Hyundai", "Ioniq 5 N"), []);
  // Trim-in-the-model-field rows stay unlinked rather than half-matched.
  assert.deepEqual(factLinksFor("Tesla", "Model Y Long Range"), []);
  assert.deepEqual(factLinksFor("Toyota", "bZ4X"), []);
});
