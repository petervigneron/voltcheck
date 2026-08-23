#!/usr/bin/env node
// scraper/out/listings.json → web/data/scraped-listings.json (web Listing shape).
// Keeps only records complete enough to display honestly; name-match-only EV
// classifications are dropped until vPIC verification exists.
import { readFile } from "node:fs/promises";
import { writeSnapshot } from "./lib/snapshot.mjs";
import { isKnownMake } from "./lib/makes.mjs";
import { publishedCondition } from "./lib/condition.mjs";
import { fuelTextOnly } from "./lib/ev.mjs";
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

// VW ID. Buzz VDS: VIN position 5 encodes drivetrain — W = RWD (Pro S), Y =
// AWD (Pro S Plus, 1st Edition). Corroborated against NHTSA vPIC's own
// DriveType decode of 119 sampled Buzz VINs spanning all 7 observed 6-char
// prefixes (WVGAWV/WVG5WV/WVGKWV/WVGRWV = W -> RWD, WVG6YV/WVGNYV/WVGJYV =
// Y -> AWD): zero mismatches, 2026-08-21. Position 4 is unmapped (varies by
// pack/trim, not drivetrain). Model text varies across feeds ("ID. Buzz",
// "ID Buzz", "Id. Buzz") so it's matched loosely rather than against the
// canonical name (canonModel hasn't run on `r` yet at this point in the
// pipeline). WMI WVG is shared with some ID.4 imports — this deliberately
// does NOT extend to ID.4, whose own position-5 mapping hasn't been checked.
function vwBuzzVds(r) {
  const isBuzz = /^id\.?\s*buzz$/i.test((r.model ?? "").trim());
  if (!isBuzz || !r.vin?.startsWith("WVG")) return {};
  const map = { W: "RWD", Y: "AWD" };
  const hit = map[r.vin[4]];
  return hit ? { drive: hit } : {};
}

// Delegated to lib/condition.mjs, which owns the whole condition vocabulary
// (including the non-English half) and the measurements behind it.
const condition = (r) => publishedCondition(r);

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
const unverified = [];
const listings = raw
  // priceUsd == null means no price signal at all — drop it. priceUsd === 0 is
  // a deliberate abstain (resolveDdcPrice could not name the advertised price
  // from the served fields, or it looked like a conditional false bargain):
  // keep the car, let hasRealPrice render it as "no price" instead of dropping
  // a real listing. 0 survives ingest_listings because price_usd is NOT NULL.
  .filter((r) => r.vin && modelYear(r.year) && r.make && r.model && r.priceUsd != null)
  .filter((r) => r.evConfidence === "high")
  // "high" alone was never the guarantee it reads as. For a car vouched by an
  // EV-only WMI or a known EV nameplate it is fine — the VIN or the model name
  // settles it. For a car whose ONLY evidence is the dealer's own fuel-type
  // field, "high" means vPIC either agreed or was never asked, and this filter
  // could not tell those apart. vpic-enrich.mjs runs first precisely to close
  // that gap, but it is time-capped (300m in the nightly, 6m on a rolling
  // slice) and hitting the cap is an expected outcome, not a failure — so
  // every VIN it did not reach was published as a verified EV on the strength
  // of a dealer's data entry.
  //
  // That is how 308 non-EVs came to be live on 2026-08-22: petrol and
  // mild-hybrid cars — 231 Volvo XC40 B4/B5s, 26 Mercedes CLA 220s, twelve
  // Lexus "h" hybrids, a 2023 Ram 1500 Big Horn — sitting on a site that says
  // it lists electric cars. Nothing revisits an admission afterwards
  // (audit-listings.mjs explains why recheck cannot), so each one stayed
  // until somebody deleted it by hand.
  //
  // Now the check is explicit: a fuel-text-only classification is held until
  // vPIC has ANSWERED for that VIN, exactly as a name-match classification is
  // already held until vPIC confirms it. Held, not dropped — a decode is
  // permanent once made (registry/vpic-cache.json), so the car lands on the
  // next run. The abstain direction matters: this can withhold a real EV for
  // a cycle, and it cannot publish one we never checked.
  .filter((r) => {
    if (!fuelTextOnly(r) || r.evVpicAsked) return true;
    unverified.push(r.vin);
    return false;
  })
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
    drive: inferDrive(r) ?? ariyaVds(r).drive ?? toyotaVds(r).drive ?? vwBuzzVds(r).drive,
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
// Loud on purpose. A number here is not an error — it is enrichment having run
// out of clock — but it IS a night where some real EVs are missing from the
// feed, and coverage is the whole point of this site. Silence would let that
// become permanent without anyone noticing.
if (unverified.length) {
  console.error(
    `held ${unverified.length} fuel-text-only listing(s) whose VIN vPIC was never asked about — they are not published until a vpic-enrich pass reaches them (e.g. ${unverified.slice(0, 5).join(", ")})`
  );
}

const dest = new URL("../web/data/scraped-listings.json", import.meta.url);
// Compressed envelope, via the shared codec — see lib/snapshot.mjs for the
// measurements and for why the three alternatives were rejected. This used to
// be `JSON.stringify(listings, null, 2)`, 850 bytes a row, on a file git
// refuses to push over 100 MB.
const { bytes } = await writeSnapshot(dest, listings);
console.error(`${listings.length} listings → web/data/scraped-listings.json, ${(bytes / 1048576).toFixed(1)} MB (${raw.length - listings.length} dropped as incomplete/unverified)`);
