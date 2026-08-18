#!/usr/bin/env node
// Pull national EV inventory from OEM find-inventory locators.
//   node oem-locator.mjs [--brands chevrolet,gmc,cadillac,hyundai,kia] [--out out]
//
// Output is shaped exactly like a crawl shard (out/listings.json +
// out/report.json), so the nightly workflow uploads it as one more
// crawl-out-* artifact and merge-shards folds it in with the same VIN-keyed
// richest-record-wins dedupe. A VIN seen both here and on a dealer's own site
// resolves to the dealer-site record (richer: photos, description, VDP), and
// the locator row covers every rooftop we cannot crawl — including the ~1.5k
// bot-walled dealer domains.
//
// Per-OEM viability (probed 2026-08-15, plain Node fetch, polite identity):
//   GM (chevrolet/gmc/cadillac/buick) — open JSON API, ~24.7k EVs → lib/oem/gm.mjs
//   Hyundai — open JSON API (no auth token, just a Referer/Origin), one
//             nationwide POST, ~5.2k BEVs → lib/oem/hyundai.mjs
//   Kia    — open JSON API (isInitialRequest resolves dealers server-side),
//            one call per BEV series from the US center, ~7.4k BEVs (plus a
//            separate CPO endpoint not yet tapped) → lib/oem/kia.mjs
//   VW     — Group Stock Locator BFF (gsl.feature-app.io/bff/car/search), open
//            to Node once you know market=passenger is a vehicle class and not
//            a country code. Single-manufacturer, so no trade-ins: ~513 used +
//            ~1.5k new BEVs → lib/oem/vw.mjs
//   Audi   — open Apollo router (omnigraph.audi.com), operation read out of the
//            inventory feature-app bundle. Returns the Audi network's whole
//            used stock, so roughly half of what it yields is other makes'
//            trade-ins — including used Teslas, which no other lane can reach.
//            ~2.5k used + ~2.1k new BEVs → lib/oem/audi.mjs
//   Subaru — subaru.com's own /services/* JSON (NOT Toyota's GraphQL, despite
//            the Solterra being a bZ4X sibling — the 2026-08-15 "Subaru = AWS
//            WAF" verdict was about the rendered page, not these endpoints).
//            Model codes discovered from the catalogue's marketing `types`, so
//            the lane picked up Trailseeker + Uncharted the day they shipped.
//            ~1.4k new + ~100 certified BEVs → lib/oem/subaru.mjs
//
// Probed and found to have NO US BEV to sell — negatives, control-tested, so
// nobody spends another day on them (the Acura ZDX note in the locator memory
// is the model for this). Both APIs are OPEN and buildable; only the cars are
// missing, so each entry says what to do when that changes.
//   Mazda  — mazdausa.com/api/inv/search is open to plain Node and answers
//            with `vc` (the CARLINE code, e.g. CX5 — not the year-prefixed
//            26CX5 the page markup uses, which silently returns 0 and is how
//            an hour went), `yr`, `dlrId` (from /handlers/dealer.ajax), `s=d`,
//            `p`, `ps`, `cond=n|c`. Mazda's catalogue at /api/vehicles/model/
//            {modelCodeWithYear} carries a structural BEV flag, isEvModel, and
//            all twelve models the inventory tool offers for 2026 read false —
//            the CX-70 PHEV (C7P) and CX-90 PHEV (C9P) included, correctly.
//            The only US Mazda BEV ever was the MX-30 EV: /api/vehicles/model/
//            23m30 still resolves it (title "Mazda MX-30 EV", isEvModel true,
//            carlineCode M30), and vc=M30 returns 0 new AND 0 certified across
//            2019-2027 over all 58 California-region dealers — California was
//            its only market. Control on the same query shape at the same
//            moment: 1,930 new CX-5, 151 certified CX-5, 156 certified CX-30.
//            Build the lane on isEvModel when the 6e lands; it is a day's work.
//   Mitsubishi — clickshop.mitsubishicars.com/api/graphql (an AutoFi BFF) is
//            open to plain Node; introspection is off, so the operations came
//            out of the _next chunks (VehiclesSummary / SearchVehiclesTotal /
//            SearchVehicles, all taking {filters}). With filters:{} — no geo
//            scope, i.e. the whole national index — the fuel facet lists
//            exactly Gasoline and Hybrid, and the model facet lists Outlander
//            Sport, Eclipse Cross, Outlander, Outlander PHEV, Mirage G4,
//            Mirage. Counted: 12,673 vehicles total, fuelType Electric 0,
//            Gasoline 12,101, Hybrid 572 — and 12,101 + 572 = 12,673 exactly,
//            so the facet partitions the entire index and no BEV can be hiding
//            in an unqueried bucket. Mitsubishi's own electrified-lineup page
//            agrees: the 2027 Eclipse Sportback EV is "Coming Soon", with no
//            price and no Build & Price. The Outlander PHEV is a PHEV and does
//            not qualify. Revisit when the Eclipse Sportback ships.
//   Fiat   — has a lane already, inside the Stellantis family rather than its
//            own file: STELLANTIS_BRANDS' fiat entry queries the 500e by
//            modelYearCode because fiatusa.com's robots forbids the /services/
//            catalogue the Jeep/Dodge entries read. Verified live this session:
//            56 500e, 17 states, 4 requests, 0 errors, complete.
//   Tesla  — Akamai 403 on the inventory API itself (robots.txt is 200 and
//            permits /inventory; the block is bot management, not policy).
//            Off-limits: we do not work around bot detection. Note that used
//            Teslas still reach us second-hand, via the Audi lane above.
//   Ford   — legacy shop.ford.com aemservices API retired (404); the new
//            ford.com/inventory results route is Akamai 403 to non-browser
//            clients while its landing page is 200. Same verdict as Tesla.
//   Enterprise Car Sales — not an OEM but the same lane shape: their AEM SPA
//            queries an OpenSearch BFF on api.ehi.com via a page-published
//            anonymous-token flow, open to plain Node. One query is their
//            whole national used stock (~14.5k, ~136 BEV incl. used Teslas)
//            → lib/oem/enterprise.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { richness } from "./lib/normalize.mjs";
import { GM_BRANDS, CARBRAVO, pullGmBrand, pullCarBravo } from "./lib/oem/gm.mjs";
import { HYUNDAI, HYUNDAI_CPO, pullHyundai, pullHyundaiCpo } from "./lib/oem/hyundai.mjs";
import { KIA, pullKia } from "./lib/oem/kia.mjs";
import { NISSAN, NISSAN_CPO, pullNissan, pullNissanCpo } from "./lib/oem/nissan.mjs";
import { BMW, pullBmw } from "./lib/oem/bmw.mjs";
import { MERCEDES, pullMercedes } from "./lib/oem/mercedes.mjs";
import { STELLANTIS_BRANDS, pullStellantisBrand } from "./lib/oem/stellantis.mjs";
import { GENESIS, pullGenesis } from "./lib/oem/genesis.mjs";
import { FORD_BLUE_ADVANTAGE, pullFordBlueAdvantage } from "./lib/oem/ford-blue-advantage.mjs";
import { HONDA, pullHonda } from "./lib/oem/honda.mjs";
import { SUBARU, pullSubaru } from "./lib/oem/subaru.mjs";
import { AUDI, pullAudi } from "./lib/oem/audi.mjs";
import { VW, pullVw } from "./lib/oem/vw.mjs";
import { ENTERPRISE, pullEnterprise } from "./lib/oem/enterprise.mjs";

// One registry of pullers keyed by brand. Each entry is a thunk returning a
// crawl.mjs-shaped report; new OEM families plug in here without touching the
// pull/merge/output plumbing below.
const log = (m) => console.error(`── ${m}`);
const PULLERS = {
  ...Object.fromEntries(GM_BRANDS.map((b) => [b.key, { domain: b.domain, run: () => pullGmBrand(b, { log }) }])),
  [CARBRAVO.key]: { domain: CARBRAVO.domain, run: () => pullCarBravo({ log }) },
  [HYUNDAI.key]: { domain: HYUNDAI.domain, run: () => pullHyundai({ log }) },
  [HYUNDAI_CPO.key]: { domain: HYUNDAI_CPO.domain, run: () => pullHyundaiCpo({ log }) },
  [KIA.key]: { domain: KIA.domain, run: () => pullKia({ log }) },
  [NISSAN.key]: { domain: NISSAN.domain, run: () => pullNissan({ log }) },
  [NISSAN_CPO.key]: { domain: NISSAN_CPO.domain, run: () => pullNissanCpo({ log }) },
  [BMW.key]: { domain: BMW.domain, run: () => pullBmw({ log }) },
  [MERCEDES.key]: { domain: MERCEDES.domain, run: () => pullMercedes({ log }) },
  ...Object.fromEntries(STELLANTIS_BRANDS.map((b) => [b.key, { domain: b.domain, run: () => pullStellantisBrand(b, { log }) }])),
  [GENESIS.key]: { domain: GENESIS.domain, run: () => pullGenesis({ log }) },
  [FORD_BLUE_ADVANTAGE.key]: { domain: FORD_BLUE_ADVANTAGE.domain, run: () => pullFordBlueAdvantage({ log }) },
  [HONDA.key]: { domain: HONDA.domain, run: () => pullHonda({ log }) },
  [SUBARU.key]: { domain: SUBARU.domain, run: () => pullSubaru({ log }) },
  [AUDI.key]: { domain: AUDI.domain, run: () => pullAudi({ log }) },
  [VW.key]: { domain: VW.domain, run: () => pullVw({ log }) },
  [ENTERPRISE.key]: { domain: ENTERPRISE.domain, run: () => pullEnterprise({ log }) },
};

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}
const OUT_DIR = flag("--out", "out");
const wanted = flag("--brands", "chevrolet,gmc,cadillac,carbravo,hyundai,hyundai-cpo,kia,nissan,nissan-cpo,bmw,mercedes,jeep,dodge,fiat,genesis,ford-blue-advantage,honda,subaru,audi,vw,enterprise").split(",").map((s) => s.trim().toLowerCase());
const selected = wanted.filter((k) => PULLERS[k]);
if (!selected.length) {
  console.error(`oem-locator: no known brands in "${wanted}" (have: ${Object.keys(PULLERS).join(",")})`);
  process.exit(1);
}

// Pulls live on different hosts, so running them in parallel stays polite — the
// per-host 1.1s interval is enforced inside politePostJson.
const reports = await Promise.all(
  selected.map((k) =>
    PULLERS[k].run().catch((e) => ({
      domain: PULLERS[k].domain, kind: "oem-locator", fetched: 0, vehiclePages: 0, itemListVdps: 0,
      evs: [], errors: [`crash: ${e.message}`], notes: [], truncated: true,
    }))
  )
);

const byVin = new Map();
for (const rep of reports) {
  for (const ev of rep.evs) {
    const prev = byVin.get(ev.vin);
    if (!prev || richness(ev) > richness(prev)) byVin.set(ev.vin, ev);
  }
}

for (const rep of reports) {
  console.error(
    `── ${rep.domain}: ${rep.fetched} requests, ${rep.evs.length} EVs, ` +
      `${rep.errors.length} errors, ${rep.truncated ? "TRUNCATED (certifies nothing)" : "complete"}`
  );
  // evs ride out via listings.json; keep report.json compact like crawl.mjs does not — trim here.
  rep.evs = rep.evs.length;
  // observation stamp for db-sync's stale-evidence guard (migration 0013)
  rep.crawledAt ??= new Date().toISOString();
}

await mkdir(new URL(`./${OUT_DIR}/`, import.meta.url), { recursive: true });
await writeFile(new URL(`./${OUT_DIR}/listings.json`, import.meta.url), JSON.stringify([...byVin.values()], null, 2));
await writeFile(new URL(`./${OUT_DIR}/report.json`, import.meta.url), JSON.stringify(reports, null, 2));
console.error(`\n${byVin.size} unique locator EVs → ${OUT_DIR}/listings.json`);

// Zero rows across every brand means the platform moved or the network died —
// fail loudly so CI shows red instead of quietly uploading an empty shard.
if (!byVin.size) process.exit(1);
