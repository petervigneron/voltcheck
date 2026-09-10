import type { EnrichmentRow, Fact, Source } from "../types";

// Four nameplates live on the site with no enrichment row at all
// (scripts/live-enrichment-gap.mjs, 2026-09-10): the 2026 Porsche Cayenne
// Electric, the Chevrolet Blazer EV Police Pursuit Vehicle, the Rolls-Royce
// Spectre and the Lamborghini Revuelto. Every figure below was read out of a
// document the maker publishes, fetched this pass; every EPA rating comes
// from fueleconomy.gov's REST API and cites the Find.do page for the id it
// came from. docs/agents/research-cayenne-electric-ppv-spectre-revuelto-2026-09-10.md
// is the claim-by-claim record, including the PDFs' md5s.
//
// EVERY ROW HERE IS KEYED ON THE VEHICLE DESCRIPTOR (VIN positions 4-8) and
// none of them carries a `trim` list. The matcher applies a row's trim before
// its VIN keys, so a trim key on a VIN-keyed row is a veto: it would throw
// away the cars whose dealer wrote "Used 2026 Lamborghini Revuelto" or
// "New 2026 Porsche Cayenne" into the trim field — cars whose VIN answers the
// question completely. Every live listing on all four nameplates carries a
// real 17-character VIN (checked against the shard cache, 0 placeholder ids
// among 3,810 Blazers and every Porsche, Rolls-Royce and Lamborghini record),
// so the descriptor filter is always in force.
//
// ── 1. PORSCHE CAYENNE ELECTRIC, MY2026 ────────────────────────────────────
//
// Porsche's Part 565 filing separates all six versions cleanly, and vPIC's
// own Trim decode names each one, so no trim string is needed or trusted:
//
//   WP1AA2X1  Electric              WP1BA2X1  Coupe Electric
//   WP1AB2X1  S Electric            WP1BB2X1  S Coupe Electric
//   WP1AD2X1  Turbo Electric        WP1BD2X1  Turbo Coupe Electric
//
// All six read BatteryKWh 113 in the same filing, which agrees with Porsche's
// own "gross energy capacity of 113 kW[h]". Position 8 is what keeps these
// apart from the Macan Electric, which shares positions 4-7 on two of the
// three SUV codes (WP1AD2XA is a Macan, WP1AD2X1 a Cayenne Turbo Electric) —
// a five-character descriptor prefix, not four.
//
// RANGE. fueleconomy.gov's 2026 Porsche menu carries no Cayenne Electric of
// any body (its Cayenne entries are the petrol cars), so Porsche's own
// figures go in `mfrRangeMi` — rendered with the "est" mark and labelled
// "Range (manufacturer estimate)" — not `epaRangeMi`, whose label is "EPA
// range". Porsche heads its own column "EPA Range Estimate (mi)" and points
// at the Monroney, so these are very likely certified numbers that EPA has
// simply not published yet; move them across with the ids when it does. Each
// row publishes the plain configuration and names the option in the note:
// "Range Setup" and the Turbo's 21-inch all-season tires each buy miles and
// neither is knowable from a listing.
//
// DO NOT ALIAS "Cayenne". 410 more of these cars are live under the bare
// model strings "Cayenne" and "Cayenne Coupe" — strings a petrol Cayenne
// wears too — and those stay unmatched deliberately; see the research note.
//
// HEAT PUMP ABSTAINS. Porsche's US configurator prints the Cayenne
// Electric's whole standard-equipment list and its technical data, and the
// words "heat pump" appear nowhere in it, nor in any of the three US
// releases, nor on porsche.com/usa's model page. The control test is
// Porsche's own gen-2 Taycan kit, which puts "heat pump with a new cooling
// concept" on its standard-equipment list: Porsche states it when it means
// to. Silence is not a "no" either, so the row says nothing.
//
// ── 2. CHEVROLET BLAZER EV POLICE PURSUIT VEHICLE, MY2024-2026 ─────────────
//
// data2.ts's Blazer block already found this hole and left it open: "MY2024's
// L is NOT the SS - vPIC decodes it 'PPV', the police pursuit vehicle, and no
// row covers it." Every PPV of every year is 3GNKDFRL, a descriptor no retail
// Blazer EV wears (the retail cars are KDARM, KDBRJ/RM, KDCRJ/RM, KDDRM,
// KDERL, KDGRJ, KDHRK, KDJRJ, KDKRJ, KD1RJ), so the `vds` key is a hard wall
// in the direction that matters: a retail Blazer can never land on a police
// row. These rows DO alias the bare "Blazer EV", because vPIC files the car
// as model "Blazer" and vpicEvAlias maps that to "Blazer EV" — without the
// alias a PPV VIN typed into /vin/ resolves to blazer-ss-2025/2026 (vin8 "L"
// on both) and prints the SS's 102 kWh and 302 miles as an exact answer. With
// it, the same VIN presents two candidates instead of one wrong car. The
// clean fix is a `vds: ["KDERL"]` key on those three SS rows; that is data2's
// to make and is written up in the research note.
//
// PACK IS AN ESTIMATE, and deliberately so. vPIC reads 85.00 on a MY2024 PPV,
// and that number is worthless: EVERY MY2024 Blazer EV pattern reads 85.00 in
// the same filing, including 3GNKDHRK, the RWD car data2.ts documents at
// 102 kWh. It is a model-level constant, the vPIC trap this project has hit
// before. What GM does publish is its 2027 PPV Specification Guide's
// "102 kWh Battery Rated Energy, 190 kW DC fast charging capable", the 2022
// announcement's "the largest possible Ultium battery available for this
// Blazer EV PPV" on a car "based off the Blazer EV SS retail model", and the
// 2026 specialty sheet's "DC fast charging for public charging rates up to
// 190 kW" — data2.ts sources 190 kW to the 102 kWh pack and 150 kW to the
// 85 kWh one off Chevrolet's own specification pages. Three GM statements
// converge on 102 and none of them states it for MY2024-26, so it is filed
// as `est` and renders as an estimate.
//
// RANGE SPLITS BY YEAR because GM's own figure does. GM published "an
// EPA-estimated 297 miles of range" for the MY2025 car; its MY2026 specialty
// sheet prints "EPA-ESTIMATED TBD MILES Of Range" in the same slot; and the
// MY2024 announcement says only that "Final specifications and range will be
// available closer to launch". fueleconomy.gov has no PPV record in any year
// — the control is that it lists every retail Blazer EV variant for the same
// years, so this is EPA not rating a police vehicle rather than a hole in the
// lookup. So 2025 carries GM's number and 2024 and 2026 abstain.
//
// ── 3. ROLLS-ROYCE SPECTRE, MY2024-2026 ────────────────────────────────────
//
// The VIN separates Black Badge from the standard car and nothing else does:
// SCATK2C0 decodes Series "Spectre", SCATK4C0 Series "Black Badge Spectre".
// Both are 102 kWh in the same filing, matching Rolls-Royce's own "Spectre
// has a 102kWh lithium-ion battery".
//
// WARRANTY IS THE PER-YEAR FACT HERE, and it moves a long way. Rolls-Royce's
// own US Maintenance & Warranty booklets: MY2024 and MY2025 both warrant the
// HV battery "for a period of 10 years/unlimited miles"; MY2026 raises that
// to "15 years / unlimited miles" and adds a capacity term the earlier
// booklets have no section for at all. `batteryMiles` is left off rather than
// filled with a number Rolls-Royce does not state — the term is unlimited for
// a private car and 100,000 miles only for a commercially used one, and the
// booklet's words ride in the note.
//
// RANGE: THE WEAKEST CALL IN THIS FILE, stated plainly. EPA certifies each
// version twice, once per wheel, and the gap is 25 miles on the MY2024 car
// (291 on 22-inch, 266 on 23-inch). Nothing in the VIN, the trim string or
// the listing says which wheel a car has, and no Rolls-Royce document read
// this pass marks either as standard equipment — the launch release only
// boasts that Spectre is "the first production two-door coupé to be equipped
// with 23-inch wheels in almost 100 years". With the standard config
// unsourced, each row carries the LOWER certified figure and names the other
// in the note: a range we understate costs a shopper nothing, and one we
// overstate costs them money.
//
// PORT ABSTAINS. Rolls-Royce's US charging page, both Spectre press releases
// and the Black Badge release all describe DC and AC charging at length and
// never name a connector; web.archive.org was offline this pass. The
// port-by-model-year rule says a search result is not a source for this, and
// the sibling BMW Group rows are not a Rolls-Royce document, so the rows say
// nothing.
//
// ── 4. LAMBORGHINI REVUELTO, MY2024-2026 ───────────────────────────────────
//
// Every live Revuelto is ZHWUC1ZM. The descriptor matters because MY2026
// added ZHWUC1ZC on the same WMI — that is the Temerario, 13 of which are
// live and none of which may reach these rows.
//
// THE PACK ABSTAINS. Lamborghini's own technical-specification table, in both
// the 2023 launch brochure and the 2026 brochure, gives the hybrid system's
// battery as "Lithium-ion high specific power battery with pouch cells" and
// no capacity; the emergency response guide gives 400 V and nothing more; and
// vPIC carries no BatteryKWh for any Revuelto VIN. The 3.8 kWh figure that
// circulates appears in no Lamborghini document read this pass.
//
// RANGE. fueleconomy.gov files the Revuelto as atvType "Hybrid" with an empty
// `rangeA` and zero MPGe — EPA published no electric-only range for it in
// either rated year. Lamborghini did: its brochure's spec table has a "ZERO
// EMISSION RANGE" block reading "(EAER) 13km" and "(EPA) 5 miles". That is
// the maker printing a US figure under EPA's own name, so it goes in
// `epaRangeMi`, cited to the brochure page. The bridge back to the rated
// years is the same footnote's "COMBINED FUEL ECONOMY (GASOLINE ONLY):
// 12 MPG", which is exactly fueleconomy.gov's comb08 for MY2024 (48452) and
// MY2025 (48581).
//
// PORT. Lamborghini's Revuelto Emergency Response Guide — the document whose
// job is telling a responder what is on the car — enumerates the sockets its
// hybrids carry as "Charging socket type 1 AC (e.g. in NAR, South Korea,
// Japan)", "type 2 AV (e.g. in the EU)" and "type GB/T AV (e.g. in China)".
// Type 1 AC is J1772 and NAR is this market. The same table has no DC entry
// at all, which is why `dcFastCharging` reads "none" at medium confidence
// rather than being left silent.
//
// WARRANTY, AND A CONFLICT INSIDE LAMBORGHINI. The 2023 and 2026 brochures
// both say "a 8-year warranty for the battery up to 160,000 Km/75,000 miles";
// Lamborghini's own Revuelto news release says "8 years or 160.000 km
// (100.000 mls)" for the same term. 160,000 km is about 99,400 miles, so the
// brochures' mileage looks like the error — but understating coverage cannot
// tell a shopper they are covered when they are not, so the rows carry 75,000
// and the note carries both.

const AS_OF = "2026-09-10";

function f<T>(
  value: T,
  source: Source,
  confidence: Fact<T>["confidence"] = "high",
  note?: string,
  sourceUrl?: string
): Fact<T> {
  return { value, source, asOf: AS_OF, confidence, note, sourceUrl };
}

const epa = (id: number) => `https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=${id}`;

const R: EnrichmentRow[] = [];

// ── Porsche Cayenne Electric ────────────────────────────────────────────────
{
  const PR_LAUNCH =
    "https://newsroom.porsche.com/en_US/2025/products/new-porsche-all-rounder-Cayenne-nameplate-expands-portfolio-to-include-electrification-41132.html";
  const PR_S = "https://newsroom.porsche.com/en_US/2026/products/porsche-the-new-cayenne-s-electric-41867.html";
  // The Coupe release states the same pack, port and charge time for all three
  // coupes ("A NACS port sits within the drivers-side rear fender … the Cayenne
  // Coupe Electric's 113 kWh battery can be charged from 10-80% in less than
  // 16 minutes"), so the coupe rows carry the same Facts as the SUVs. It is
  // cited in the research note; the SUV release says it first and in more
  // detail, so that is what the Facts point at:
  // newsroom.porsche.com/en_US/2026/products/new-2026-porsche-cayenne-coupe-electric-joins-gas-powered-and-plug-in-hybrid-cayenne-coupe-variants.html
  const RANGE_PAGE = "https://www.porsche.com/usa/models/cayenne/cayenne-range";
  const CONFIGURATOR = "https://configurator.porsche.com/en-US/mode/model/X1AAA1.pdf?tab=standard-equipment";

  const NOT_YET_EPA =
    "Porsche's own figure, from its “EPA Range Estimate (mi)” table; fueleconomy.gov carries no 2026 Cayenne Electric record as of 2026-09-10 — move to epaRangeMi with the EPA id when it does";

  const battery = {
    packGrossKwh: f(
      113,
      "mfr",
      "high",
      "“a high-voltage battery with a gross energy capacity of 113 kW[h]”; Porsche's US configurator prints “Gross battery capacity 113.0 kWh”",
      PR_S
    ),
  };

  const charging = {
    portStandard: f<"NACS">(
      "NACS",
      "mfr",
      "high",
      "“The Cayenne Electric will come equipped with J3400 (NACS) DC-only fast charging port on the driver-side rear fender, and a J1772 AC-only charging port on the passenger-side rear fender. It will also come standard with a Porsche CCS DC Adapter.”",
      PR_LAUNCH
    ),
    dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, PR_LAUNCH),
    dcPeakKw: f(
      400,
      "mfr",
      "high",
      "“the Cayenne charges with up to 400 kW DC charging power”; Porsche's US configurator technical data prints “Maximum charging power with direct current (DC) 390 kW”, and its footnote defines the 400 kW peak as a >400 kW / >850 V / >520 A station at 45-48% state of charge and a 104-107°F pack",
      PR_LAUNCH
    ),
    chargeTime1080Min: f(
      16,
      "mfr",
      "high",
      "10-80% at a NACS station supplying >390 kW, >850 V, >520 A with the pack at 60°F, Porsche's own footnote",
      PR_S
    ),
    acOnboardKw: f(9.6, "mfr", "high", "“9.6 kW AC On-Board Charger”, standard equipment", CONFIGURATOR),
    architectureV: f(800, "mfr", "high", undefined, PR_LAUNCH),
  };

  const warranty = {
    batteryYears: f(
      8,
      "mfr",
      "high",
      "“For 8 years or 100,000 miles, whichever comes first, Porsche provides High-Voltage Battery Coverage under its New Car Limited Warranty”",
      RANGE_PAGE
    ),
    batteryMiles: f(100_000, "mfr", "high", undefined, RANGE_PAGE),
    sohFloorPct: f(
      70,
      "mfr",
      "high",
      "“Porsche expects the majority of vehicles to retain 70% of the battery's original capacity through the first 8 years or 100,000 miles”",
      RANGE_PAGE
    ),
  };

  const HP_ABSTAIN =
    "No Porsche document names one for this car: the US configurator's full standard-equipment list and technical data, all three US press releases and porsche.com/usa's model page describe the climate and battery cooling systems without the words, and the control test is Porsche's own gen-2 Taycan kit, which puts a heat pump on its standard-equipment list by name";

  const cayenne = (
    id: string,
    model: string,
    modelAliases: string[],
    vds: string[],
    rangeMi: number,
    rangeNote: string,
    rangeSrc: string
  ): EnrichmentRow => ({
    id,
    make: "PORSCHE",
    model,
    // 418 of the 489 live 2X1 cars are filed under the bare "Cayenne" /
    // "Cayenne Coupe" (2026-09-10). The 2X1 vds keys separate them from the
    // petrol and E-Hybrid Cayennes, and vinRequired keeps a VIN-less bare
    // "Cayenne" off these rows (types.ts).
    modelAliases: [...modelAliases, "Cayenne", "Cayenne Coupe"],
    vinRequired: true,
    modelYears: [2026, 2026],
    drive: "AWD",
    vds,
    battery,
    range: { mfrRangeMi: f(rangeMi, "mfr", "high", `${rangeNote}. ${NOT_YET_EPA}`, rangeSrc) },
    charging,
    warranty,
    abstains: { heatPump: HP_ABSTAIN },
  });

  R.push(
    cayenne("cayenne-electric-2026", "Cayenne Electric", [], ["AA2X1"], 317, "322 mi with the Range Setup option", RANGE_PAGE),
    cayenne(
      "cayenne-s-electric-2026",
      "Cayenne Electric",
      ["Cayenne S Electric"],
      ["AB2X1"],
      299,
      "325 mi with the Range Setup option",
      RANGE_PAGE
    ),
    cayenne(
      "cayenne-turbo-electric-2026",
      "Cayenne Electric",
      ["Cayenne Turbo Electric"],
      ["AD2X1"],
      298,
      "303 mi on the 21-inch all-season tire fitment",
      RANGE_PAGE
    ),
    cayenne(
      "cayenne-coupe-electric-2026",
      "Cayenne Coupe Electric",
      ["Cayenne Electric Coupe"],
      ["BA2X1"],
      326,
      "339 mi with the Range Setup option",
      RANGE_PAGE
    ),
    cayenne(
      "cayenne-s-coupe-electric-2026",
      "Cayenne Coupe Electric",
      ["Cayenne S Coupe Electric", "Cayenne S Electric Coupe"],
      ["BB2X1"],
      316,
      "330 mi with the Range Setup option",
      RANGE_PAGE
    ),
    cayenne(
      "cayenne-turbo-coupe-electric-2026",
      "Cayenne Coupe Electric",
      ["Cayenne Turbo Coupe Electric", "Cayenne Turbo Electric Coupe"],
      ["BD2X1"],
      302,
      "307 mi on the 21-inch all-season tire fitment",
      RANGE_PAGE
    )
  );
}

// ── Chevrolet Blazer EV Police Pursuit Vehicle ──────────────────────────────
{
  const GM_NACS_TABLE = "https://news.gm.com/home.detail.html/Pages/topic/us/en/2026/aug/0813-electric-vehicle-nacs-charging.html";
  // The 2022 announcement (media.chevrolet.com/.../2022/aug/0816-blazerevppv.html)
  // is where "the largest possible Ultium battery available for this Blazer EV
  // PPV", "based off the Blazer EV SS retail model" and "Final specifications
  // and range will be available closer to launch" come from. It is quoted in
  // the pack note and the MY2024 range abstention below.
  const GM_2025_ARTICLE =
    "https://news.gm.com/home.detail.html/Pages/topic/us/en/2025/sep/0904-Electrifying-public-safety-Chevrolet-Blazer-EV-PPV.html";
  const SHEET_2026 =
    "https://www.gmfleet.com/content/dam/gmfleet/na/us/en/index/fleet/police/blazer-ev-ppv/pdf/2026%20Chevrolet%20Blazer%20EV%20Police%20Pursuit%20Vehicle.pdf";
  const SPEC_2027 =
    "https://www.gmfleet.com/content/dam/gmfleet/na/us/en/index/fleet/suvs-crossovers/pdfs/2027_BLAZER_EV_PPV_Specification_Guide_V072826.pdf";
  const FLEET_PAGE = "https://www.gmfleet.com/vehicles/police/chevrolet-blazer-ppv-ev";

  // Verbatim from data2.ts, which is where the owner's 2026-08-26 decision
  // was recorded. One nameplate, one answer.
  const GM_HP_ABSTAIN =
    "GM does not name cabin-heating hardware in its own vehicle documents - even the Blazer EV owner manual, whose press release touts the Ultium heat pump, never says the words. The control test is the 2027 Bolt, whose GM press release DOES name one: GM states it when it means to, so silence on the other cars is evidence rather than an omission. These rows previously asserted `standard` from the platform-wide Ultium claim plus a trade-press writeup - the same source class that produced the falsified Volvo heat-pump claim. Owner decision 2026-08-26: abstain.";

  const battery = {
    packGrossKwh: f(
      102,
      "est",
      "medium",
      "GM's 2027 Blazer EV PPV Specification Guide reads “102 kWh Battery Rated Energy, 190 kW DC fast charging capable”, and its 2022 announcement calls the PPV's pack “the largest possible Ultium battery available” on a car “based off the Blazer EV SS retail model”. No GM document states a capacity for the MY2024-26 police car itself, and vPIC's 85.00 is a model-level constant — every MY2024 Blazer EV pattern reads it, including the 102 kWh RWD car",
      SPEC_2027
    ),
  };

  const port = {
    portStandard: f<"CCS1">("CCS1", "mfr", "high", undefined, GM_NACS_TABLE),
    superchargerAccess: f<"adapter">("adapter", "mfr", "high", "GM NACS DC adapter", GM_NACS_TABLE),
  };

  const warranty = {
    batteryYears: f(8, "mfr", "high", "“an 8-year/100,000-mile limited battery warranty on eligible EVs”, GM Fleet", FLEET_PAGE),
    batteryMiles: f(100_000, "mfr", "high", undefined, FLEET_PAGE),
  };

  const ppv = (id: string, year: number, over: Partial<EnrichmentRow>): EnrichmentRow => ({
    id,
    make: "CHEVROLET",
    model: "Blazer EV Police Package",
    // "Blazer EV" is here on purpose — see the header. Every one of these
    // rows is walled off from a retail Blazer by `vds`.
    modelAliases: ["Blazer EV PPV", "Blazer EV Police Pursuit Vehicle", "Blazer EV Police", "Blazer EV"],
    modelYears: [year, year],
    drive: "AWD",
    vds: ["KDFRL"],
    packVariant: "Police Pursuit Vehicle",
    battery,
    charging: port,
    warranty,
    ...over,
  });

  R.push(
    ppv("blazer-ev-ppv-2024", 2024, {
      abstains: {
        heatPump: GM_HP_ABSTAIN,
        epaRangeMi:
          "GM published no MY2024 figure — its announcement said only that “Final specifications and range will be available closer to launch” — and fueleconomy.gov has no police-package record in any year, while listing every retail Blazer EV variant for the same years",
      },
    }),
    ppv("blazer-ev-ppv-2025", 2025, {
      range: {
        mfrRangeMi: f(
          297,
          "mfr",
          "high",
          "“an EPA-estimated 297 miles of range”, GM's own MY2025 Blazer EV PPV article; fueleconomy.gov carries no police-package record, so this is GM's number rather than a rating we can cite an id for",
          GM_2025_ARTICLE
        ),
      },
      abstains: { heatPump: GM_HP_ABSTAIN },
    }),
    ppv("blazer-ev-ppv-2026", 2026, {
      charging: {
        ...port,
        dcPeakKw: f(190, "mfr", "high", "“DC fast charging for public charging rates up to 190 kW”", SHEET_2026),
        acOnboardKw: f(19, "mfr", "high", "“19-kW Level 2 (AC) charging capability”", SHEET_2026),
      },
      abstains: {
        heatPump: GM_HP_ABSTAIN,
        epaRangeMi:
          "GM's own 2026 Blazer EV PPV specialty sheet prints “EPA-ESTIMATED TBD MILES Of Range” where the figure goes, and fueleconomy.gov has no police-package record in any year",
      },
    })
  );
}

// ── Rolls-Royce Spectre ─────────────────────────────────────────────────────
{
  const PR_SPECTRE =
    "https://www.press.rolls-roycemotorcars.com/rolls-royce-motor-cars-pressclub/article/detail/T0422818EN/rolls-royce-spectre:-the-rolls-royce-that-changes-everything?language=en";
  const US_CHARGING = "https://www.rolls-roycemotorcars.com/en_US/ownership/charging.html";
  const W24 =
    "https://www.rolls-roycemotorcars.com/content/dam/rrmc/marketUK/rollsroycemotorcars_com/5-5-ownership-services/your-motor-car/components/RR_MY2024_MaintenanceAndWarranty_Final.pdf";
  const W25 =
    "https://www.rolls-roycemotorcars.com/content/dam/rrmc/marketUK/rollsroycemotorcars_com/5-5-ownership-services/your-motor-car/components/RR_MY2025_MaintenanceAndWarranty_2024-10-31_final.pdf";
  const W26 =
    "https://www.rolls-roycemotorcars.com/content/dam/rrmc/marketUK/rollsroycemotorcars_com/5-5-ownership-services/your-motor-car/components/RR_MY26_MaintenanceAndWarranty_2025-10-02_Print.pdf";

  const COMMERCIAL_CARVE_OUT =
    "commercially used vehicles, for example limousine or rental cars, are limited to 10 years/100,000 miles on the HV battery";

  const battery = {
    packUsableKwh: f(
      102,
      "mfr",
      "high",
      "Rolls-Royce's technical table: “LITHIUM-ION BATTERY / Net capacity / 102 kWh” (the release's prose says “Spectre has a 102kWh lithium-ion battery”)",
      PR_SPECTRE
    ),
  };

  const charging = {
    dcPeakKw: f(
      195,
      "mfr",
      "high",
      "“When charging at DC charging stations, Spectre is capable of a maximum charging capacity of 195kW”",
      US_CHARGING
    ),
    chargeTime1080Min: f(34, "mfr", "high", "“it charges from 10-80% in 34 minutes”, in optimal conditions", US_CHARGING),
  };

  const PORT_ABSTAIN =
    "No Rolls-Royce document states the connector: the US charging page, both Spectre press releases and the Black Badge release all describe DC and AC charging without naming one, and web.archive.org was offline this pass, so the port-by-model-year rule leaves this silent rather than borrowing a sibling BMW Group figure";
  const HP_ABSTAIN =
    "Rolls-Royce never uses the term for the Spectre in any material read this pass, and the control test is inside the same group: BMW's own releases name a heat pump for its battery-electric cars plainly, so this silence is not a writing convention that can be read either way";

  const wr = (years: number, url: string, note: string) => ({
    batteryYears: f(years, "mfr", "high", note, url),
  });

  const spectre = (
    id: string,
    year: number,
    vds: string[],
    modelAliases: string[],
    rangeMi: number,
    otherWheel: number,
    epaId: number,
    warranty: EnrichmentRow["warranty"],
    sohFloorPct?: Fact<number>
  ): EnrichmentRow => ({
    id,
    make: "ROLLS-ROYCE",
    model: "Spectre",
    modelAliases,
    modelYears: [year, year],
    drive: "AWD",
    vds,
    battery,
    range: {
      epaRangeMi: f(
        rangeMi,
        "mfr",
        "high",
        `23-inch wheels; ${otherWheel} mi on 22-inch. Rolls-Royce publishes no standard/optional wheel marker, so the row carries the lower of the two certified figures`,
        epa(epaId)
      ),
    },
    charging,
    warranty: sohFloorPct ? { ...warranty, sohFloorPct } : warranty,
    abstains: { portStandard: PORT_ABSTAIN, heatPump: HP_ABSTAIN },
  });

  const BB_ALIASES = ["Black Badge Spectre", "Spectre Black Badge"];

  R.push(
    spectre(
      "spectre-2024",
      2024,
      ["TK2C0"],
      [],
      266,
      291,
      47481,
      wr(
        10,
        W24,
        `“Rolls-Royce Motor Cars warrants the high-voltage (traction) battery assembly in the Battery Electric Vehicles (BEV) against defects in materials or workmanship for a period of 10 years/unlimited miles”; ${COMMERCIAL_CARVE_OUT}`
      )
    ),
    spectre(
      "spectre-2025",
      2025,
      ["TK2C0"],
      [],
      253,
      277,
      48443,
      wr(10, W25, `“for a period of 10 years/unlimited miles”, MY2025 booklet; ${COMMERCIAL_CARVE_OUT}`)
    ),
    spectre(
      "spectre-2026",
      2026,
      ["TK2C0"],
      [],
      253,
      277,
      49980,
      wr(
        15,
        W26,
        `“for a period of 15 years / unlimited miles, or 10 years / 100,000 miles for commercially used vehicles, for example, limousine or rental cars”`
      ),
      f(
        70,
        "mfr",
        "high",
        "The MY2026 booklet's CALIFORNIA BEV CAPACITY COVERAGE section covers capacity loss below 70 percent for the full term in California and CARB states; its p.46 figure of 80 percent holds only for the first 10 of the 15 warranted years, so 80 would overstate the coverage",
        W26
      )
    ),
    spectre(
      "spectre-black-badge-2024",
      2024,
      ["TK4C0"],
      BB_ALIASES,
      264,
      280,
      47479,
      wr(10, W24, `“for a period of 10 years/unlimited miles”, MY2024 booklet; ${COMMERCIAL_CARVE_OUT}`)
    ),
    spectre(
      "spectre-black-badge-2025",
      2025,
      ["TK4C0"],
      BB_ALIASES,
      251,
      266,
      48441,
      wr(10, W25, `“for a period of 10 years/unlimited miles”, MY2025 booklet; ${COMMERCIAL_CARVE_OUT}`)
    ),
    spectre(
      "spectre-black-badge-2026",
      2026,
      ["TK4C0"],
      BB_ALIASES,
      251,
      266,
      49978,
      wr(
        15,
        W26,
        `“for a period of 15 years / unlimited miles, or 10 years / 100,000 miles for commercially used vehicles, for example, limousine or rental cars”`
      ),
      f(
        70,
        "mfr",
        "high",
        "The MY2026 booklet's CALIFORNIA BEV CAPACITY COVERAGE section covers capacity loss below 70 percent for the full term in California and CARB states; its p.46 figure of 80 percent holds only for the first 10 of the 15 warranted years, so 80 would overstate the coverage",
        W26
      )
    )
  );
}

// ── Lamborghini Revuelto ────────────────────────────────────────────────────
{
  const BROCHURE_2026 =
    "https://www.lamborghini.com/original/DAM/lamborghini/0_facelift_2025/model_details/revuelto/2026/brochure/03_05/Lamborghini_REVUELTO_DIGITAL_BROCHURE_EN_2026_WCAG.pdf";
  // The 2023 launch brochure
  // (lamborghini.com/original/DAM/lamborghini/facelift_2019/model_detail/revuelto/brochure/LB744_REVUELTO_DIGITAL_BROCHURE_ENG_0.pdf)
  // carries the identical powertrain table with the identical battery line and
  // the identical warranty sentence, which is what lets one row span 2024-25;
  // its consumption rows are still "in the type approval stage", so the US
  // figures below all come from the 2026 brochure. Lamborghini's own Revuelto
  // news release (lamborghini.com/en-en/news/lamborghini-revuelto-the-first-
  // super-sports-v12-hybrid-hpev) is the second, disagreeing warranty source
  // quoted in the mileage note.
  const ERG =
    "https://www.lamborghini.com/original/DAM/lamborghini/legal/emergency/2024/10_16_revuelto/REVUELTO%20EMERGENCY%20RESPONSE%20GUIDE_V7.pdf";
  const PACK_ABSTAIN =
    "Lamborghini publishes no capacity: its technical-specification table gives the hybrid system's battery as “Lithium-ion high specific power battery with pouch cells” in both the 2023 and the 2026 brochure, the emergency response guide states only 400 V, and vPIC carries no BatteryKWh for any Revuelto VIN. The widely repeated 3.8 kWh appears in no Lamborghini document read this pass";
  const HP_ABSTAIN =
    "No Lamborghini document uses the term for this car: the brochures' powertrain table names the cooling system as “Liquid cooled - dedicated circuit for HV components” and stops there, and the emergency response guide describes the thermal system without it";

  const charging = {
    portStandard: f<"J1772">(
      "J1772",
      "mfr",
      "high",
      "Lamborghini's Revuelto emergency response guide lists the sockets its hybrids carry as “Charging socket type 1 AC (e.g. in NAR, South Korea, Japan)”, type 2 for the EU and GB/T for China; type 1 AC is J1772 and NAR is this market. The socket sits in the frunk",
      ERG
    ),
    dcFastCharging: f<"none">(
      "none",
      "mfr",
      "medium",
      "The same responder table enumerates three AC socket types and no DC socket, and no Lamborghini document read this pass mentions DC charging for the Revuelto",
      ERG
    ),
    architectureV: f(400, "mfr", "high", "“Voltage 400”, Revuelto row of the emergency response guide's identification table", ERG),
  };

  const warranty = {
    batteryYears: f(
      8,
      "mfr",
      "high",
      "“The Revuelto comes with a 3-year warranty and a 8-year warranty for the battery up to 160,000 Km/75,000 miles”",
      BROCHURE_2026
    ),
    batteryMiles: f(
      75_000,
      "mfr",
      "medium",
      "Lamborghini's brochures say “160,000 Km/75,000 miles” and its own news release says “8 years or 160.000 km (100.000 mls)” for the same term; the lower figure is carried because overstating coverage is the expensive error",
      BROCHURE_2026
    ),
  };

  const revuelto = (id: string, years: [number, number], mpgSrc: string, mpgNote: string): EnrichmentRow => ({
    id,
    make: "LAMBORGHINI",
    model: "Revuelto",
    modelYears: years,
    drive: "AWD",
    vds: ["UC1ZM"],
    packVariant: "PHEV",
    plugIn: true,
    range: {
      epaRangeMi: f(
        5,
        "mfr",
        "high",
        "“ZERO EMISSION RANGE (EPA) 5 miles” in Lamborghini's own technical-specification table; fueleconomy.gov files the Revuelto as a plain hybrid with an empty rangeA, so EPA's database holds no electric-only figure to cite",
        BROCHURE_2026
      ),
      mpgGasoline: f(12, "mfr", "high", mpgNote, mpgSrc),
      mpgeCombined: f(
        23,
        "mfr",
        "high",
        "“FOR US CONSUMERS: EPA ESTIMATED COMBINED FUEL ECONOMY (ELECTRICITY+GASOLINE): 23 MPGE”",
        BROCHURE_2026
      ),
    },
    charging,
    warranty,
    abstains: { packUsableKwh: PACK_ABSTAIN, heatPump: HP_ABSTAIN },
  });

  R.push(
    revuelto(
      "revuelto-2024-25",
      [2024, 2025],
      epa(48452),
      "EPA's comb08 for MY2024 (id 48452) and MY2025 (id 48581) is 12 in both years, matching the brochure's “COMBINED FUEL ECONOMY (GASOLINE ONLY): 12 MPG”"
    ),
    revuelto(
      "revuelto-2026",
      [2026, 2026],
      BROCHURE_2026,
      "“COMBINED FUEL ECONOMY (GASOLINE ONLY): 12 MPG”; fueleconomy.gov's 2026 Lamborghini menu carries no Revuelto"
    )
  );
}

export const RESEARCH_ROWS_21: EnrichmentRow[] = R;
