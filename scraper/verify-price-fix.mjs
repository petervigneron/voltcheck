#!/usr/bin/env node
// One-off: run the crawler's own extraction path against a single VDP and
// print the normalized record — used to verify the dealercom price fix
// against vanhyundai.com VIN 7YAKN4DA0SY005538 (2026-08-14).
import { fetchPage } from "./lib/http.mjs";
import { extractVehicles } from "./lib/jsonld.mjs";
import { normalize } from "./lib/normalize.mjs";
import { extractDdcVehicles, enrichFromDdc } from "./lib/platforms/dealercom.mjs";

const url = process.argv[2];
const res = await fetchPage(url);
if (res.status !== 200) {
  console.error(`fetch failed: ${res.status}`);
  process.exit(1);
}
const vehicles = extractVehicles(res.body);
const ddcByVin = new Map(extractDdcVehicles(res.body).map((d) => [String(d.vin).toUpperCase(), d]));
for (const v of vehicles) {
  let rec = normalize(v, { sourceUrl: res.finalUrl, dealerDomain: new URL(url).hostname });
  if (rec.vin && ddcByVin.has(rec.vin)) rec = enrichFromDdc(rec, ddcByVin.get(rec.vin));
  const { vin, priceUsd, mileage, trim, condition, dealerName } = rec;
  console.log(JSON.stringify({ vin, priceUsd, mileage, trim, condition, dealerName }, null, 2));
}
