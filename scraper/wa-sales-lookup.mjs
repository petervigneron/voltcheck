#!/usr/bin/env node
// What did a model actually SELL for in Washington? A read-only lookup against
// WA DOL's EV title-transfer dataset (data.wa.gov rpr4-cgyd, ODbL) — the same
// public source wa-prices.mjs loads into wa_ev_sales — printed by model year,
// VIN position-8 pack/motor code and odometer band, plus the newest sales.
//
//   node wa-sales-lookup.mjs --make FORD --model "F-150 LIGHTNING" [--months 18]
//
// No credentials, writes nothing. Same sanity filters as wa-prices.mjs
// (sale_price 5,000–250,000, branded odometers dropped); unlike it, NEW sales
// are kept and reported separately, since "what does this sell for" is asked
// of new trucks too. Position 8 is the maker's own pack code — for the
// Lightning, L/K = Standard Range, V/7/M = 131 kWh Extended Range, U = the
// 2025 123 kWh Extended Range (web/lib/enrichment/data4.ts) — so the
// grouping keeps packs apart where trim strings would not.
const SODA = "https://data.wa.gov/resource/rpr4-cgyd.json";
const ODOMETER_BRANDS = ["Not actual mileage", "Exceeds mechanical limits"];

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback; };
const make = String(flag("--make", "FORD")).toUpperCase().replace(/'/g, "''");
const model = String(flag("--model", "F-150 LIGHTNING")).toUpperCase().replace(/'/g, "''");
const months = Number(flag("--months", 18));
const since = new Date(Date.now() - months * 30.44 * 86_400_000).toISOString().slice(0, 10);

const where =
  `upper(make)='${make}' AND upper(model) like '%${model}%' AND sale_price>5000 AND sale_price<250000 ` +
  `AND date_of_vehicle_sale>'${since}' ` +
  `AND (odometer_code IS NULL OR odometer_code NOT IN(${ODOMETER_BRANDS.map((b) => `'${b}'`).join(",")}))`;
const url =
  `${SODA}?$select=vin_1_10,model_year,sale_price,odometer_reading,date_of_vehicle_sale,new_or_used_vehicle,transaction_type,county` +
  `&$where=${encodeURIComponent(where)}&$order=date_of_vehicle_sale&$limit=50000`;
const res = await fetch(url);
if (!res.ok) { console.error(`SODA HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
const rows = (await res.json()).map((r) => ({
  vin8: String(r.vin_1_10 ?? "")[7] ?? "?",
  year: Number(r.model_year) || 0,
  price: Math.round(Number(r.sale_price)),
  odo: r.odometer_reading != null && Number(r.odometer_reading) > 100 ? Math.round(Number(r.odometer_reading)) : null,
  date: String(r.date_of_vehicle_sale ?? "").slice(0, 10),
  cond: r.new_or_used_vehicle === "New" ? "new" : "used",
  tx: r.transaction_type,
  county: r.county,
}));
console.log(`${rows.length} ${make} ${model} title transfers with a price since ${since}`);
const byTx = new Map(); for (const r of rows) byTx.set(r.tx, (byTx.get(r.tx) || 0) + 1);
console.log("transaction types:", [...byTx].map(([k, v]) => `${k}: ${v}`).join(", "));

const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.min(lo + 1, s.length - 1); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const fmt = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
const line = (label, xs) => xs.length >= 3 ? `${label.padEnd(34)} n=${String(xs.length).padStart(3)}  p25 ${fmt(q(xs, .25)).padStart(8)}  median ${fmt(q(xs, .5)).padStart(8)}  p75 ${fmt(q(xs, .75)).padStart(8)}` : `${label.padEnd(34)} n=${String(xs.length).padStart(3)}  (too few to summarise)`;
const group = (keyOf, title) => {
  const g = new Map();
  for (const r of rows) { const k = keyOf(r); if (k == null) continue; if (!g.has(k)) g.set(k, []); g.get(k).push(r.price); }
  console.log(`\n${title}`);
  for (const k of [...g.keys()].sort()) console.log("  " + line(k, g.get(k)));
};
group((r) => `${r.year} vin8=${r.vin8} ${r.cond}`, "by model year, VIN position 8 and new/used:");
const band = (o) => o == null ? "odo unknown" : o < 10000 ? "<10k" : o < 20000 ? "10-20k" : o < 30000 ? "20-30k" : o < 40000 ? "30-40k" : o < 60000 ? "40-60k" : "60k+";
group((r) => r.cond === "used" ? `${r.year} vin8=${r.vin8} ${band(r.odo)}` : null, "used, by model year, VIN position 8 and odometer band:");
console.log("\nnewest 25 sales:");
for (const r of rows.slice(-25)) console.log(`  ${r.date}  ${r.year}  vin8=${r.vin8}  ${r.cond.padEnd(4)}  ${fmt(r.price).padStart(8)}  ${r.odo != null ? `${r.odo.toLocaleString("en-US")} mi` : ""}  ${r.county ?? ""}`);
