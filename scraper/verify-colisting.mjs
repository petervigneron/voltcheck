#!/usr/bin/env node
// Verify that merge-shards.mjs records co-listing evidence and that adding it
// did not disturb the dedupe. Run: node verify-colisting.mjs
//
// Follows verify-price-fix.mjs's pattern — a standalone script that runs the
// real shipped code path and prints what it got — but against fixture shards
// rather than a live dealer page, because the thing under test is what
// happens when two shards disagree, and that cannot be arranged on the web.
//
// merge-shards.mjs resolves BOTH its input and its output from import.meta.url,
// so running it in place would overwrite scraper/out/listings.json and
// out/report.json — and db-sync reads out/report.json to decide which domains
// may delist. Feeding that file fixture data would be a genuinely dangerous
// test. So the script is copied into a scratch directory with lib/ symlinked
// beside it and run there: the bytes under test are the shipped ones, and the
// real out/ is never opened.
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const here = fileURLToPath(new URL(".", import.meta.url));

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// A listing shaped like normalize.mjs's output, with only the fields the
// merge reads. `rich` drives richness(): mileage + trim + description +
// images + fromVdp, exactly the inputs lib/normalize.mjs scores.
function listing(vin, dealerDomain, priceUsd, rich = false) {
  return {
    vin,
    dealerDomain,
    priceUsd,
    sourceUrl: `https://${dealerDomain}/inventory/${vin}`,
    ...(rich
      ? { mileage: 12000, trim: "Long Range", description: "one owner", images: ["a", "b"], fromVdp: true }
      : {}),
  };
}

async function merge(shards, label) {
  const dir = await mkdtemp(join(tmpdir(), "voltcheck-colisting-"));
  await cp(join(here, "merge-shards.mjs"), join(dir, "merge-shards.mjs"));
  await symlink(join(here, "lib"), join(dir, "lib"), "dir");
  for (const [name, { listings, report }] of Object.entries(shards)) {
    await mkdir(join(dir, "out", "shards", name), { recursive: true });
    await writeFile(join(dir, "out", "shards", name, "listings.json"), JSON.stringify(listings));
    await writeFile(join(dir, "out", "shards", name, "report.json"), JSON.stringify(report));
  }
  const { stderr } = await run(process.execPath, [join(dir, "merge-shards.mjs")]);
  console.log(`\n[${label}]`);
  for (const line of stderr.trim().split("\n")) console.log(`  > ${line}`);
  const read = async (f) => JSON.parse(await readFile(join(dir, "out", f), "utf-8"));
  const out = { colisting: await read("colisting-pairs.json"), listings: await read("listings.json") };
  await rm(dir, { recursive: true, force: true });
  return out;
}

const CO = "5YJ3E1EA0PF000001"; // co-listed across two rooftops
const SOLO = "5YJ3E1EA0PF000002"; // one rooftop, twice (SRP tile then VDP)
const OTHER = "5YJ3E1EA0PF000003"; // one rooftop, other shard

// --- Case 1: two shards, one shared VIN -------------------------------------
// alpha sees CO at $30,000 on a thin SRP tile and again on its own VDP (the
// duplicate that must NOT become a second edge). beta sees the same car at
// $31,500 on a different domain, with the richest record of the three.
const shards = {
  alpha: {
    listings: [
      listing(CO, "alpha-motors.com", 30000),
      listing(CO, "alpha-motors.com", 30000, true),
      listing(SOLO, "alpha-motors.com", 24000),
      listing(SOLO, "alpha-motors.com", 24000),
    ],
    report: [{ domain: "alpha-motors.com", truncated: false, crawledAt: "2026-08-17T10:31:00.000Z" }],
  },
  beta: {
    listings: [
      { ...listing(CO, "beta-auto.com", 31500, true), images: ["a", "b", "c", "d", "e"] },
      listing(OTHER, "gamma-ev.com", 41000),
    ],
    report: [
      { domain: "beta-auto.com", truncated: false, crawledAt: "2026-08-17T10:44:00.000Z" },
      { domain: "gamma-ev.com", truncated: false, crawledAt: "2026-08-17T10:45:00.000Z" },
    ],
  },
};

const one = await merge(shards, "case 1: one VIN on two rooftops");

check("exactly one co-listed VIN", one.colisting.length === 1, `got ${one.colisting.length}`);
const row = one.colisting[0] ?? {};
check("it is the shared VIN", row.vin === CO, `got ${row.vin}`);
check(
  "two sightings, one per domain (the same-domain duplicate did not double)",
  row.sightings?.length === 2,
  `got ${JSON.stringify(row.sightings)}`
);
check(
  "sightings carry domain + price, sorted by domain",
  JSON.stringify(row.sightings) ===
    JSON.stringify([
      { domain: "alpha-motors.com", priceUsd: 30000 },
      { domain: "beta-auto.com", priceUsd: 31500 },
    ]),
  JSON.stringify(row.sightings)
);
check(
  "a sighting carries nothing but domain and price",
  row.sightings?.every((s) => Object.keys(s).sort().join(",") === "domain,priceUsd") ?? false
);
const colistedVins = new Set(one.colisting.map((c) => c.vin));
check("single-rooftop VINs are absent", !colistedVins.has(SOLO) && !colistedVins.has(OTHER));

// The dedupe must be exactly what it was: three unique VINs out, and the
// record kept for the co-listed one is still the richest (beta's five-image
// VDP), not the first or last seen.
check("dedupe unchanged: 3 unique listings", one.listings.length === 3, `got ${one.listings.length}`);
const kept = one.listings.find((l) => l.vin === CO);
check(
  "dedupe unchanged: richest record still wins",
  kept?.dealerDomain === "beta-auto.com" && kept?.priceUsd === 31500,
  `kept ${kept?.dealerDomain} @ ${kept?.priceUsd}`
);
check(
  "the winning record was not mutated by the collector",
  kept != null && !("sightings" in kept) && !("r" in kept),
  Object.keys(kept ?? {}).join(",")
);

// --- Case 2: the control ----------------------------------------------------
// The house rule: verify a negative with a control test. An empty
// colisting-pairs.json has to mean "no VIN was co-listed", not "the collector
// silently never ran". Same shards with the shared VIN's second copy removed
// must produce an empty file — written, present, and empty.
const controlShards = {
  alpha: { ...shards.alpha, listings: shards.alpha.listings.filter((l) => l.vin !== CO) },
  beta: { ...shards.beta, listings: shards.beta.listings.filter((l) => l.vin !== CO) },
};
const two = await merge(controlShards, "case 2 (control): no VIN shared across domains");
check("control: file exists and is empty", Array.isArray(two.colisting) && two.colisting.length === 0, JSON.stringify(two.colisting));
check("control: the listings themselves still merged", two.listings.length === 2, `got ${two.listings.length}`);

// --- Sizing -----------------------------------------------------------------
// One row's serialized cost, so the claim that a real night fits in one
// request is measured rather than assumed.
const bytes = JSON.stringify(one.colisting[0]).length;
console.log(
  `\n[sizing] one row = ${bytes} bytes serialized; ` +
  `8,564 multi-domain VINs (the 2026-08-17 measurement) ≈ ${((bytes * 8564) / 1e6).toFixed(2)}MB ` +
  `— one request, well under the 4MB chunk threshold and the gateway's ceiling.`
);

console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures})`}`);
process.exit(failures === 0 ? 0 : 1);
