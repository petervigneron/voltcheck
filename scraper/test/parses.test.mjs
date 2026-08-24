import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Every top-level script and lib module must at least PARSE. This exists
// because a merge left crawl.mjs with an unbalanced block and the suite
// stayed green (2026-08-24): nothing imports the entry-point scripts, so a
// syntax error in one is invisible to every behavioural test and only
// surfaces when the nightly actually runs it. `node --check` is the whole
// test — cheap, and it catches exactly the class of damage a bad merge does.
const root = fileURLToPath(new URL("..", import.meta.url));
const files = [];
for (const dir of ["", "lib/", "lib/platforms/", "lib/oem/"]) {
  for (const f of readdirSync(root + dir)) {
    if (f.endsWith(".mjs")) files.push(dir + f);
  }
}
test(`every .mjs parses (${files.length} files)`, () => {
  for (const f of files) {
    try {
      execFileSync(process.execPath, ["--check", root + f], { stdio: "pipe" });
    } catch (e) {
      assert.fail(`${f} does not parse:\n${e.stderr}`);
    }
  }
});
