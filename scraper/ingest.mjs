#!/usr/bin/env node
// scraper/out/listings.json → web/data/scraped-listings.json (web Listing shape).
// Keeps only records complete enough to display honestly; name-match-only EV
// classifications are dropped until vPIC verification exists.
import { readFile, writeFile } from "node:fs/promises";

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

const listings = raw
  .filter((r) => r.vin && r.year && r.make && r.model && r.priceUsd)
  .filter((r) => r.evConfidence === "high")
  .map((r) => ({
    condition: condition(r),
    id: r.vin.toLowerCase(),
    vin: r.vin,
    year: r.year,
    make: canonMake(r.make),
    model: canonModel(r.model),
    trim: r.trim ?? undefined,
    drive: inferDrive(r) ?? ariyaVds(r).drive ?? toyotaVds(r).drive,
    priceUsd: r.priceUsd,
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

const dest = new URL("../web/data/scraped-listings.json", import.meta.url);
await writeFile(dest, JSON.stringify(listings, null, 2));
console.error(`${listings.length} listings → web/data/scraped-listings.json (${raw.length - listings.length} dropped as incomplete/unverified)`);
