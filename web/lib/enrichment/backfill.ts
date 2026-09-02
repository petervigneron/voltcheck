import type { EnrichmentRow, Fact, Source } from "../types";

// ─────────────────────────────────────────────────────────────────────────
// Backfill: maker- and row-level facts filled at match time.
//
// Two facts here are keyed by a stable identifier rather than copied into the
// 400+ hand-curated rows: real-world tested range is per exact config (by row
// id), and the electric-drive warranty is a per-maker term (one value, not 340
// copies). applyBackfill() only FILLS gaps, so a value already on the row wins;
// nothing here overwrites hand-curated data.
//
// Every tested figure is drivetrain- and pack-matched to a named instrumented
// test and abstains where none was found rather than guessing. Note strings
// stay short and carry no research narration (owner copy rule); the citation
// rides on sourceUrl, not the note. Recall research from this pass was NOT
// applied: a cohort recall fact under a specific car answers the wrong
// question, and the per-VIN NHTSA surface already answers it (see the held
// research in docs/ev-recall-research-2026-08-20.json).
// ─────────────────────────────────────────────────────────────────────────

const AS_OF = "2026-08-20";

function f<T>(
  value: T,
  source: Source,
  confidence: Fact<T>["confidence"] = "high",
  note?: string,
  sourceUrl?: string
): Fact<T> {
  return { value, source, asOf: AS_OF, confidence, note, sourceUrl };
}

const firstStr = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v.join(" ") : v) || "";

// ── Electric-drive warranty, per maker ───────────────────────────────────
// The term covering the electric drive unit/motor, not the separate HV battery
// warranty (already on the rows) and not the maker's legacy mechanical
// "powertrain warranty" where they differ. On Ford and GM Ultium BEVs the drive
// unit rides with the battery at 8yr/100k (read from Ford's BEV Warranty Guide
// and GM's EV coverage), so a "5yr/60k powertrain" figure understates it: that
// term covers only non-EV driveline parts. Values are qualified ("Electric
// drive: ...") so the row is not read as the battery row.
//
// POLESTAR is the one maker left blank: its own docs state the 8yr/100k term
// for the HV battery but never separately for the electric motor, so we do not
// claim a drive-unit figure for it. Lucid/Volvo/Toyota/Subaru were verified
// from their own booklets and resolve below.
const PT_FORD = "https://www.ford.com/support/how-tos/warranty/warranties-and-coverage/what-is-the-warranty-on-hybrid-and-electric-vehicles/";
const PT_GM = "https://www.chevrolet.com/electric/ownership";
const PT_HK = "https://www.hyundaiusa.com/us/en/assurance/warranty";
const PT_MB = "https://www.mbusa.com/en/owners/manuals-and-guides";

function drive8(make: string): Fact<string> {
  return f("Electric drive: 8 yr / 100,000 mi", "mfr", "high",
    "Drive unit covered with the battery.", make === "FORD" ? PT_FORD : PT_GM);
}

// Tesla: 8yr, mileage tier by model/variant. S/X 150k; Model 3/Y Long Range and
// Performance 120k; RWD/Standard Range 100k.
function teslaPT(row: EnrichmentRow): Fact<string> {
  const m = (row.model || "").toUpperCase();
  const label = `${firstStr(row.trim)} ${row.packVariant || ""}`.toUpperCase();
  let miles = 100_000;
  if (m.includes("MODEL S") || m.includes("MODEL X")) miles = 150_000;
  else if (/LONG RANGE|PERFORMANCE|\bLR\b|\bAWD\b/.test(label)) miles = 120_000;
  return f(`Electric drive: 8 yr / ${miles.toLocaleString("en-US")} mi`, "mfr", "high",
    "Drive unit covered with the battery.", "https://www.tesla.com/support/vehicle-warranty");
}

// Rivian: 8yr, mileage by pack. Standard/Standard+ 120k; Large 150k (Quad 175k).
function rivianPT(row: EnrichmentRow): Fact<string> {
  const p = (row.packVariant || "").toUpperCase();
  const t = firstStr(row.trim).toUpperCase();
  let miles = 120_000;
  if (p.includes("MAX")) miles = 150_000;
  else if (p.includes("LARGE")) miles = /QUAD/.test(t + p) ? 175_000 : 150_000;
  return f(`Electric drive: 8 yr / ${miles.toLocaleString("en-US")} mi`, "mfr", "high",
    "Drive unit covered with the battery.", "https://rivian.com/support/article/what-is-the-rivian-new-vehicle-limited-warranty");
}

export function resolvePowertrain(row: EnrichmentRow): Fact<string> | undefined {
  const mk = (row.make || "").toUpperCase();
  switch (mk) {
    case "FORD":
    case "CHEVROLET":
    case "GMC":
    case "CADILLAC":
      return drive8(mk);
    case "TESLA":
      return teslaPT(row);
    case "RIVIAN":
      return rivianPT(row);
    case "HYUNDAI":
    case "KIA":
      return f("Electric drive: 10 yr / 100,000 mi first owner, 5 yr / 60,000 mi after", "mfr", "high",
        "The shorter term applies to second and later owners.", PT_HK);
    case "MERCEDES-BENZ":
    case "BMW":
    case "AUDI":
    case "VOLKSWAGEN":
      return f("Electric drive: 4 yr / 50,000 mi", "mfr", "high",
        "Covered under the basic warranty.", mk === "MERCEDES-BENZ" ? PT_MB : undefined);
    case "HONDA":
    case "NISSAN":
    case "JAGUAR":
    case "JEEP":
      return f("Electric drive: 5 yr / 60,000 mi", "mfr", "high",
        "Powertrain warranty.", undefined);
    // Verified from each maker's own warranty booklet: the drive unit is
    // covered 8yr/100k (Volvo EFAD/ERAD and Subaru "Electric Drive Unit" read
    // verbatim; Lucid's separate Powertrain warranty; Toyota's e-axle+inverter).
    case "LUCID":
      return f("Electric drive: 8 yr / 100,000 mi", "mfr", "high",
        "Powertrain warranty, separate from the battery.", "https://lucidmotors.com/s3fs-public/pdf/New-Vehicle-Limited-Warranty-en-US-MY26.pdf");
    case "VOLVO":
      return f("Electric drive: 8 yr / 100,000 mi", "mfr", "high",
        "Drive axles covered with the battery.", "https://www.volvocars.com/us/support/car/warranties/");
    case "SUBARU":
      return f("Electric drive: 8 yr / 100,000 mi", "mfr", "high",
        "Drive unit covered with the battery.", "https://techinfo.subaru.com/stis/doc/warrantyBooklet/5125115-Subaru_MSA5M2301M-text.PDF");
    case "TOYOTA":
      return f("Electric drive: 8 yr / 100,000 mi", "mfr", "medium",
        "E-axle and inverter covered with the battery.", "https://www.toyota.com/support/warranty/");
    default:
      return undefined; // POLESTAR deferred: its own docs do not separate the drive-unit term from the battery
  }
}

export function applyBackfill(row: EnrichmentRow | undefined): EnrichmentRow | undefined {
  if (!row) return row;
  let out = row;
  const clone = () => (out === row ? (out = { ...row }) : out);

  const tr = TESTED_BY_ROWID[row.id] ?? TESTED_EST_BY_ROWID[row.id];
  if (tr && !row.range?.testedRangeMi) {
    clone().range = { ...(row.range || {}), testedRangeMi: tr };
  }

  if (!row.warranty?.powertrainTerms) {
    const pt = resolvePowertrain(row);
    if (pt) clone().warranty = { ...(row.warranty || {}), powertrainTerms: pt };
  }

  return out;
}

export const TESTED_BY_ROWID: Record<string, Fact<number>> = {
  "bolt-2027": f(197, "tested", "high", "75-mph steady-state highway (stopped ~7% SOC) (InsideEVs)", "https://insideevs.com/news/791343/2027-chevy-bolt-ev-75-mph-range-test/"),
  "bolt-euv-2022-23": f(231, "tested", "high", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/601446/chevrolet-bolt-euv-range-test/"),
  "bolt-ev-2021-lt": f(229, "tested", "medium", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/423144/chevy-bolt-ev-70-mph-range-test/"),
  "bolt-ev-2021-premier": f(229, "tested", "medium", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/423144/chevy-bolt-ev-70-mph-range-test/"),
  "bz-2026-fwd-xle-plus": f(250, "tested", "high", "75-mph steady-state highway range (Car and Driver)", "https://www.caranddriver.com/toyota/bz"),
  "cadillac-optiq-2025": f(252, "tested", "high", "70-mph steady-state highway range test (InsideEVs)", "https://insideevs.com/reviews/756344/cadillac-optiq-awd-70-mph-range-test/"),
  "cadillac-optiq-2027-awd": f(252, "tested", "medium", "70-mph steady-state highway range test (InsideEVs)", "https://insideevs.com/reviews/756344/cadillac-optiq-awd-70-mph-range-test/"),
  "eqe-amg-2024-4matic": f(230, "tested", "medium", "75-mph steady-state highway range (Car and Driver)", "https://www.caranddriver.com/mercedes-amg/eqe53-2023"),
  "eqe-suv-2026-320-4matic": f(260, "tested", "medium", "75-mph steady-state highway range (Car and Driver)", "https://www.caranddriver.com/mercedes-benz/eqe-suv"),
  "eqs-2026-450-4matic": f(400, "tested", "medium", "75-mph steady-state highway range (Car and Driver)", "https://www.caranddriver.com/mercedes-benz/eqs"),
  "ev6-2022-lr-awd": f(254, "tested", "high", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/news/576754/kia-ev6-awd-70mph-range/"),
  "ev6-2023-24-lr-awd-19": f(254, "tested", "medium", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/news/576754/kia-ev6-awd-70mph-range/"),
  "ev6-2023-24-lr-awd-20": f(245, "tested", "medium", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/597226/kia-ev6-70mph-range-test/"),
  "ev9-2024-awd-gtline": f(240, "tested", "high", "75-mph steady-state highway (Car and Driver (reported by InsideEVs))", "https://insideevs.com/news/726683/kia-ev6-range/"),
  "ev9-2025-awd-gtline": f(240, "tested", "medium", "75-mph steady-state highway (Car and Driver (reported by InsideEVs))", "https://insideevs.com/news/726683/kia-ev6-range/"),
  "hummer-ev-suv-2024": f(250, "tested", "high", "75-mph steady-state highway range (Car and Driver)", "https://www.caranddriver.com/gmc/hummer-ev-suv"),
  "i6-2023-24-lr-awd-20": f(303, "tested", "high", "Edmunds real-world mixed-loop range test (Edmunds)", "https://www.edmunds.com/car-news/hyundai-ioniq-6-gets-more-ev-range-than-any-tesla-model-3.html"),
  "i6-2025-lr-awd-20": f(303, "tested", "medium", "Edmunds real-world mixed-loop range test (Edmunds)", "https://www.edmunds.com/car-news/hyundai-ioniq-6-gets-more-ev-range-than-any-tesla-model-3.html"),
  "id4-2025-rwd-pro": f(299, "tested", "medium", "Edmunds real-world certified test loop (Edmunds)", "https://www.edmunds.com/car-news/2024-vw-id4-pro-s-range-performance-test.html"),
  "id4-2026-rwd": f(299, "tested", "medium", "Edmunds real-world certified test loop (Edmunds)", "https://www.edmunds.com/car-news/2024-vw-id4-pro-s-range-performance-test.html"),
  "ioniq5-2022-awd": f(270, "tested", "high", "Edmunds real-world mixed-loop range test (Edmunds)", "https://www.edmunds.com/car-news/tested-2022-hyundai-ioniq-5-dual-motor-goes-270-miles-on-a-charge.html"),
  "ioniq5-2025-2026-awd-limited": f(282, "tested", "high", "Edmunds real-world mixed-loop range test (Edmunds)", "https://www.edmunds.com/car-news/hyundai-ioniq-5-revisited-review.html"),
  "ioniq5-2025-2026-xrt": f(290, "tested", "high", "Edmunds real-world mixed-loop range test (Edmunds)", "https://www.edmunds.com/car-news/hyundai-ioniq-5-revisited-review.html"),
  "ioniq5-n-2025": f(226, "tested", "high", "70-mph steady-state highway range test (InsideEVs)", "https://insideevs.com/reviews/744265/hyundai-ioniq5n-70mph-range-test/"),
  "ix-2022-23-xdrive50": f(345, "tested", "high", "70-mph steady-state highway range test (InsideEVs)", "https://insideevs.com/reviews/593029/bmw-ix-70mph-range-test/"),
  "ix-2024-2025-xdrive50": f(345, "tested", "medium", "70-mph steady-state highway range test (InsideEVs)", "https://insideevs.com/reviews/593029/bmw-ix-70mph-range-test/"),
  "kona-2019-23": f(308, "tested", "high", "Edmunds real-world mixed-loop range test (Edmunds)", "https://www.edmunds.com/car-news/electric-cars-ev-range-test-roundup-june-2022.html"),
  "kona-2024-lr": f(184, "tested", "medium", "75-mph highway efficiency/range test (InsideEVs)", "https://insideevs.com/news/720134/hyundai-kona-long-range-test/"),
  "kona-2025-lr": f(184, "tested", "medium", "75-mph highway efficiency/range test (InsideEVs)", "https://insideevs.com/news/720134/hyundai-kona-long-range-test/"),
  "leaf-2026-platinum": f(215, "tested", "high", "70-mph constant-speed highway range test (cold, ~38F) (InsideEVs)", "https://insideevs.com/news/786094/2026-nissan-leaf-70-mph-highway-range-test/"),
  "leaf-s-plus": f(185, "tested", "medium", "70-mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/reviews/420126/nissan-leaf-plus-highway-range-test-video/"),
  "lightning-2022-er": f(270, "tested", "high", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/598000/ford-f150-lightning-range-test-review/"),
  "lightning-2022-er-platinum": f(260, "tested", "high", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/news/591589/ford-f150-lightning-70mph-range/"),
  "lightning-2022-sr": f(214, "tested", "high", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/602519/ford-f150-lightning-pro-range-test/"),
  "lightning-2023-er": f(270, "tested", "medium", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/598000/ford-f150-lightning-range-test-review/"),
  "lightning-2023-er-platinum": f(260, "tested", "medium", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/news/591589/ford-f150-lightning-70mph-range/"),
  "lightning-2023-sr": f(214, "tested", "medium", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/602519/ford-f150-lightning-pro-range-test/"),
  "lightning-2024-er": f(270, "tested", "medium", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/598000/ford-f150-lightning-range-test-review/"),
  "lightning-2024-er-platinum": f(260, "tested", "medium", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/news/591589/ford-f150-lightning-70mph-range/"),
  "lightning-2024-sr": f(214, "tested", "medium", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/602519/ford-f150-lightning-pro-range-test/"),
  "lightning-2025-er131": f(270, "tested", "medium", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/598000/ford-f150-lightning-range-test-review/"),
  "lightning-2025-er131-platinum": f(260, "tested", "medium", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/news/591589/ford-f150-lightning-70mph-range/"),
  "lightning-2025-sr": f(214, "tested", "medium", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/602519/ford-f150-lightning-pro-range-test/"),
  "lucid-air-2025-touring-awd": f(280, "tested", "medium", "75-mph steady-state highway range (Car and Driver)", "https://www.caranddriver.com/lucid-motors/air"),
  "lyriq-2025-rwd": f(330, "tested", "medium", "70-mph steady-state highway range test (InsideEVs)", "https://insideevs.com/reviews/675643/cadillac-lyriq-range-test-review/"),
  "m3-2018-dual": f(290, "tested", "medium", "70-mph steady-state highway range test (to 0% SOC) (InsideEVs)", "https://insideevs.com/reviews/428113/tesla-model-3-highway-range-test-70mph/"),
  "m3-2019-dual": f(290, "tested", "high", "70-mph steady-state highway range test (to 0% SOC) (InsideEVs)", "https://insideevs.com/reviews/428113/tesla-model-3-highway-range-test-70mph/"),
  "m3-2021-lr-awd": f(310, "tested", "high", "70-mph steady-state highway range test (to 0% SOC) (InsideEVs)", "https://insideevs.com/reviews/505288/tesla-model-3-highway-range-test/"),
  "m3-2022-23-perf": f(280, "tested", "high", "70-mph steady-state highway range test (to near-empty) (Out of Spec Reviews)", "https://insideevs.com/news/582981/2022-tesla-model3-performance-70mph-range/"),
  "m3-2022-23-rwd": f(264, "tested", "high", "70-mph steady-state highway range test (driven to complete depletion) (Out of Spec Reviews)", "https://www.autoevolution.com/news/tesla-model-3-rwd-with-lfp-battery-takes-the-70-mph-range-test-runs-completely-dead-217573.html"),
  "m3-2024-lr-awd": f(370, "tested", "high", "70-mph steady-state highway range test (Out of Spec Reviews)", "https://insideevs.com/news/733732/2024-tesla-model-3-awd-range-test/"),
  "m3-2024-lr-rwd": f(386, "tested", "medium", "70-mph steady-state highway range test (from 100% charge) (Out of Spec Reviews)", "https://www.notebookcheck.net/Model-3-Performance-range-test-disappoints-as-LR-RWD-clocks-386-miles-on-a-charge.901574.0.html"),
  "m3-2024-perf": f(288, "tested", "medium", "70-mph steady-state highway range test (from 100% charge) (Out of Spec Reviews)", "https://www.notebookcheck.net/Model-3-Performance-range-test-disappoints-as-LR-RWD-clocks-386-miles-on-a-charge.901574.0.html"),
  "m3-2025-lr-rwd": f(386, "tested", "medium", "70-mph steady-state highway range test (from 100% charge) (Out of Spec Reviews)", "https://www.notebookcheck.net/Model-3-Performance-range-test-disappoints-as-LR-RWD-clocks-386-miles-on-a-charge.901574.0.html"),
  "macan-2024-25-4": f(352, "tested", "high", "Edmunds EV Range Test (real-world mixed loop, ~40 mph avg, 60% city / 40% highway) (Edmunds)", "https://www.edmunds.com/car-news/2024-porsche-macan-ev-range-test.html"),
  "macan-2024-25-4-alt": f(352, "tested", "high", "Edmunds EV Range Test (real-world mixed loop, ~40 mph avg, 60% city / 40% highway) (Edmunds)", "https://www.edmunds.com/car-news/2024-porsche-macan-ev-range-test.html"),
  "macan-2024-25-turbo": f(290, "tested", "high", "70-mph steady-state highway range test (driven to depletion) (InsideEVs / Out of Spec Reviews)", "https://insideevs.com/news/740461/porsche-macan-highway-range-test/"),
  "macan-2024-25-turbo-alt": f(290, "tested", "high", "70-mph steady-state highway range test (driven to depletion) (InsideEVs / Out of Spec Reviews)", "https://insideevs.com/news/740461/porsche-macan-highway-range-test/"),
  "macan-2025-base": f(343, "tested", "high", "70-mph steady-state highway range test (InsideEVs)", "https://insideevs.com/news/763362/porsche-macan-ev-70-80-mph-range-test/"),
  "macan-2025-base-alt": f(343, "tested", "high", "70-mph steady-state highway range test (InsideEVs)", "https://insideevs.com/news/763362/porsche-macan-ev-70-80-mph-range-test/"),
  "macan-2026-4": f(352, "tested", "medium", "Edmunds EV Range Test (real-world mixed loop, ~40 mph avg, 60% city / 40% highway) (Edmunds)", "https://www.edmunds.com/car-news/2024-porsche-macan-ev-range-test.html"),
  "macan-2026-4-alt": f(352, "tested", "medium", "Edmunds EV Range Test (real-world mixed loop, ~40 mph avg, 60% city / 40% highway) (Edmunds)", "https://www.edmunds.com/car-news/2024-porsche-macan-ev-range-test.html"),
  "macan-2026-base": f(343, "tested", "medium", "70-mph steady-state highway range test (InsideEVs)", "https://insideevs.com/news/763362/porsche-macan-ev-70-80-mph-range-test/"),
  "macan-2026-base-alt": f(343, "tested", "medium", "70-mph steady-state highway range test (InsideEVs)", "https://insideevs.com/news/763362/porsche-macan-ev-70-80-mph-range-test/"),
  "macan-2026-turbo": f(290, "tested", "medium", "70-mph steady-state highway range test (driven to depletion) (InsideEVs / Out of Spec Reviews)", "https://insideevs.com/news/740461/porsche-macan-highway-range-test/"),
  "macan-2026-turbo-alt": f(290, "tested", "medium", "70-mph steady-state highway range test (driven to depletion) (InsideEVs / Out of Spec Reviews)", "https://insideevs.com/news/740461/porsche-macan-highway-range-test/"),
  "mache-2021-gt-pe": f(220, "tested", "high", "75-mph steady-state highway (Car and Driver)", "https://autos.yahoo.com/tested-2021-ford-mustang-mach-120000169.html"),
  "mache-2021-sr-awd": f(226, "tested", "high", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/520484/mustang-mach-e-range-test/"),
  "mache-2021-sr-rwd": f(264, "tested", "high", "Edmunds real-world EV range test (standardized mixed loop) (Edmunds)", "https://www.edmunds.com/car-news/tested-2021-ford-mustang-mach-e-standard-range-rwd-beats-epa-range-by-34-miles.html"),
  "mache-2022-gt-pe": f(220, "tested", "medium", "75-mph steady-state highway (2021 same-config parity) (Car and Driver)", "https://autos.yahoo.com/tested-2021-ford-mustang-mach-120000169.html"),
  "model-y-lr-awd-2024": f(285, "tested", "high", "70-mph steady-state highway range test (Out of Spec Reviews)", "https://insideevs.com/news/754181/model-y-juniper-vs-old-model-y/"),
  "ms-2021-plaid": f(300, "tested", "high", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/543687/tesla-model-s-range-test/"),
  "mx-2022-23-plaid": f(273, "tested", "high", "70-mph steady-state highway (Out of Spec Reviews)", "https://www.autoevolution.com/news/2023-tesla-model-x-plaid-takes-the-70-mph-highway-range-test-doesn-t-ace-it-229418.html"),
  "mx-2024-plaid": f(273, "tested", "medium", "70-mph steady-state highway (Out of Spec Reviews)", "https://www.autoevolution.com/news/2023-tesla-model-x-plaid-takes-the-70-mph-highway-range-test-doesn-t-ace-it-229418.html"),
  "my-2020-lr-awd": f(276, "tested", "high", "70-mph steady-state highway range test (to 0% SOC) (InsideEVs)", "https://insideevs.com/reviews/433010/tesla-model-y-70mph-highway-range-test/"),
  "my-2025-lr-awd": f(298, "tested", "high", "70-mph steady-state highway range test (Out of Spec Reviews)", "https://insideevs.com/news/754181/model-y-juniper-vs-old-model-y/"),
  "my-2026-standard-rwd": f(268, "tested", "high", "70-mph steady-state highway range test (Out of Spec Reviews)", "https://insideevs.com/news/784492/tesla-model-y-standard-70-mph-range-test-video/"),
  "prologue-2025-26-awd-elite": f(240, "tested", "medium", "75-mph steady-state highway range (Car and Driver)", "https://www.caranddriver.com/honda/prologue"),
  "r1s-2025-26-std": f(241, "tested", "medium", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/727916/rivian-r1s-lfp-range-test/"),
  "r1t-2022": f(254, "tested", "high", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/588696/rivian-r1t-range-test-review/"),
  "r1t-2023-dual": f(308, "tested", "high", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/news/704160/rivian-r1t-max-pack-vs-large-pack-range-test/"),
  "r1t-2024-large": f(308, "tested", "medium", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/news/704160/rivian-r1t-max-pack-vs-large-pack-range-test/"),
  "r1t-2024-max": f(338, "tested", "medium", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/news/704160/rivian-r1t-max-pack-vs-large-pack-range-test/"),
  "silverado-2024-3wt": f(329, "tested", "high", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/news/714478/chevrolet-silverado-ev-3wt-range-test-70-mph/"),
  "taycan-2020-4s": f(278, "tested", "high", "70-mph steady-state highway range test (to depletion) (InsideEVs)", "https://insideevs.com/reviews/455628/video-porsche-taycan-4s-range-test/"),
  "taycan-2020-turbos": f(254, "tested", "high", "MotorTrend instrumented Road-Trip Range test, combined (city+hwy loop, ~72F, PEMS) (MotorTrend)", "https://www.motortrend.com/cars/porsche/taycan/2020/2020-porsche-taycan-turbo-s-instrumented-range-test/"),
  "taycan-2021-22-base-pbp": f(297, "tested", "high", "70-mph steady-state highway range test (to depletion) (InsideEVs)", "https://insideevs.com/news/548397/porsche-taycan-rwd-range-test/"),
  "taycan-2025-base-pbp": f(367, "tested", "high", "70-mph steady-state highway range test (to depletion), cold weather (Out of Spec (via InsideEVs))", "https://insideevs.com/reviews/739163/2025-porsche-taycan-base-range-test/"),
  "taycan-ct-2021-22-4": f(252, "tested", "high", "70-mph steady-state highway range test (to depletion) (InsideEVs)", "https://insideevs.com/reviews/540464/porsche-taycan-crossturismo-range-test/"),
  "taycan-ct-2021-22-turbo": f(246, "tested", "high", "70-mph steady-state highway range test (to depletion) (InsideEVs)", "https://insideevs.com/reviews/511077/taycan-cross-turismo-range-test/"),
  "tayct-2021-22": f(252, "tested", "medium", "70-mph steady-state highway range test (to depletion) (InsideEVs)", "https://insideevs.com/reviews/540464/porsche-taycan-crossturismo-range-test/"),
  "tayct-2021-22-turbo": f(246, "tested", "high", "70-mph steady-state highway range test (to depletion) (InsideEVs)", "https://insideevs.com/reviews/511077/taycan-cross-turismo-range-test/"),
  "wagoneer-s-2024": f(276, "tested", "high", "Edmunds EV Range Test (real-world mixed loop) (Edmunds)", "https://www.edmunds.com/car-news/2024-jeep-wagoneer-s-ev-tested.html"),
  "wagoneer-s-2025-26": f(276, "tested", "medium", "Edmunds EV Range Test (real-world mixed loop) (Edmunds)", "https://www.edmunds.com/car-news/2024-jeep-wagoneer-s-ev-tested.html"),
  "xc40-recharge-2022-23": f(210, "tested", "medium", "70-mph steady-state highway range test (InsideEVs (Out of Spec Reviews))", "https://insideevs.com/reviews/577553/volvo-xc40-electric-70-mph-range-test/"),
};

// Pass 2: parity-derived range where no direct test of the exact config exists;
// marked "est" so the row wears the estimate badge, not a bare tested figure.
export const TESTED_EST_BY_ROWID: Record<string, Fact<number>> = {
  "ariya-63-fwd": f(144, "est", "medium", "75 mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/news/613536/base-nissan-ariya-range-test/"),
  "blazer-rwd-2025": f(275, "est", "medium", "70-mph highway range test (MotorTrend)", "https://www.motortrend.com/reviews/2025-chevrolet-blazer-ev-yearlong-review-verdict"),
  "bmw-i4-xdrive40": f(239, "est", "medium", "InsideEVs 70 mph highway range test (InsideEVs)", "https://insideevs.com/reviews/590360/bmw-i4-m50-range-test/"),
  "bolt-ev-2017-2019": f(180, "est", "medium", "75-mph highway range test (Car and Driver)", "https://www.caranddriver.com/reviews/a15099446/2017-chevrolet-bolt-ev-test-review/"),
  "c40-recharge-2022-23": f(240, "est", "medium", "Edmunds real-world EV range loop (Edmunds)", "https://www.edmunds.com/car-news/2021-volvo-xc40-recharge-electric-suv-beats-epa-range-by-32-miles.html"),
  "cadillac-escalade-iql-2026": f(482, "est", "medium", "70-mph highway range test (InsideEVs)", "https://insideevs.com/reviews/763595/cadillac-escalade-iq-range-test/"),
  // Both year rows: the 2026/2027 split is the charge port only, and the pack,
  // EPA rating and drivetrain are identical either side of it.
  "cadillac-vistiq-2026": f(334, "est", "medium", "Edmunds EV Range Test (real-world mixed loop) (Edmunds)", "https://www.edmunds.com/car-news/cadillac-optiq-vistiq-range-tested.html"),
  "cadillac-vistiq-2027": f(334, "est", "medium", "Edmunds EV Range Test (real-world mixed loop) (Edmunds)", "https://www.edmunds.com/car-news/cadillac-optiq-vistiq-range-tested.html"),
  "chr-bev-2026": f(206, "est", "medium", "70-mph highway range test (MotorTrend Road-Trip Range) (MotorTrend)", "https://www.motortrend.com/reviews/first-test-2026-toyota-c-hr-dual-motor-awd"),
  "eqe-2023-500-4matic": f(260, "est", "medium", "75-mph highway range test (Car and Driver)", "https://www.caranddriver.com/mercedes-benz/eqe"),
  "eqe-suv-2023-500-4matic": f(260, "est", "medium", "75-mph highway range test (Car and Driver)", "https://www.caranddriver.com/mercedes-benz/eqe-suv"),
  "ev9-2024-awd": f(240, "est", "medium", "75-mph highway range (Car and Driver)", "https://www.caranddriver.com/news/a45523036/2024-kia-ev9-range-tested/"),
  "ev9-2025-awd": f(240, "est", "medium", "75-mph highway range (Car and Driver)", "https://www.caranddriver.com/news/a45523036/2024-kia-ev9-range-tested/"),
  "ev9-2026-awd": f(240, "est", "medium", "75-mph highway range (Car and Driver)", "https://www.caranddriver.com/news/a45523036/2024-kia-ev9-range-tested/"),
  "ev9-2026-awd-gtline": f(240, "est", "medium", "75-mph highway range (Car and Driver)", "https://www.caranddriver.com/news/a45523036/2024-kia-ev9-range-tested/"),
  "ex30-2025-26-twin": f(166, "est", "medium", "75 mph (120 km/h) constant-speed range test (Bjorn Nyland) (InsideEVs / Bjorn Nyland)", "https://insideevs.com/news/716600/volvo-ex30-performance-range-test/"),
  "ex30-2025-single": f(279, "est", "medium", "Edmunds EV Range Test (mixed loop) (Edmunds)", "https://www.edmunds.com/car-news/2026-volvo-ex30-single-motor-ev-range-tested.html"),
  "ex30-2026-single": f(279, "est", "medium", "Edmunds EV Range Test (mixed loop) (Edmunds)", "https://www.edmunds.com/car-news/2026-volvo-ex30-single-motor-ev-range-tested.html"),
  "ex90-2025": f(312, "est", "medium", "Consumer Reports 70 mph highway range test (Consumer Reports)", "https://www.consumerreports.org/cars/volvo/ex90/2025/road-test-report/"),
  "ex90-2026-twin": f(312, "est", "medium", "Consumer Reports 70 mph highway range test (Consumer Reports)", "https://www.consumerreports.org/cars/volvo/ex90/2025/road-test-report/"),
  "gc-4xe-2022-25": f(26, "est", "medium", "real-world electric-only range test (full-charge depletion) (Cars.com)", "https://www.cars.com/articles/how-far-can-a-jeep-grand-cherokee-4xe-trailhawk-go-on-electric-power-alone-486317/"),
  "hummer-ev-suv-2025": f(250, "est", "medium", "75-mph steady-state highway range (2024 same-config parity) (Car and Driver)", "https://www.caranddriver.com/gmc/hummer-ev-suv"),
  "i4-2024-xdrive40": f(239, "est", "medium", "InsideEVs 70 mph highway range test (InsideEVs)", "https://insideevs.com/reviews/590360/bmw-i4-m50-range-test/"),
  "i4-2025-edrive40": f(271, "est", "medium", "Constant-speed 120 km/h (75 mph) highway depletion range test (Bjørn Nyland (via InsideEVs))", "https://insideevs.com/news/600092/bmw-i4-edrive40-range-test/"),
  "i4-2026-edrive40": f(271, "est", "medium", "Constant-speed 120 km/h (75 mph) highway depletion range test (Bjørn Nyland (via InsideEVs))", "https://insideevs.com/news/600092/bmw-i4-edrive40-range-test/"),
  "i4-2026-m60": f(239, "est", "medium", "InsideEVs 70 mph highway range test (InsideEVs)", "https://insideevs.com/reviews/590360/bmw-i4-m50-range-test/"),
  "i4-2026-xdrive40": f(239, "est", "medium", "InsideEVs 70 mph highway range test (InsideEVs)", "https://insideevs.com/reviews/590360/bmw-i4-m50-range-test/"),
  "i5-2024-m60": f(264, "est", "medium", "Edmunds real-world mixed loop range test (Edmunds (via BMWBlog))", "https://www.bmwblog.com/2024/04/23/bmw-i5-m60-overachieves-range-test/"),
  "i5-2025-m60": f(264, "est", "medium", "Edmunds real-world mixed loop range test (Edmunds (via BMWBlog))", "https://www.bmwblog.com/2024/04/23/bmw-i5-m60-overachieves-range-test/"),
  "i5-2025-xdrive40": f(264, "est", "medium", "Edmunds real-world mixed loop range test (Edmunds (via BMWBlog))", "https://www.bmwblog.com/2024/04/23/bmw-i5-m60-overachieves-range-test/"),
  "i5-2026-m60": f(264, "est", "medium", "Edmunds real-world mixed loop range test (Edmunds (via BMWBlog))", "https://www.bmwblog.com/2024/04/23/bmw-i5-m60-overachieves-range-test/"),
  "i5-2026-xdrive40": f(264, "est", "medium", "Edmunds real-world mixed loop range test (Edmunds (via BMWBlog))", "https://www.bmwblog.com/2024/04/23/bmw-i5-m60-overachieves-range-test/"),
  "i5-2027-xdrive40": f(264, "est", "medium", "Edmunds real-world mixed loop range test (Edmunds (via BMWBlog))", "https://www.bmwblog.com/2024/04/23/bmw-i5-m60-overachieves-range-test/"),
  "i6-2023-24-lr-rwd-18": f(310, "est", "medium", "~70-mph highway (rainy, ~50F) (EV Pulse)", "https://www.evpulse.com/features/range-testing-the-2023-hyundai-ioniq-6-se-long-range"),
  "i7-2023-xdrive60": f(314, "est", "medium", "Constant-speed highway (~81 mph) depletion range test (ArenaEV)", "https://www.arenaev.com/bmw_i7_xdrive60_real_world_range_test-news-3062.php"),
  "i7-2024-m70": f(314, "est", "medium", "Constant-speed highway (~81 mph) depletion range test (ArenaEV)", "https://www.arenaev.com/bmw_i7_xdrive60_real_world_range_test-news-3062.php"),
  "i7-2024-xdrive60": f(314, "est", "medium", "Constant-speed highway (~81 mph) depletion range test (ArenaEV)", "https://www.arenaev.com/bmw_i7_xdrive60_real_world_range_test-news-3062.php"),
  "i7-2025-26-m70": f(314, "est", "medium", "Constant-speed highway (~81 mph) depletion range test (ArenaEV)", "https://www.arenaev.com/bmw_i7_xdrive60_real_world_range_test-news-3062.php"),
  "i7-2025-26-xdrive60": f(314, "est", "medium", "Constant-speed highway (~81 mph) depletion range test (ArenaEV)", "https://www.arenaev.com/bmw_i7_xdrive60_real_world_range_test-news-3062.php"),
  "i9-2026-awd": f(366, "est", "medium", "Edmunds EV Range Test (real-world loop) (Edmunds)", "https://www.edmunds.com/car-news/2026-hyundai-ioniq-9-sel-calligraphy-range-test.html"),
  "i9-2026-awd-perf": f(349, "est", "medium", "Edmunds EV Range Test (real-world loop) (Edmunds)", "https://www.edmunds.com/car-news/2026-hyundai-ioniq-9-sel-calligraphy-range-test.html"),
  "id4-2021-pro-awd": f(240, "est", "medium", "75-mph highway range test (Car and Driver)", "https://www.caranddriver.com/reviews/a60009160/2024-volkswagen-id4-dual-motor-drive/"),
  "id4-2022-pro-awd": f(240, "est", "medium", "75-mph highway range test (Car and Driver)", "https://www.caranddriver.com/reviews/a60009160/2024-volkswagen-id4-dual-motor-drive/"),
  "id4-2022-pro-rwd": f(230, "est", "medium", "70-mph highway range test (InsideEVs)", "https://insideevs.com/reviews/494147/volkswagen-id4-70mph-range-test/"),
  "id4-2023-pro-rwd": f(230, "est", "medium", "70-mph highway range test (InsideEVs)", "https://insideevs.com/reviews/494147/volkswagen-id4-70mph-range-test/"),
  "id4-2025-awd-pro": f(240, "est", "medium", "75-mph highway range test (Car and Driver)", "https://www.caranddriver.com/reviews/a60009160/2024-volkswagen-id4-dual-motor-drive/"),
  "id4-2026-awd": f(240, "est", "medium", "75-mph highway range test (Car and Driver)", "https://www.caranddriver.com/reviews/a60009160/2024-volkswagen-id4-dual-motor-drive/"),
  "ioniq5-2023-awd": f(227, "est", "medium", "70-mph highway (InsideEVs)", "https://insideevs.com/reviews/443791/ev-range-test-results/"),
  "ioniq5-2024-awd": f(227, "est", "medium", "70-mph highway (InsideEVs)", "https://insideevs.com/reviews/443791/ev-range-test-results/"),
  "ix-2024-m60": f(345, "est", "medium", "InsideEVs 70 mph highway range test (InsideEVs)", "https://insideevs.com/reviews/593029/bmw-ix-70mph-range-test/"),
  "ix-2025-m60": f(345, "est", "medium", "InsideEVs 70 mph highway range test (InsideEVs)", "https://insideevs.com/reviews/593029/bmw-ix-70mph-range-test/"),
  "leaf-2026-splus": f(310, "est", "medium", "Edmunds real-world EV Range Test (mixed 60% city / 40% highway loop) (Edmunds)", "https://www.edmunds.com/car-news/2026-nissan-leaf-ev-range-tested.html"),
  "leaf-2026-svplus": f(310, "est", "medium", "Edmunds real-world EV Range Test (mixed 60% city / 40% highway loop) (Edmunds)", "https://www.edmunds.com/car-news/2026-nissan-leaf-ev-range-tested.html"),
  "lightning-2025-er123": f(270, "est", "medium", "70 mph highway range test (InsideEVs)", "https://insideevs.com/reviews/598000/ford-f150-lightning-range-test-review/"),
  "lyriq-2025-awd": f(220, "est", "medium", "75-mph highway range test (Car and Driver)", "https://www.caranddriver.com/reviews/a43893925/2023-cadillac-lyriq-600e4-awd-by-the-numbers/"),
  "lyriq-v-2026": f(260, "est", "medium", "75-mph highway range test (Car and Driver)", "https://www.caranddriver.com/reviews/a69019885/2026-cadillac-lyriq-v-test/"),
  "lyriq-v-2027": f(260, "est", "medium", "75-mph highway range test (Car and Driver)", "https://www.caranddriver.com/reviews/a69019885/2026-cadillac-lyriq-v-test/"),
  "m3-2020-lr-awd": f(290, "est", "medium", "70 mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/428113/tesla-model-3-highway-range-test-70mph/"),
  "m3-2021-perf": f(280, "est", "medium", "70 mph steady-state highway (InsideEVs)", "https://insideevs.com/news/582981/2022-tesla-model3-performance-70mph-range/"),
  "m3-2024-rwd": f(277, "est", "medium", "70 mph steady-state highway (Out of Spec Reviews (via Notebookcheck))", "https://www.notebookcheck.net/Model-3-Performance-range-test-disappoints-as-LR-RWD-clocks-386-miles-on-a-charge.901574.0.html"),
  "m3-2025-lr-awd": f(370, "est", "medium", "70 mph steady-state highway (InsideEVs (Out of Spec))", "https://insideevs.com/news/733732/2024-tesla-model-3-awd-range-test/"),
  "m3-2025-perf": f(288, "est", "medium", "70 mph steady-state highway (Out of Spec Reviews (via Notebookcheck))", "https://www.notebookcheck.net/Model-3-Performance-range-test-disappoints-as-LR-RWD-clocks-386-miles-on-a-charge.901574.0.html"),
  "m3-2026-perf": f(288, "est", "medium", "70 mph steady-state highway (Out of Spec Reviews (via Notebookcheck))", "https://www.notebookcheck.net/Model-3-Performance-range-test-disappoints-as-LR-RWD-clocks-386-miles-on-a-charge.901574.0.html"),
  "m3-2026-premium-awd": f(370, "est", "medium", "70 mph steady-state highway (InsideEVs (Out of Spec))", "https://insideevs.com/news/733732/2024-tesla-model-3-awd-range-test/"),
  "m3-2026-premium-rwd": f(386, "est", "medium", "70 mph steady-state highway (Out of Spec Reviews (via Notebookcheck))", "https://www.notebookcheck.net/Model-3-Performance-range-test-disappoints-as-LR-RWD-clocks-386-miles-on-a-charge.901574.0.html"),
  "macan-2025-4s": f(290, "est", "medium", "70 mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/news/740461/porsche-macan-highway-range-test/"),
  "macan-2025-4s-alt": f(290, "est", "medium", "70 mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/news/740461/porsche-macan-highway-range-test/"),
  "macan-2026-4s": f(290, "est", "medium", "70 mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/news/740461/porsche-macan-highway-range-test/"),
  "macan-2026-4s-alt": f(290, "est", "medium", "70 mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/news/740461/porsche-macan-highway-range-test/"),
  "macan-2026-gts": f(290, "est", "medium", "70 mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/news/740461/porsche-macan-highway-range-test/"),
  "macan-2026-gts-alt": f(290, "est", "medium", "70 mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/news/740461/porsche-macan-highway-range-test/"),
  "mache-2021-er-rwd": f(287, "est", "medium", "70-mph highway (InsideEVs)", "https://insideevs.com/reviews/527004/mustang-mache-route1-range-test/"),
  "mache-2021-gt": f(272, "est", "medium", "Edmunds EV Range Test (mixed real-world loop) (Edmunds)", "https://www.edmunds.com/car-news/ford-mustang-mach-e-gt-beats-epa-range-estimate.html"),
  "mache-2022-er-awd-cr1": f(283, "est", "medium", "70-mph highway (InsideEVs)", "https://insideevs.com/reviews/502506/mustang-mach-e-70mph-range-test/"),
  "mache-2022-er-rwd": f(287, "est", "medium", "70-mph highway (InsideEVs)", "https://insideevs.com/reviews/527004/mustang-mache-route1-range-test/"),
  "mache-2022-gt": f(272, "est", "medium", "Edmunds EV Range Test (mixed real-world loop) (Edmunds)", "https://www.edmunds.com/car-news/ford-mustang-mach-e-gt-beats-epa-range-estimate.html"),
  "mache-2022-sr-awd": f(226, "est", "medium", "70-mph highway (InsideEVs)", "https://insideevs.com/reviews/520484/mustang-mach-e-range-test/"),
  "mache-2022-sr-rwd": f(264, "est", "medium", "Edmunds EV Range Test (mixed real-world loop) (Edmunds)", "https://www.edmunds.com/car-news/tested-2021-ford-mustang-mach-e-standard-range-rwd-beats-epa-range-by-34-miles.html"),
  "mache-2023-er-rwd": f(287, "est", "medium", "70-mph highway (InsideEVs)", "https://insideevs.com/reviews/527004/mustang-mache-route1-range-test/"),
  "mache-2023-gt": f(272, "est", "medium", "Edmunds EV Range Test (mixed real-world loop) (Edmunds)", "https://www.edmunds.com/car-news/ford-mustang-mach-e-gt-beats-epa-range-estimate.html"),
  "mache-2023-gt-pe": f(272, "est", "medium", "Edmunds EV Range Test (mixed real-world loop) (Edmunds)", "https://www.edmunds.com/car-news/ford-mustang-mach-e-gt-beats-epa-range-estimate.html"),
  "mache-2023-sr-awd-nmc": f(226, "est", "medium", "70-mph highway (InsideEVs)", "https://insideevs.com/reviews/520484/mustang-mach-e-range-test/"),
  "mache-2023-sr-rwd-nmc": f(264, "est", "medium", "Edmunds EV Range Test (mixed real-world loop) (Edmunds)", "https://www.edmunds.com/car-news/tested-2021-ford-mustang-mach-e-standard-range-rwd-beats-epa-range-by-34-miles.html"),
  "mache-2024-er-awd": f(301, "est", "medium", "Edmunds EV Range Test (mixed real-world loop) (Edmunds)", "https://www.edmunds.com/ford/mustang-mach-e/2024/"),
  "mache-2024-er-rwd": f(287, "est", "medium", "70-mph highway (InsideEVs)", "https://insideevs.com/reviews/527004/mustang-mache-route1-range-test/"),
  "mache-2024-gt": f(272, "est", "medium", "Edmunds EV Range Test (mixed real-world loop) (Edmunds)", "https://www.edmunds.com/car-news/ford-mustang-mach-e-gt-beats-epa-range-estimate.html"),
  "mache-2025-26-er-awd": f(301, "est", "medium", "Edmunds EV Range Test (mixed real-world loop) (Edmunds)", "https://www.edmunds.com/ford/mustang-mach-e/2025/"),
  "mache-2025-26-er-rwd": f(287, "est", "medium", "70-mph highway (InsideEVs)", "https://insideevs.com/reviews/527004/mustang-mache-route1-range-test/"),
  "mache-2025-26-gt": f(272, "est", "medium", "Edmunds EV Range Test (mixed real-world loop) (Edmunds)", "https://www.edmunds.com/car-news/ford-mustang-mach-e-gt-beats-epa-range-estimate.html"),
  "ms-2022-23-plaid": f(300, "est", "medium", "70 mph highway range test (InsideEVs)", "https://insideevs.com/reviews/543687/tesla-model-s-range-test/"),
  "ms-2024-plaid": f(300, "est", "medium", "70 mph highway range test (InsideEVs)", "https://insideevs.com/reviews/543687/tesla-model-s-range-test/"),
  "ms-2025-plaid": f(300, "est", "medium", "70 mph highway range test (InsideEVs)", "https://insideevs.com/reviews/543687/tesla-model-s-range-test/"),
  "ms-2026-plaid": f(300, "est", "medium", "70 mph highway range test (InsideEVs)", "https://insideevs.com/reviews/543687/tesla-model-s-range-test/"),
  "mx-2021-lrplus": f(294, "est", "medium", "real-world mixed loop (60% city / 40% highway) (Edmunds (reported by Notebookcheck))", "https://www.notebookcheck.net/BMW-iX-xDrive50-pummels-the-Tesla-Model-X-in-a-real-world-range-test.636420.0.html"),
  "mx-2025-plaid": f(273, "est", "medium", "70 mph highway range test (Out of Spec Reviews)", "https://www.autoevolution.com/news/2023-tesla-model-x-plaid-takes-the-70-mph-highway-range-test-doesn-t-ace-it-229418.html"),
  "mx-2026-plaid": f(273, "est", "medium", "70 mph highway range test (Out of Spec Reviews)", "https://www.autoevolution.com/news/2023-tesla-model-x-plaid-takes-the-70-mph-highway-range-test-doesn-t-ace-it-229418.html"),
  "my-2021-lr-awd": f(276, "est", "medium", "70 mph steady-state highway (InsideEVs)", "https://insideevs.com/reviews/433010/tesla-model-y-70mph-highway-range-test/"),
  "my-2026-lr-awd": f(298, "est", "medium", "70 mph steady-state highway (InsideEVs (Out of Spec))", "https://insideevs.com/news/754181/model-y-juniper-vs-old-model-y/"),
  "polestar2-2022-dual": f(226, "est", "medium", "70 mph steady-state highway range test (InsideEVs)", "https://insideevs.com/reviews/508700/polestar-2-highway-range-test/"),
  "polestar2-2023-dual": f(226, "est", "medium", "70 mph steady-state highway range test (InsideEVs)", "https://insideevs.com/reviews/508700/polestar-2-highway-range-test/"),
  "prologue-2025-awd": f(240, "est", "medium", "75-mph highway range test (Car and Driver)", "https://www.caranddriver.com/honda/prologue"),
  "r1s-2024-max": f(359, "est", "medium", "70 mph highway range test (Out of Spec Reviews)", "https://www.youtube.com/watch?v=bKl_Vz3K60I"),
  "r1s-2025-26-tri": f(361, "est", "medium", "Edmunds EV Range Test (Edmunds)", "https://www.edmunds.com/rivian/r1s/"),
  "r1t-2023-quad": f(289, "est", "medium", "70 mph highway range test (Out of Spec Reviews (via InsideEVs))", "https://insideevs.com/news/574637/rivian-r1t-70mph-range-test/"),
  "r1t-2024-quad": f(289, "est", "medium", "70 mph highway range test (Out of Spec Reviews (via InsideEVs))", "https://insideevs.com/news/574637/rivian-r1t-70mph-range-test/"),
  "r1t-2025-26-max": f(266, "est", "medium", "70 mph highway range test (Out of Spec Reviews)", "https://www.rivianforums.com/forum/threads/out-of-spec-highway-range-test-of-gen2-r1t-dual-max-nowhere-near-epa.36760/"),
  "r1t-2025-26-tri": f(298, "est", "medium", "70 mph highway range test (Out of Spec Reviews)", "https://www.youtube.com/watch?v=Zy0mdwSt8yc"),
  // Edmunds tested an Extended Range Sierra EV. That row split into an
  // Elevation and a Denali on 2026-08-28 (the AT4 Extended is deliberately
  // NOT here: GMC rates it 20 miles lower on the same pack, so a test of the
  // other two trims is not a measurement of it).
  "sierra-ev-2026-elevation-extended": f(428, "est", "medium", "Edmunds EV Range Test (mixed city/highway loop) (Edmunds)", "https://www.edmunds.com/car-news/electric-car-range-and-consumption-epa-vs-edmunds.html"),
  "sierra-ev-2026-denali-extended": f(428, "est", "medium", "Edmunds EV Range Test (mixed city/highway loop) (Edmunds)", "https://www.edmunds.com/car-news/electric-car-range-and-consumption-epa-vs-edmunds.html"),
  "silverado-2024-4wt": f(442, "est", "medium", "70-mph highway range test (2024 RST Max-pack parity) (InsideEVs)", "https://insideevs.com/reviews/736604/chevrolet-silverado-ev-range-test/"),
  "taycan-2021-22-4s-pbp": f(278, "est", "medium", "70-mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/reviews/455628/video-porsche-taycan-4s-range-test/"),
  "taycan-2023-24-4-pbp": f(278, "est", "medium", "70-mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/reviews/455628/video-porsche-taycan-4s-range-test/"),
  "taycan-2023-24-4s-pbp": f(278, "est", "medium", "70-mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/reviews/455628/video-porsche-taycan-4s-range-test/"),
  "taycan-2023-24-base-pbp": f(306, "est", "medium", "70-mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/reviews/604280/porsche-taycan-new-software-range-test/"),
  "taycan-2025-26-4-pbp": f(337, "est", "medium", "Edmunds EV Range Test (real-world mixed city/highway loop) (Edmunds)", "https://www.edmunds.com/car-news/2025-porsche-taycan-4s-performance-range-test.html"),
  "taycan-2025-26-4s-pbp": f(337, "est", "medium", "Edmunds EV Range Test (real-world mixed city/highway loop) (Edmunds)", "https://www.edmunds.com/car-news/2025-porsche-taycan-4s-performance-range-test.html"),
  "taycan-ct-2021-22-4s": f(246, "est", "medium", "70-mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/reviews/511077/taycan-cross-turismo-range-test/"),
  "taycan-ct-2023-24-4": f(252, "est", "medium", "70-mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/reviews/540464/porsche-taycan-crossturismo-range-test/"),
  "taycan-ct-2023-24-4s": f(246, "est", "medium", "70-mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/reviews/511077/taycan-cross-turismo-range-test/"),
  "taycan-ct-2023-24-turbo": f(246, "est", "medium", "70-mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/reviews/511077/taycan-cross-turismo-range-test/"),
  "taycan-ct-2025-26-4": f(302, "est", "medium", "70-mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/news/754893/2025-porsche-taycan-cross-turismo-range-test/"),
  "tayct-2023-24-4": f(252, "est", "medium", "70-mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/reviews/540464/porsche-taycan-crossturismo-range-test/"),
  "tayct-2023-24-4s": f(246, "est", "medium", "70-mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/reviews/511077/taycan-cross-turismo-range-test/"),
  "tayct-2023-24-turbo": f(246, "est", "medium", "70-mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/reviews/511077/taycan-cross-turismo-range-test/"),
  "tayct-2025-26-4": f(302, "est", "medium", "70-mph constant-speed highway range test (InsideEVs)", "https://insideevs.com/news/754893/2025-porsche-taycan-cross-turismo-range-test/"),
  // Four keys for one test: the 4xe rows split at the 2021/2022 boundary for
  // their battery warranty (data4.ts), and the highway figure is unchanged by
  // that — same pack, same EPA rating, every year.
  "wrangler-4xe-2021": f(22, "est", "medium", "70-mph highway electric-only range test (InsideEVs)", "https://insideevs.com/reviews/521236/jeep-4xe-highway-range-test/"),
  "wrangler-4xe-2022-25": f(22, "est", "medium", "70-mph highway electric-only range test (InsideEVs)", "https://insideevs.com/reviews/521236/jeep-4xe-highway-range-test/"),
  "wrangler-unl-4xe-2021": f(22, "est", "medium", "70-mph highway electric-only range test (InsideEVs)", "https://insideevs.com/reviews/521236/jeep-4xe-highway-range-test/"),
  "wrangler-unl-4xe-2022-25": f(22, "est", "medium", "70-mph highway electric-only range test (InsideEVs)", "https://insideevs.com/reviews/521236/jeep-4xe-highway-range-test/"),
  "x5-45e-2021-23": f(34, "est", "medium", "Real-world EV-only city range test (electric range to depletion) (Out of Spec (via InsideEVs))", "https://insideevs.com/reviews/556394/bmw-x5-54e-range-test/"),
  "x5-45e-2021-23-alt": f(34, "est", "medium", "Real-world EV-only city range test (electric range to depletion) (Out of Spec (via InsideEVs))", "https://insideevs.com/reviews/556394/bmw-x5-54e-range-test/"),
  "x5-50e-2024-26": f(45, "est", "medium", "Real-world EV-only range test (electric range to depletion, mixed roads) (BMWBlog)", "https://www.bmwblog.com/2026/05/03/2026-bmw-x5-xdrive50e-ev-range-test/"),
  "x5-50e-2024-26-alt": f(45, "est", "medium", "Real-world EV-only range test (electric range to depletion, mixed roads) (BMWBlog)", "https://www.bmwblog.com/2026/05/03/2026-bmw-x5-xdrive50e-ev-range-test/"),
  "xc40-recharge-2021": f(240, "est", "medium", "Edmunds real-world EV range loop (Edmunds)", "https://www.edmunds.com/car-news/2021-volvo-xc40-recharge-electric-suv-beats-epa-range-by-32-miles.html"),
};
