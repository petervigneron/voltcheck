import type { Listing } from "./types";
import type { EnrichmentResult, EnrichmentRow, Fact, PortStandard, Source, VinDecode } from "../types";
import { matchEnrichment } from "../enrichment/match";
import { decodeTeslaVin, isTeslaVin } from "../tesla-vin";
import type { TeslaVinFacts } from "../types";
import { renamedTrim } from "./trimRename";

// What a listing card can honestly say. Every field is either a provenanced
// fact, an explicit "verify" flag, or absent — never a model-level guess
// dressed up as a per-car fact.
export interface EnrichedListing {
  listing: Listing;
  tesla: TeslaVinFacts | null;
  enrichment: EnrichmentResult;
  row?: EnrichmentRow; // exact match when there is one
  // Card-level summaries
  realRangeMi?: Fact<number>;
  usableKwh?: Fact<number>;
  /**
   * The pack size to *show*. Usable capacity is the better number and the one
   * to prefer, but most makers never publish it — Hyundai's own spec sheet
   * gives one "Battery System Capacity" row and no split, and so do Kia, GM,
   * Honda, Toyota and Volvo. Falling back to the nameplate figure is what makes
   * a battery number exist at all for those cars.
   *
   * Usable-vs-total is the smaller question and rides in the tooltip. The one
   * that has to be visible is `estimated`: whether the maker published this
   * number or somebody worked it out from a teardown, a BMS log or a spec
   * aggregator. Those are different claims and a card can't show them alike.
   */
  packKwh?: { value: number; basis: "usable" | "total"; estimated: boolean; source: Source; note?: string };
  packVariant?: string;
  port?: Fact<PortStandard>;
  chargeTime1080Min?: Fact<number>;
  heatPump: { status: "yes" | "no" | "verify"; detail: string; source: Source } | null;
  fastCharge: { status: "yes" | "no" | "verify"; detail: string };
  batteryWarrantyTransfers?: Fact<boolean>;
  trapCount: number;
}

// Truck feeds routinely put the cab style where the trim belongs ("SuperCrew"
// on 21 of 48 Lightnings). A cab style can't discriminate enrichment rows, but
// left in place it blocks every trim-keyed row from matching.
const CAB_STYLES = /^(super\s*crew|super\s*cab|crew\s*cab|regular\s*cab|extended\s*cab|double\s*cab|quad\s*cab|king\s*cab)$/i;

// For display surfaces: a cab-style pseudo-trim is not a trim — every
// Lightning is a SuperCrew, so showing "F-150 Lightning SuperCrew" as if it
// named a variant is dealer noise, not information.
export function displayTrim(l: Listing): string | undefined {
  const raw = renamedTrim(l);
  if (!raw) return undefined;
  const t = raw.trim();
  return CAB_STYLES.test(t) ? undefined : t;
}
// Body-style noise appended to real trims ("Long Range Sport Utility 4D",
// "Performance Sedan 4D") — stripped, not treated as identity. Whole phrases
// only: "Sport S" and the like must survive.
const BODY_NOISE = /\b(sports?\s*activity\s*vehicle|sport\s*utility|sedan|sdn|hatchback|gran\s*coupe|coupe|gc|4dr|4d|2d)\b/gi;

// Dealer trim strings restate things that aren't the trim: the model name,
// the drivetrain spelled out, "Dual Motor". Canonicalize before matching so
// "Model 3 Long Range Dual Motor All-Wheel Drive" can meet a "Long Range AWD"
// row key, and a trim that says nothing beyond the drivetrain drops away.
function cleanTrim(l: Listing): string | undefined {
  const rawTrim = renamedTrim(l);
  if (!rawTrim) return undefined;
  const mk = l.make.trim().toUpperCase();
  const makerNoise = mk === "RIVIAN" ? RIVIAN_TIERS : mk === "PORSCHE" ? PORSCHE_NOISE : null;
  // Feeds leak HTML entities ("S&#x2B;" for "S+").
  let t = rawTrim.replace(/&#x2b;|&#43;|&plus;/gi, "+").replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  // "S/S+"-style compounds whose halves normalize identically are one trim.
  const parts = t.split("/").map((p) => p.trim());
  if (parts.length > 1 && parts.every((p) => p.replace(/[^A-Za-z0-9]/g, "").toUpperCase() === parts[0].replace(/[^A-Za-z0-9]/g, "").toUpperCase())) {
    t = parts[0];
  }
  const model = l.model.trim().toLowerCase();
  if (t.toLowerCase().startsWith(model)) t = t.slice(model.length);
  // "Dual Motor" is packaging on a Tesla trim but identity on a Rivian one.
  t = t
    .replace(/\ball[- ]wheel drive\b/gi, "AWD")
    .replace(/\brear[- ]wheel drive\b/gi, "RWD")
    .replace(/\bfront[- ]wheel drive\b/gi, "FWD")
    .replace(mk === "RIVIAN" ? /$^/ : /\bdual motor\b/gi, " ")
    .replace(BODY_NOISE, " ")
    .replace(makerNoise ?? /$^/, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || CAB_STYLES.test(t)) return undefined;
  // Drivetrain tokens inside a trim ("SE RWD", "AWD Pro") aren't identity —
  // the drive field already carries them, and they break short-trim matching.
  t = t
    .split(" ")
    .filter((w) => !/^(rwd|awd|fwd|4wd|4x4|4x2)$/i.test(w))
    .join(" ");
  if (!t) return undefined;
  return t;
}

// A listing feed gives us make/model/year/trim directly — no vPIC round-trip
// needed to match enrichment. The VIN still contributes Tesla plant/year facts.
// Rivian's trims are feature tiers (Adventure, Launch Edition, Ascend,
// Premium) — the config lives in the pack/motor words that sometimes follow.
// Strip the tier so "Adventure Quad Motor Large Pack" matches a "Quad Motor"
// row and a bare "Adventure" honestly presents candidates.
const RIVIAN_TIERS = /\b(adventure package|adventure|launch edition|ascend|premium)\b/gi;
// Porsche feeds leak the internal type code ("Type Y1A") and package suffixes
// where the trim belongs.
const PORSCHE_NOISE = /\b(type\s*y1a|y1a|w\/?\s*premium\s*(&\s*tech\s*)?package)\b/gi;

// Feed placeholders and non-trims: the fuel type, a bare door count, "NA".
const TRIM_JUNK = /^(n\/?a|none|other|unknown|electric|ev|4dr|2dr)$/i;
// Body words BODY_NOISE doesn't cover; they only ever show up as leftovers
// once the rest of a body-style string has been stripped.
// eAWD is Ford's name for a drivetrain cleanTrim already drops under its own;
// left in, it splits Mach-E Premium into "Premium" and "Premium eAWD".
const TRIM_BODY = /\b(vehicles?|wagon|suv|crossover|pickup|2wd|eawd)\b/gi;
// Packaging bolted onto the trim. A wheel option or a special edition isn't a
// different version of the car, and as a facet value it splits one trim into a
// dozen chips of one ("Limited, Disney 100 Platinum Edition" is a Limited).
// The spaced dash is a separator ("GT - Rally"); the tight one is spelling
// ("GT-Line"), and cutting there would merge every Kia trim into "GT".
const TRIM_TAIL = /\s*(?:[,|/]|\s-\s|\bw\/|\bwith\b).*$/i;

/**
 * The trim as a *classifier* — what the in-model spec facets group by. Stricter
 * than displayTrim, because a value here becomes a chip a shopper picks:
 * anything that isn't a version of the car has to go, and near-identical
 * spellings have to land on one value. Undefined when nothing survives; the
 * per-model casing fold lives in buildIndex.ts, where the whole set is visible.
 */
export function specTrim(l: Listing): string | undefined {
  const cleaned = cleanTrim(l);
  if (!cleaned) return undefined;
  let t = cleaned.replace(TRIM_TAIL, "").replace(TRIM_BODY, " ").replace(/\s+/g, " ").trim();
  // "Premium All-Wheel Drive (Premium AWD)" loses both drivetrain halves and
  // comes out of cleanTrim reading "Premium Premium".
  const words = t
    .split(" ")
    .filter((w, i, a) => i === 0 || w.toLowerCase() !== a[i - 1].toLowerCase());
  t = words.join(" ");
  if (!t || TRIM_JUNK.test(t)) return undefined;
  // Past four words it's the dealer's feature list, not a trim name.
  if (words.length > 4) return undefined;
  // "LARIAT" and "Lariat" have to be one chip. Shouted words come back to
  // title case; short all-caps trims (XLT, SEL, GT, RS) are how they're spelled.
  return words.map((w) => (/^[A-Z]{4,}$/.test(w) ? w[0] + w.slice(1).toLowerCase() : w)).join(" ");
}

function decodeFromListing(l: Listing): VinDecode {
  return {
    vin: l.vin,
    usMarket: true,
    make: l.make.toUpperCase(),
    model: l.model,
    modelYear: l.year,
    trim: cleanTrim(l),
    driveType: l.drive,
    batteryKwhHint: l.vpicBatteryKwh,
  };
}

// Usable first — it's the capacity a driver actually gets — then the nameplate
// figure. Never both: a chip reading "84 kWh" next to one reading "77 kWh" has
// to be measuring the same thing, and within a model it does, because a model's
// rows come from one maker's disclosure practice.
//
// Only "mfr" is a published pack size. A Part 565 filing (`vin`) is the maker's
// own number but declared at VDS-pattern level, which is why the matcher has an
// ignoreKwhHint escape for cohorts where it's flatly wrong — good enough to
// show, not good enough to show unqualified. Everything else is a teardown, a
// BMS log or an aggregator.
function packSize(row?: EnrichmentRow): EnrichedListing["packKwh"] {
  const fact = row?.battery?.packUsableKwh ?? row?.battery?.packGrossKwh;
  if (!fact) return undefined;
  return {
    value: fact.value,
    basis: row?.battery?.packUsableKwh ? "usable" : "total",
    estimated: fact.source !== "mfr",
    source: fact.source,
    note: fact.note,
  };
}

export function enrichListing(l: Listing): EnrichedListing {
  const tesla = isTeslaVin(l.vin) ? decodeTeslaVin(l.vin) : null;
  const enrichment = matchEnrichment(decodeFromListing(l), tesla);

  let row = enrichment.exact;

  // The listing's own trim/drivetrain can settle an option ambiguity
  // (EV6 GT: heat pump standard; MY2022 Ioniq 5 RWD: none). When it does,
  // rewrite the fact so card, filters, and detail page all agree.
  let configResolved = false;
  const hp = row?.thermal?.heatPump;
  if (row && hp) {
    const trimKey = (l.trim ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const byTrim = row.thermal?.heatPumpByTrim;
    let resolved: typeof hp.value | undefined;
    if (byTrim && trimKey && byTrim[trimKey] !== undefined) {
      resolved = byTrim[trimKey];
    } else if (hp.value === "awd_only" && l.drive) {
      resolved = l.drive === "AWD" ? "standard" : "none";
    }
    if (resolved !== undefined && resolved !== hp.value) {
      configResolved = true;
      row = {
        ...row,
        thermal: {
          ...row.thermal,
          heatPump: { ...hp, value: resolved, note: `Resolved for this ${l.trim ?? l.drive}. ${hp.note ?? ""}` },
        },
      };
    }
  }

  // Factory option codes from the dealer's own data resolve option-dependent
  // features: RPO CBT is the Bolt's DC-fast-charge option. Presence is
  // definitive; absence is strong but worth a photo cross-check.
  let rpoResolved = false;
  const dcfcFact = row?.charging?.dcFastCharging;
  if (row && dcfcFact?.value === "optional" && !l.photoChecks?.dcFastCharge && l.optionCodes?.length) {
    const fitted = l.optionCodes.includes("CBT");
    rpoResolved = true;
    row = {
      ...row,
      charging: {
        ...row.charging,
        dcFastCharging: {
          value: fitted ? "fitted" : "not_fitted",
          source: "dealer",
          asOf: dcfcFact.asOf,
          confidence: fitted ? "high" : "medium",
          note: fitted
            ? "Option code CBT (DC fast charging) present in the dealer's own data for this car"
            : "Option code CBT absent from the dealer's option list. This car likely cannot fast-charge; confirm with a charge-port photo",
        },
      },
    };
  }

  // A photo-read charge port rewrites the model-level "optional" into a
  // per-car fact with photo provenance, so the fact table matches the chips.
  const photoDcfc = l.photoChecks?.dcFastCharge;
  if (row && photoDcfc) {
    const asOf = row.charging?.dcFastCharging?.asOf ?? "—";
    row = {
      ...row,
      charging: {
        ...row.charging,
        dcFastCharging: {
          value: photoDcfc === "confirmed_present" ? "fitted" : "not_fitted",
          source: "photo",
          asOf,
          confidence: "high",
          note:
            photoDcfc === "confirmed_present"
              ? "CCS port confirmed from this listing’s charge-port photo"
              : "Charge-port photo shows no DC pins; not retrofittable at sensible cost",
        },
        portStandard:
          photoDcfc === "confirmed_absent"
            ? { value: "J1772", source: "photo", asOf, confidence: "high", note: "AC charging only; the DC option was never fitted" }
            : row.charging?.portStandard,
      },
    };
  }

  // Per-car evidence retires model-level notes: a photo-read charge port
  // answers the DCFC lottery; a completed campaign check answers the pack
  // question; trim/drivetrain settles option ambiguity. The specific answer
  // is shown instead.
  if (row?.buyerNotes) {
    const notes = row.buyerNotes.filter((n) => {
      if (n.resolvedBy === "photo_dcfc" && (l.photoChecks?.dcFastCharge || rpoResolved)) return false;
      if (n.resolvedBy === "campaign_check" && l.campaignCheck) return false;
      if (n.resolvedBy === "config_resolved" && configResolved) return false;
      return true;
    });
    if (notes.length !== row.buyerNotes.length) row = { ...row, buyerNotes: notes };
  }

  // Ambiguity between candidate rows doesn't extend to facts they agree on:
  // a Lightning that may be either ER trim still definitely has no heat pump,
  // and either way its port is CCS.
  const agreed = <T,>(get: (r: EnrichmentRow) => Fact<T> | undefined): Fact<T> | undefined => {
    const own = row && get(row);
    if (own) return own;
    const c = enrichment.candidates;
    if (!c?.length) return undefined;
    const first = get(c[0]);
    if (!first) return undefined;
    return c.every((r) => get(r)?.value === first.value) ? first : undefined;
  };

  // Heat pump, resolved against this listing's drivetrain where possible.
  let heatPump: EnrichedListing["heatPump"] = null;
  const hpResolved = agreed((r) => r.thermal?.heatPump);
  if (hpResolved) {
    const source = hpResolved.source;
    switch (hpResolved.value) {
      case "standard":
        heatPump = { status: "yes", detail: "Heat pump standard", source };
        break;
      case "none":
        heatPump = { status: "no", detail: "No heat pump on this model year", source };
        break;
      case "awd_only":
        heatPump =
          l.drive === "AWD"
            ? { status: "yes", detail: "Heat pump (AWD cars only, and this one is AWD)", source }
            : l.drive
              ? { status: "no", detail: "AWD-only this year; this RWD car has none", source }
              : { status: "verify", detail: "AWD cars only; confirm drivetrain", source };
        break;
      case "optional":
        heatPump = { status: "verify", detail: "Factory option; the window sticker is the only authority", source };
        break;
    }
  }

  // Fast charge: photo evidence (T3.5) outranks the model-level answer.
  let fastCharge: EnrichedListing["fastCharge"];
  const photo = l.photoChecks?.dcFastCharge;
  const dcfc = row?.charging?.dcFastCharging?.value;
  if (photo === "confirmed_present") {
    fastCharge = { status: "yes", detail: "CCS port confirmed from this listing’s charge-port photo" };
  } else if (photo === "confirmed_absent") {
    fastCharge = { status: "no", detail: "Charge-port photo shows no DC pins; this car cannot fast-charge, and it is not retrofittable" };
  } else if (dcfc === "fitted") {
    fastCharge = { status: "yes", detail: "DC fast-charge option confirmed in the dealer's own data" };
  } else if (dcfc === "not_fitted") {
    fastCharge = { status: "no", detail: "Fast-charge option absent from the dealer's option data; likely cannot fast-charge" };
  } else if (dcfc === "optional") {
    fastCharge = { status: "verify", detail: "Was a $750 factory option; check the charge-port photo or glovebox RPO sticker" };
  } else if (dcfc === "none") {
    fastCharge = { status: "no", detail: "Not fast-charge capable" };
  } else {
    fastCharge = { status: "yes", detail: "DC fast charging standard" };
  }

  const candidateTraps =
    enrichment.candidates ? 1 : 0; // ambiguous identity is itself a trap
  const trapCount =
    (row?.buyerNotes?.filter((n) => n.severity === "trap").length ?? 0) + candidateTraps;

  return {
    listing: l,
    tesla,
    enrichment,
    row,
    realRangeMi: row?.range?.epaRangeMi,
    usableKwh: row?.battery?.packUsableKwh,
    packKwh: packSize(row),
    packVariant: row?.packVariant,
    port: agreed((r) => r.charging?.portStandard),
    chargeTime1080Min: agreed((r) => r.charging?.chargeTime1080Min),
    heatPump,
    fastCharge,
    batteryWarrantyTransfers: row?.warranty?.batteryTransfers,
    trapCount,
  };
}

/** Pack-level identity for price-comparison pooling (lib/listings/comps.ts):
 *  which physical version of the car this is, at the granularity that
 *  determines price-relevant hardware. packVariant groups trim-split rows of
 *  one pack — the 2022 Lightning Platinum row exists for its 300-mile EPA
 *  rating, not a different battery — while rows that differ by pack stay
 *  apart. Undefined means the enrichment layer can't say, which pooling
 *  treats as "no evidence of mixing", never as a match. */
export function packIdentity(e: EnrichedListing): string | undefined {
  return e.row ? e.row.packVariant ?? e.row.id : undefined;
}
