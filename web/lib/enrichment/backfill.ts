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
// Deferred pending verification (their term reads like it may be battery
// coverage): LUCID, POLESTAR, VOLVO, TOYOTA, SUBARU.
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
    default:
      return undefined; // Lucid/Polestar/Volvo/Toyota/Subaru pending verification
  }
}

export function applyBackfill(row: EnrichmentRow | undefined): EnrichmentRow | undefined {
  if (!row) return row;
  let out = row;
  const clone = () => (out === row ? (out = { ...row }) : out);

  const tr = TESTED_BY_ROWID[row.id];
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
  "bz-2026-fwd-plus": f(250, "tested", "high", "75-mph steady-state highway range (Car and Driver)", "https://www.caranddriver.com/toyota/bz"),
  "bz4x-2024-fwd": f(227, "tested", "medium", "Edmunds real-world EV Range Test (mixed 60% city/40% hwy loop) (Edmunds)", "https://www.edmunds.com/toyota/bz4x/"),
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
  "hummer-ev-suv": f(250, "tested", "high", "75-mph steady-state highway range (Car and Driver)", "https://www.caranddriver.com/gmc/hummer-ev-suv"),
  "i6-2023-24-lr-awd-20": f(303, "tested", "high", "Edmunds real-world mixed-loop range test (Edmunds)", "https://www.edmunds.com/car-news/hyundai-ioniq-6-gets-more-ev-range-than-any-tesla-model-3.html"),
  "i6-2025-lr-awd-20": f(303, "tested", "medium", "Edmunds real-world mixed-loop range test (Edmunds)", "https://www.edmunds.com/car-news/hyundai-ioniq-6-gets-more-ev-range-than-any-tesla-model-3.html"),
  "id4-2025-rwd-pro": f(299, "tested", "medium", "Edmunds real-world certified test loop (Edmunds)", "https://www.edmunds.com/car-news/2024-vw-id4-pro-s-range-performance-test.html"),
  "id4-2026-rwd": f(299, "tested", "medium", "Edmunds real-world certified test loop (Edmunds)", "https://www.edmunds.com/car-news/2024-vw-id4-pro-s-range-performance-test.html"),
  "ioniq5-2022-awd": f(270, "tested", "high", "Edmunds real-world mixed-loop range test (Edmunds)", "https://www.edmunds.com/car-news/tested-2022-hyundai-ioniq-5-dual-motor-goes-270-miles-on-a-charge.html"),
  "ioniq5-2025-2026-awd-limited": f(282, "tested", "high", "Edmunds real-world mixed-loop range test (Edmunds)", "https://www.edmunds.com/car-news/hyundai-ioniq-5-revisited-review.html"),
  "ioniq5-2025-2026-xrt": f(290, "tested", "high", "Edmunds real-world mixed-loop range test (Edmunds)", "https://www.edmunds.com/car-news/hyundai-ioniq-5-revisited-review.html"),
  "ioniq5-n-2025-2026": f(226, "tested", "high", "70-mph steady-state highway range test (InsideEVs)", "https://insideevs.com/reviews/744265/hyundai-ioniq5n-70mph-range-test/"),
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
  "silverado-3wt": f(329, "tested", "high", "70-mph steady-state highway (InsideEVs)", "https://insideevs.com/news/714478/chevrolet-silverado-ev-3wt-range-test-70-mph/"),
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
