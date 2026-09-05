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
//   Volvo  — the "Certified by Volvo" national used store (cpo.volvocars.us,
//            a Codeweavers storefront over services.codeweavers.net). Every
//            Volvo rooftop's used stock, certified and not: ~707 BEVs across
//            171 dealer domains → lib/oem/volvo.mjs. Volvo's own NEW-car
//            catalogue on volvocars.com is server-rendered and complete but
//            publishes no VIN at all, so it cannot be ingested — see that
//            module's header before re-probing it.
//   Polestar — pre-owned only, and a different service from the VIN-less
//            preconfigured-cars API that was rejected earlier:
//            pc-api.polestar.com/eu-north-1/partner-rm-tool/public/'s
//            searchVehicleAds does carry the VIN. ~194 BEVs, provably
//            complete → lib/oem/polestar.mjs
//   Lexus  — Toyota and Lexus share one inventory GraphQL and it is behind an
//            AWS WAF CAPTCHA challenge, so Toyota's bZ4X is unreachable (and
//            toyota.com's robots disallows /search-inventory* besides). Lexus
//            keeps a second, same-origin REST endpoint on www.lexus.com that
//            answers plain Node — its L/Certified lot, filterable to the RZ,
//            ~70 used BEVs → lib/oem/toyota.mjs, which documents the Toyota
//            negative in full so nobody re-probes it.
//   Lucid  — direct sale, one central pool: buynow.lucidmotors.com's inventory
//            API is open to Node once you know `sortType` is load-bearing (it
//            returns an empty array, not an error, without it). Its NEW answer
//            is one car per configuration and so can never be certified; its
//            USED answer is the complete national set. ~110 used/demo +
//            ~1.6k new Air/Gravity → lib/oem/lucid.mjs
//   Rivian — BUILDABLE since 2026-09-05, reversing the 2026-08-11 "no
//            compliant data route" verdict this comment used to carry. That
//            verdict was right about the site it described: the shop's only
//            data service was rivian.com/api/gql/*/graphql, and robots.txt
//            disallows /api/. Rivian has since moved the shop onto React
//            Router server routes of its own — /configurations/api/v1/shop/
//            search for the list, /configurations/inventory/pre-owned/
//            <configId>/build for the car, which server-renders the VIN. The
//            /api/ disallow is a prefix rule and does not reach
//            /configurations/api/; the gateway calls the page still makes are
//            not read (the probe that found this ran behind lib/browser.mjs's
//            robots gate, which aborted them). Direct sale, two national
//            pools (California and everywhere else), ~145 pre-owned BEVs
//            → lib/oem/rivian.mjs
//   Subaru — subaru.com's own /services/* JSON (NOT Toyota's GraphQL, despite
//            the Solterra being a bZ4X sibling — the 2026-08-15 "Subaru = AWS
//            WAF" verdict was about the rendered page, not these endpoints).
//            Model codes discovered from the catalogue's marketing `types`, so
//            the lane picked up Trailseeker + Uncharted the day they shipped.
//            ~1.4k new + ~100 certified BEVs → lib/oem/subaru.mjs
//   Mazda  — mazdausa.com/api/inv/search, open to plain Node, and the pile the
//            2026-08-15 probe wrote off because it was looking for BEVs.
//            Mazda's plug-ins are their OWN CARLINES — C9P "MAZDA CX-90 PHEV"
//            and C7P "MAZDA CX-70 PHEV", disjoint from the petrol C90/C70 and
//            from the conventional-hybrid 50H — and `vc` is a server-side
//            filter over that distinction, which is what makes the powertrain
//            gate structural instead of a name guess. The search is
//            DEALER-SCOPED (dlrId required, no zip/radius), but dlrId and yr
//            both take comma lists, so 548 dealers become 3 chunks and the
//            whole year window one query. New AND certified, in one puller
//            because they share the domain: ~2,300 new + ~460 certified
//            plug-ins, plus the last certified MX-30 EV — the only US Mazda
//            BEV ever, still reachable through isEvModel → lib/oem/mazda.mjs
//   Mitsubishi — clickshop.mitsubishicars.com/api/graphql, an AutoFi BFF that
//            is the OEM's own national store; introspection is off, so the
//            operations came out of the _next chunks (VehiclesSummary /
//            SearchVehiclesTotal / SearchVehicles). filters:{} means the whole
//            country — no zip, no grid — and the fuel facet partitions the
//            entire index (Gasoline 11,898 + Hybrid 611 = 12,509, Electric 0),
//            which is both the BEV negative and the check that will notice the
//            day the Eclipse Sportback EV ships. The Hybrid bucket IS the
//            Outlander PHEV, exactly: model "Outlander PHEV" 611, fuelType
//            Hybrid 611, their intersection 611, and "Outlander" + Hybrid 0.
//            New only (the schema has no condition/certified field at all):
//            ~600 plug-ins in 10 requests → lib/oem/mitsubishi.mjs
//
// Probed and found to have NO US BEV to sell — negatives, control-tested, so
// nobody spends another day on them (the Acura ZDX note in the locator memory
// is the model for this).
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
//   Honda CPO — hondacertified.com, and a different site from the new-Prologue
//            grid above. Two open endpoints read out of its own JS:
//            /cpo/api/v1/inventory/getbyfilter enumerates by model group
//            (radius caps at 250, quantity at 100, and the service says so in
//            its own 400s), and /handlers/get-vehicle-details.ashx?vin= returns
//            the full record — including a FUEL_TYP_CD attribute that reads E
//            on a Prologue, B on a Clarity plug-in and G on a CR-V Hybrid, so
//            the EV gate is structural rather than the nameplate we queried.
//            Certified AND HondaTrue-used, on a national covering grid
//            → lib/oem/honda-cpo.mjs
//   Acura CPO — acuracertified.com's Tekion discovery API. One nationwide
//            walk (no radius = the whole country, 8.7k cars at 20 a page) and
//            not a fuel-facet query, because the ~1.8k non-Acura trade-ins on
//            Acura lots carry no fuelType and the facet cannot see them — the
//            42 ZDX it does see would have left 16 Prologues behind. Provably
//            complete (rows vs the service's own count), which it has to be:
//            its per-VIN page is fake-alive → lib/oem/acura-cpo.mjs
//   Stellantis CPO — the used half stellantis.mjs left alone, and no longer
//            negligible now PHEVs count (~433 nationally: Wrangler 4xe, Grand
//            Cherokee 4xe, Pacifica Hybrid, 500e). fcacertified.com's
//            get_brand_data is the certified catalogue per brand; the brand
//            storefronts paginate through a Laravel form POST that needs the
//            search page's session cookie and CSRF token, which is why
//            http.mjs gained politeGetWithHeaders. `miles=9999` makes one
//            query national and `vehicle_type` switches the two CPO tiers
//            → lib/oem/stellantis-cpo.mjs
//   Lexus CPO — already built, and it is the LEXUS entry above: /rest/lexus/
//            inventorySearch/cpo has no `new`/`used` sibling, so that lane is
//            the L/Certified lot and nothing else. Nothing to add here.
//   Porsche — NOT BUILDABLE TODAY, and the wall is the only thing stopping it.
//            Porsche Finder (finder.porsche.com) is the US inventory tool for
//            new, pre-owned and Porsche Approved stock, and it is behind
//            Vercel's Attack Challenge Mode: every path answers HTTP 429 with
//            `x-vercel-mitigated: challenge` to a plain client — the search
//            page, its /api/us/en-US/hitcounts endpoint, a vehicle detail page,
//            and /robots.txt itself, which is why we cannot even read the
//            policy they would like us to follow. Control at the same moment
//            from the same client: bmwusa.com/robots.txt and genesis.com/
//            robots.txt both 200. Same verdict as Tesla and Ford — a JS
//            proof-of-work challenge is bot detection and we do not work
//            around it.
//            What the recon found, so nobody re-does it if the wall lifts: the
//            search results are SERVER-rendered and carry a complete
//            schema.org ItemList, 15 cars per page, each with
//            vehicleIdentificationNumber, offers.price, itemCondition,
//            vehicleEngine.fuelType (the enum is PETROL / ELECTRIC /
//            PLUG_IN_HYBRID / DIESEL), mileageFromOdometer,
//            numberOfPreviousOwners and an AutoDealer seller block with the
//            retailer's name and street address. So the whole lane would be
//            fetch + parse JSON-LD, no API reverse-engineering at all. The URL
//            is /us/en-US/search with ?position={label},{lat},{lng},{radiusMi}
//            &engine-type=electric&page=N; engine-type is honoured server-side
//            (every item on a filtered page came back fuelType ELECTRIC), the
//            condition facet is new / used / porsche_approved / classic, and
//            the fuel facet separates plug-in hybrids from the rest cleanly,
//            so the Cayenne and Panamera E-Hybrids would be admissible rather
//            than guessed at. Porsche BEVs reach us today only through dealer
//            rooftops the crawl already covers.
//   Enterprise Car Sales — not an OEM but the same lane shape: their AEM SPA
//            queries an OpenSearch BFF on api.ehi.com via a page-published
//            anonymous-token flow, open to plain Node. One query is their
//            whole national used stock (~14.5k, ~136 BEV incl. used Teslas)
//            → lib/oem/enterprise.mjs
//   DriveTime — the national buy-here-pay-here used chain (~140 stores, one
//            national stock). Its Angular site serves no VINs, but the Azure
//            Cognitive Search wrapper the page calls
//            (search.ext.drivetime.cloud) is open to plain Node. The 2026-08-16
//            census that found "zero BEVs, no lane" counted only BEVs; the
//            plug-ins were never counted. The lot is WALKED whole (8 requests
//            at pageSize 1000) rather than filtered on the fuel facet, because
//            DriveTime files 40% of its own plug-ins as Gas or Flex Fuel —
//            ~47 plug-ins where the fuel bucket shows 28 → lib/oem/drivetime.mjs
//   EchoPark — Sonic Automotive's used-car retailer, 17 stores, one national
//            stock. Akamai 403s its JSON API, its VDPs and its faceted paths,
//            but the server-rendered SRP at www.echopark.com/used-cars is open
//            and embeds that same API's JSON in a __STORE__ script. ?take=500
//            (clamped to 498) walks all 6,163 cars in 13 requests → ~437 EVs,
//            68 of them used Teslas → lib/oem/echopark.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { richness } from "./lib/normalize.mjs";
import { GM_BRANDS, CARBRAVO, pullGmBrand, pullCarBravo } from "./lib/oem/gm.mjs";
import { HYUNDAI, HYUNDAI_CPO, pullHyundai, pullHyundaiCpo } from "./lib/oem/hyundai.mjs";
import { KIA, pullKia } from "./lib/oem/kia.mjs";
import { NISSAN, NISSAN_CPO, pullNissan, pullNissanCpo } from "./lib/oem/nissan.mjs";
import { BMW, pullBmw } from "./lib/oem/bmw.mjs";
import { BMW_CPO, pullBmwCpo } from "./lib/oem/bmw-cpo.mjs";
import { MERCEDES, pullMercedes } from "./lib/oem/mercedes.mjs";
import { STELLANTIS_BRANDS, pullStellantisBrand } from "./lib/oem/stellantis.mjs";
import { GENESIS, pullGenesis } from "./lib/oem/genesis.mjs";
import { GENESIS_CPO, pullGenesisCpo } from "./lib/oem/genesis-cpo.mjs";
import { FORD_BLUE_ADVANTAGE, pullFordBlueAdvantage } from "./lib/oem/ford-blue-advantage.mjs";
import { HONDA, pullHonda } from "./lib/oem/honda.mjs";
import { SUBARU, pullSubaru } from "./lib/oem/subaru.mjs";
import { AUDI, pullAudi } from "./lib/oem/audi.mjs";
import { VW, pullVw } from "./lib/oem/vw.mjs";
import { VOLVO, pullVolvo } from "./lib/oem/volvo.mjs";
import { POLESTAR, pullPolestar } from "./lib/oem/polestar.mjs";
import { ENTERPRISE, pullEnterprise } from "./lib/oem/enterprise.mjs";
import { DRIVEWAY, pullDriveway } from "./lib/oem/driveway.mjs";
import { ECHOPARK, pullEchoPark } from "./lib/oem/echopark.mjs";
import { DRIVETIME, pullDriveTime } from "./lib/oem/drivetime.mjs";
import { LEXUS, pullLexus } from "./lib/oem/toyota.mjs";
import { LUCID, LUCID_NEW, pullLucid, pullLucidNew } from "./lib/oem/lucid.mjs";
import { HONDA_CPO, pullHondaCpo } from "./lib/oem/honda-cpo.mjs";
import { ACURA_CPO, pullAcuraCpo } from "./lib/oem/acura-cpo.mjs";
import { STELLANTIS_CPO, pullStellantisCpo } from "./lib/oem/stellantis-cpo.mjs";
import { MAZDA, pullMazda } from "./lib/oem/mazda.mjs";
import { MITSUBISHI, pullMitsubishi } from "./lib/oem/mitsubishi.mjs";
import { RIVIAN, pullRivian } from "./lib/oem/rivian.mjs";

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
  [BMW_CPO.key]: { domain: BMW_CPO.domain, run: () => pullBmwCpo({ log }) },
  [MERCEDES.key]: { domain: MERCEDES.domain, run: () => pullMercedes({ log }) },
  ...Object.fromEntries(STELLANTIS_BRANDS.map((b) => [b.key, { domain: b.domain, run: () => pullStellantisBrand(b, { log }) }])),
  [GENESIS.key]: { domain: GENESIS.domain, run: () => pullGenesis({ log }) },
  [GENESIS_CPO.key]: { domain: GENESIS_CPO.domain, run: () => pullGenesisCpo({ log }) },
  [FORD_BLUE_ADVANTAGE.key]: { domain: FORD_BLUE_ADVANTAGE.domain, run: () => pullFordBlueAdvantage({ log }) },
  [HONDA.key]: { domain: HONDA.domain, run: () => pullHonda({ log }) },
  [SUBARU.key]: { domain: SUBARU.domain, run: () => pullSubaru({ log }) },
  [AUDI.key]: { domain: AUDI.domain, run: () => pullAudi({ log }) },
  [VW.key]: { domain: VW.domain, run: () => pullVw({ log }) },
  [VOLVO.key]: { domain: VOLVO.domain, run: () => pullVolvo({ log }) },
  [POLESTAR.key]: { domain: POLESTAR.domain, run: () => pullPolestar({ log }) },
  [ENTERPRISE.key]: { domain: ENTERPRISE.domain, run: () => pullEnterprise({ log }) },
  [DRIVEWAY.key]: { domain: DRIVEWAY.domain, run: () => pullDriveway({ log }) },
  [ECHOPARK.key]: { domain: ECHOPARK.domain, run: () => pullEchoPark({ log }) },
  [DRIVETIME.key]: { domain: DRIVETIME.domain, run: () => pullDriveTime({ log }) },
  [LEXUS.key]: { domain: LEXUS.domain, run: () => pullLexus({ log }) },
  [LUCID.key]: { domain: LUCID.domain, run: () => pullLucid({ log }) },
  [LUCID_NEW.key]: { domain: LUCID_NEW.domain, run: () => pullLucidNew({ log }) },
  [HONDA_CPO.key]: { domain: HONDA_CPO.domain, run: () => pullHondaCpo({ log }) },
  [ACURA_CPO.key]: { domain: ACURA_CPO.domain, run: () => pullAcuraCpo({ log }) },
  [STELLANTIS_CPO.key]: { domain: STELLANTIS_CPO.domain, run: () => pullStellantisCpo({ log }) },
  [MAZDA.key]: { domain: MAZDA.domain, run: () => pullMazda({ log }) },
  [MITSUBISHI.key]: { domain: MITSUBISHI.domain, run: () => pullMitsubishi({ log }) },
  [RIVIAN.key]: { domain: RIVIAN.domain, run: () => pullRivian({ log }) },
};

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}
const OUT_DIR = flag("--out", "out");
const wanted = flag("--brands", "chevrolet,gmc,cadillac,carbravo,hyundai,hyundai-cpo,kia,nissan,nissan-cpo,bmw,bmw-cpo,mercedes,jeep,dodge,chrysler,fiat,genesis,genesis-cpo,ford-blue-advantage,honda,honda-cpo,acura-cpo,stellantis-cpo,audi,vw,volvo,polestar,lexus,lucid,lucid-new,subaru,mazda,mitsubishi,rivian,enterprise,driveway,echopark,drivetime").split(",").map((s) => s.trim().toLowerCase());
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
