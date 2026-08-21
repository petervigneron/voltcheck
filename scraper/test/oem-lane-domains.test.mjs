import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { OEM_LOCATOR_DOMAINS, laneOf } from "../lib/oem-lane-domains.mjs";

// The allowlist in oem-lane-domains.mjs is hand-maintained on purpose (see its
// header) — cheap for the count-regression alarm to filter on — but "hand-
// maintained" is exactly how it could silently drift the day a new
// lib/oem/*.mjs lane ships without an update here. This test is the guard:
// it greps every OEM module's own `domain: "..."` literals and fails loudly
// if one isn't classified, rather than letting sync-guard.mjs quietly
// misclassify a brand-new lane's rows as "dealer crawl".
const OEM_DIR = new URL("../lib/oem/", import.meta.url);

test("every lib/oem/*.mjs domain literal is classified in OEM_LOCATOR_DOMAINS", async () => {
  const files = (await readdir(OEM_DIR)).filter((f) => f.endsWith(".mjs"));
  assert.ok(files.length > 0, "expected to find lib/oem/*.mjs source files");
  const found = new Set();
  for (const f of files) {
    const text = await readFile(new URL(f, OEM_DIR), "utf-8");
    for (const m of text.matchAll(/domain:\s*"([^"]+)"/g)) found.add(m[1]);
  }
  const missing = [...found].filter((d) => !OEM_LOCATOR_DOMAINS.has(d));
  assert.deepEqual(missing, [], `lib/oem/*.mjs domains not classified in OEM_LOCATOR_DOMAINS: ${missing.join(", ")}`);
});

test("laneOf classifies known OEM domains as oem and anything else as dealer", () => {
  assert.equal(laneOf("chevrolet.com"), "oem");
  assert.equal(laneOf("hyundai-cpo"), "oem");
  assert.equal(laneOf("hendrickcars.com"), "dealer");
  assert.equal(laneOf("some-new-rooftop.example"), "dealer");
});
