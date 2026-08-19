#!/usr/bin/env node
// scraper/out/listings.json → web/data/scraped-listings.json (web Listing shape).
// Keeps only records complete enough to display honestly; name-match-only EV
// classifications are dropped until vPIC verification exists.
import { readFile, writeFile } from "node:fs/promises";
import { isKnownMake } from "./lib/makes.mjs";
import { priceFloor } from "./lib/price-floor.mjs";

const raw = JSON.parse(await readFile(new URL("./out/listings.json", import.meta.url), "utf-8"));
// Single-rooftop dealers have exactly one address — listings inherit it from
// the registry when the page itself didn't carry a platform address block.
// Group sites (many rooftops per domain) get no registry location on purpose.
const registry = JSON.parse(await readFile(new URL("./registry/registry.json", import.meta.url), "utf-8"));
const domainLoc = new Map(registry.sites.filter((x) => x.location).map((x) => [x.domain, x.location]));

// Canonical make/model names — dealer sites disagree on casing and naming
// ("Bolt" vs "Bolt EV", "CADILLAC", "BZ"/"bZ"/"bZ4X"). The UI depends on one
// spelling per vehicle.
const MAKE_ALLCAPS = new Set(["BMW", "GMC", "MINI"]);
function canonMake(m) {
  const t = (m ?? "").trim();
  const u = t.toUpperCase();
  if (MAKE_ALLCAPS.has(u)) return u;
  if (u === "MERCEDES-BENZ") return "Mercedes-Benz";
  return u.charAt(0) + u.slice(1).toLowerCase();
}
const MODEL_ALIASES = {
  "BOLT": "Bolt EV", "BOLT EV": "Bolt EV", "BOLT EUV": "Bolt EUV",
  "ESCALADE IQ": "Escalade IQ", "ESCALADE IQL": "Escalade IQL",
  "OPTIQ": "Optiq", "LYRIQ": "Lyriq", "VISTIQ": "Vistiq", "CELESTIQ": "Celestiq",
  "IONIQ 5": "Ioniq 5", "IONIQ 6": "Ioniq 6", "IONIQ5": "Ioniq 5", "IONIQ6": "Ioniq 6",
  "IONIQ 9": "Ioniq 9", "IONIQ 5 N": "Ioniq 5 N", "KONA ELECTRIC": "Kona Electric",
  "EV3": "EV3",
  "BZ": "bZ", "BZ WOODLAND": "bZ Woodland", "BZ4X": "bZ4X",
  "HUMMER EV": "Hummer EV", "HUMMER EV SUV": "Hummer EV SUV", "HUMMER EV PICKUP": "Hummer EV",
  "ID.4": "ID.4", "ID. BUZZ": "ID. Buzz", "ID.BUZZ": "ID. Buzz",
  "I-PACE": "I-PACE", "IPACE": "I-PACE",
  "AMG EQE": "EQE AMG", "EQE 320 SUV": "EQE SUV", "EQE 320+": "EQE", "EQE 500": "EQE",
  "MACH-E": "Mustang Mach-E", "MUSTANG MACH-E": "Mustang Mach-E",
  "E-TRON GT": "e-tron GT", "ETRON GT": "e-tron GT",
  "I4": "i4", "I5": "i5", "I7": "i7", "IX": "iX", "I3": "i3",
  "EV6": "EV6", "EV9": "EV9", "NIRO EV": "Niro EV",
  "FORTWO ELECTRIC DRIVE": "Fortwo Electric Drive",
  "POLESTAR 2": "Polestar 2", "POLESTAR 3": "Polestar 3",
};
function canonModel(m) {
  const t = (m ?? "").trim().replace(/\s+/g, " ");
  const hit = MODEL_ALIASES[t.toUpperCase()];
  if (hit) return hit;
  return t; // unknown models pass through untouched rather than guessed
}

// Platform data first; else the trim/name string when it's deterministic
// (xDrive IS AWD by definition; eDrive without x is RWD; etc).
function inferDrive(r) {
  const d = r.driveLine === "4WD" ? "AWD" : ["RWD", "AWD", "FWD"].includes(r.driveLine) ? r.driveLine : undefined;
  if (d) return d;
  const t = `${r.trim ?? ""} ${r.name ?? ""}`.toUpperCase();
  if (/(AWD|4WD|E-4ORCE|XDRIVE|DUAL MOTOR|4MATIC|QUATTRO|GT-LINE AWD)/.test(t)) return "AWD";
  if (/(\bRWD\b|EDRIVE)/.test(t)) return "RWD";
  if (/\bFWD\b/.test(t)) return "FWD";
  return undefined;
}

// Ariya VDS: VIN position 4 encodes pack/drive. Corroborated against cars in
// our own data whose trim is independently known (vPIC trim or the dealer's
// description): A = 63 kWh FWD (2x), B = 87 kWh FWD (1x), D = 87 kWh e-4ORCE
// (1x). Code C (presumably 63 AWD) is unobserved and deliberately NOT mapped.
function ariyaVds(r) {
  if (r.model !== "Ariya" || !r.vin?.startsWith("JN1")) return {};
  const map = { A: [63, "FWD"], B: [87, "FWD"], D: [87, "AWD"] };
  const hit = map[r.vin[3]];
  return hit ? { kwh: hit[0], drive: hit[1] } : {};
}

// Toyota bZ / Subaru Solterra VDS: VIN position 5 encodes drivetrain,
// corroborated against cars in our data with independently-known drive:
// JTMA*: A = FWD (2x), B = AWD (3x). JTMB* (2026 bZ): C = FWD (2x),
// D = AWD (3x), G = AWD Woodland (2x). Unobserved codes are not mapped.
function toyotaVds(r) {
  const v = r.vin ?? "";
  if (v.startsWith("JTMA")) return { A: "FWD", B: "AWD" }[v[4]] ? { drive: { A: "FWD", B: "AWD" }[v[4]] } : {};
  if (v.startsWith("JTMB")) return { C: "FWD", D: "AWD", G: "AWD" }[v[4]] ? { drive: { C: "FWD", D: "AWD", G: "AWD" }[v[4]] } : {};
  return {};
}

function condition(r) {
  if (r.certified) return "certified";
  const c = `${r.condition ?? ""} ${r.sourceUrl ?? ""}`.toLowerCase();
  if (/certified/.test(c)) return "certified";
  if (/\bnew\b|\/new-/.test(c)) return "new";
  if (/used|\/used-/.test(c)) return "used";
  return undefined;
}

// The DB stores year as smallint; a dealer feed that slips a date past the
// crawler (20250101, the 2026-08-15 nightly failure) is repaired to its
// leading year, and anything still implausible drops the listing rather than
// aborting the whole sync.
function modelYear(y) {
  if (y >= 19800101 && y <= 20991231) y = Math.floor(y / 10000);
  return y >= 1981 && y <= new Date().getFullYear() + 2 ? y : undefined;
}

// A make that isn't a real manufacturer (dealer name in the JSON-LD brand)
// can never match an enrichment row — the matcher keys on make — and
// vpic-enrich already had its chance to repair it from the VIN. Dropped
// makes are logged because a genuinely new brand would land here too.
const unknownMakes = new Map();
const listings = raw
  // priceUsd == null means no price signal at all — drop it. priceUsd === 0 is
  // a deliberate abstain (resolveDdcPrice could not name the advertised price
  // from the served fields, or it looked like a conditional false bargain):
  // keep the car, let hasRealPrice render it as "no price" instead of dropping
  // a real listing. 0 survives ingest_listings because price_usd is NOT NULL.
  .filter((r) => r.vin && modelYear(r.year) && r.make && r.model && r.priceUsd != null)
  .filter((r) => r.evConfidence === "high")
  .filter((r) => {
    if (isKnownMake(r.make)) return true;
    unknownMakes.set(r.make, (unknownMakes.get(r.make) ?? 0) + 1);
    return false;
  })
  .map((r) => ({
    condition: condition(r),
    id: r.vin.toLowerCase(),
    vin: r.vin,
    year: modelYear(r.year),
    make: canonMake(r.make),
    model: canonModel(r.model),
    trim: r.trim ?? undefined,
    drive: inferDrive(r) ?? ariyaVds(r).drive ?? toyotaVds(r).drive,
    // Last plausibility gate before the database, covering every lane (the
    // dealer.com resolver has its own, but DealerOn/DCS/OEM records land here
    // straight from normalize). A sub-floor number is a payment or fee that
    // slipped into the price slot (lib/price-floor.mjs names the live cases),
    // so it becomes an abstain — the car stays, the claim goes quiet.
    priceUsd: r.priceUsd >= priceFloor({ isNew: condition(r) === "new", year: modelYear(r.year) })
      ? r.priceUsd
      : 0,
    // Platform-extracted odometers (r.platform set) are trusted as-is — 0 is
    // real on a near-new car. JSON-LD-only mileage below 500 is
    // indistinguishable from the junk some SRPs emit, so it renders as
    // unknown rather than as a false claim.
    mileage: r.platform ? r.mileage : r.mileage != null && r.mileage >= 500 ? r.mileage : undefined,
    sellerType: "dealer",
    city: r.city ?? domainLoc.get(r.dealerDomain)?.city ?? undefined,
    state: r.state ?? domainLoc.get(r.dealerDomain)?.state ?? undefined,
    zip: r.zip ?? domainLoc.get(r.dealerDomain)?.zip ?? undefined,
    dealerName: r.dealerName ?? undefined,
    optionCodes: r.optionCodes ?? undefined,
    // Per-VIN battery coverage and pack-replacement history from the maker's
    // own owner portal (gm-warranty.mjs). Both are stable per car — dates and
    // mileages, never the portal's self-updating Active/Expired status — so
    // they are safe in the payload under migration 0025's equality rule.
    batteryCoverage: r.batteryCoverage ?? undefined,
    campaignCheck: r.campaignCheck ?? undefined,
    vpicBatteryKwh: r.vpicBatteryKwh ?? ariyaVds(r).kwh ?? undefined,
    exteriorColor: r.exteriorColor ?? undefined,
    imageUrl: r.imageUrl ?? r.images?.[0] ?? undefined,
    images: r.images?.length > 1 ? r.images.slice(0, 8) : undefined,
    interiorColor: r.interiorColor ?? undefined,
    stockNumber: r.stockNumber ?? undefined,
    previousOwners: r.previousOwners ?? undefined,
    description: r.description ? r.description.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim() : undefined,
    sourceUrl: r.sourceUrl,
    dealerDomain: r.dealerDomain,
  }));

for (const [m, n] of unknownMakes) console.error(`dropped ${n} listing(s) with unrecognized make ${JSON.stringify(m)} — real new brand? add it to lib/makes.mjs`);

const dest = new URL("../web/data/scraped-listings.json", import.meta.url);
await writeFile(dest, JSON.stringify(listings, null, 2));
console.error(`${listings.length} listings → web/data/scraped-listings.json (${raw.length - listings.length} dropped as incomplete/unverified)`);
