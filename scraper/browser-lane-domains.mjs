#!/usr/bin/env node
// Print the rooftops one browser-crawl job should visit, space-separated.
//
//   node browser-lane-domains.mjs [--part I --parts N] [--limit K] [--key KEY]
//                                 [--platforms porsche]
//
// The list is registry/registry.json's working rooftops on the browser lanes
// a HOSTED runner owns (lib/browser-lane-domains.mjs — porsche is not one of
// them; its wall is keyed on the caller's address and it is crawled by
// porsche-crawl.yml from a residential runner, so ask for it by name with
// --platforms porsche), rotated for this run (--key, default the current
// half-day) and cut into --parts interleaved parts; --limit keeps the first K
// of the rotated list BEFORE cutting, which is how a trial run reads the same
// K rooftops whatever --parts it uses.
import { readFile } from "node:fs/promises";
import { browserLaneDomains, rotateForRun, partOf, runKey, BROWSER_LANE_PLATFORMS } from "./lib/browser-lane-domains.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const part = Number(flag("--part", 0));
const parts = Number(flag("--parts", 1));
const limit = Number(flag("--limit", 0));
const keyArg = flag("--key", "");
const platforms = String(flag("--platforms", BROWSER_LANE_PLATFORMS.join(","))).split(",").map((s) => s.trim()).filter(Boolean);

const registry = JSON.parse(await readFile(new URL("./registry/registry.json", import.meta.url), "utf-8"));
const all = browserLaneDomains(registry, { platforms });
const key = keyArg === "" ? runKey() : Number(keyArg);
let list = rotateForRun(all, key);
if (limit > 0) list = list.slice(0, limit);
const mine = partOf(list, part, parts);
console.error(`browser-lane-domains: ${all.length} rooftops (${platforms.join(", ")}), key ${key}, ${limit > 0 ? `first ${limit}, ` : ""}part ${part}/${parts}: ${mine.length}`);
console.log(mine.join(" "));
