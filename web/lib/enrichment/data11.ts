import type { Chemistry, EnrichmentRow, Fact, PortStandard, Source } from "../types";

// Eleventh research tranche (2026-08-25): the commercial vans, plus the
// S-Class plug-in hybrids — cohorts the corpus had never touched at all.
//
// THE VANS ARE A DIFFERENT RESEARCH PROBLEM FROM EVERY OTHER ROW IN THIS
// CORPUS, and the difference is worth stating once here rather than four
// times below. Every passenger EV in data.ts through data9.ts carries an
// `epaRangeMi` that came from fueleconomy.gov, because EPA rates every car
// under its light-duty labelling programme. It does not rate these. All four
// vans sit above the GVWR threshold for that programme, and the consequence
// is not "we could not find the number" — it is that no government-certified
// range figure for these vehicles exists, in the way it does not exist for
// the Escalade IQ and the Class-3 Silverados already in data3.ts.
//
// Control-tested against fueleconomy.gov's REST API on 2026-08-25, because a
// negative asserted from a failed lookup is not a negative:
//   menu/model?year=2024..2027&make=Ford      — no Transit of any kind. 2022
//     and 2023 carry Transit CONNECT and a Transit T150 Wagon FFV, both below
//     the threshold, and no E-Transit in any year.
//   menu/model?year=2024..2026&make=Ram       — 1500 pickups only. No
//     ProMaster, electric OR gasoline, which is the control: the exemption is
//     the body class, not this one drivetrain.
//   menu/model?year=2024..2026&make=Mercedes-Benz — no Sprinter of any kind.
//   menu/model?year=2023..2026&make=Chevrolet — no BrightDrop, no Zevo. And
//     menu/make?year=2025 does not list BrightDrop as a make at all, so it is
//     not filed under its own badge either.
// Ford, Ram, Mercedes-Benz and Chevrolet are all present in those same
// responses with dozens of other models, so the make is in the database and
// the van is not. GM says the same thing in its own words, in the footnote to
// every range figure it publishes for the BrightDrop: "EPA estimates not yet
// available."
//
// So these rows follow data3.ts's Escalade IQ shape exactly: `abstains` on
// epaRangeMi, and the manufacturer's own figure in a buyer note that says in
// its own words that it is not an EPA rating. EnrichmentReport prints that
// field under the literal label "EPA range"; a maker's estimate placed there
// reads as a government number, and on a work van bought on a range budget
// that is the expensive direction.
//
// HEAT PUMPS: every van row here abstains, and none of them says "none".
// That is the standing rule for GM and Stellantis (no engineering primary,
// no claim), and the same silence turned out to hold for Mercedes' vans and
// for all four S-Class plug-ins. Each abstention below names the control test
// that makes the silence meaningful — the documents itemise heated seats,
// heated windshields and heated steering wheels at option-code granularity,
// so a heat pump marketed as a feature would appear — and each stops short of
// asserting absence, because none of those documents states the cabin heating
// MECHANISM at all.
//
// SOURCING, same bar as data6 and data9: every battery, charging, thermal and
// warranty fact below comes from a manufacturer document fetched during this
// pass and read in its own words. Where a figure lives in a PDF table it was
// read from a RENDERED page, not from extracted text. Nothing here came from
// a search snippet or from memory, and where a document does not state a
// thing the row abstains and says why.
const AS_OF = "2026-08-25";

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

// ───────────────────────────── FORD E-TRANSIT ──────────────────────────────
//
// vPIC decodes every E-Transit as make FORD, model "Transit" — the same string
// it returns for the gasoline Transit — while the dealer feed spells it seven
// ways ("E-Transit", "E-Transit-350", "E-Transit-350 Cargo", "E-Transit-350
// Cargo Van", "E-Transit Cargo Van", "E-Transit 350", "Transit Electric"). So
// the bare nameplate has to be an alias, and it has to be guarded, or a petrol
// Transit pasted into /vin/ would be handed a battery.
//
// THE GUARD IS VIN POSITION 8, Ford's own engine code, the same mechanism
// data4.ts uses for the F-150 Lightning and the Mach-E. Swept one character at
// a time through vPIC's partial-VIN decoder on 2026-08-25, on the 1FTBW1Y?
// descriptor, for every model year 2022 through 2027:
//   K → Electric (2022, 2023, 2024, 2025)
//   M → Electric (2023 onward; the only electric code left by 2026, where it
//       also carries BatteryKWh 89)
//   S → Electric, BatteryKWh 96 (2026 only)
//   G, 8 → Gasoline, DisplacementL 3.5
// Nothing else decodes. The rows below key `vin8` on the electric codes only,
// which is what makes the bare "Transit" alias safe on both surfaces.
//
// NOT keyed on position 8 for the PACK, deliberately, and this is the one
// thing a later reader is most likely to want to change. K and M track Ford's
// sales codes 99K (68 kWh Standard Range) and 99M (89.9 kWh Enhanced Range)
// suspiciously well — 99K is deleted for MY2025 and gone by MY2026, exactly
// where K stops decoding — but no Ford document publishes a VIN table for this
// van (both Ford body decoders it points at are JavaScript apps that serve no
// table), and vPIC decodes M as electric in MY2023, a year before the 89.9 kWh
// pack shipped. That inconsistency is enough to keep it a hypothesis. MY2024
// is the only year both packs were sold, and its row abstains on capacity
// rather than resolve it on an unverified code.
//
// RANGE — abstained on every row, and this van is the cleanest case in the
// file. Ford states the reason in its own Transit order guides: "TRUCKS W/
// GROSS VEHICLE WEIGHT RATINGS OVER 8,500 POUNDS ARE NOT INCLUDED IN THE EPA
// FUEL ECONOMY RATING SYSTEM." vPIC puts the E-Transit at 9,500 lb. Every
// range figure Ford has published for it is Ford's own and Ford labels it so:
// "targeted range… based on analytical projection consistent with US EPA MCT
// drive cycle methodology" (MY2022, 126 miles), "estimated range of up to 159
// miles" (MY2024), and for MY2025 a four-cell table where only the first cell
// was measured — "Low Roof model demonstrated range reflecting current
// capability based on testing consistent with U.S. EPA MCT drive cycle
// methodology at ALVW… Medium Roof and High Roof models projected range
// reflecting capability based on CAE analytical adjustments". MY2026 and
// MY2027 have no published range at all: the 2026 Transit spec sheet is
// gasoline-only.
//
// HEAT PUMP — three answers, not one, and the middle one is an abstention.
// Ford's 2026 order guide lists "Vapor Injection Heat pump becomes standard on
// E-Transit" under MECHANICAL New/Changed, which is the same New/Changed
// marker data4.ts uses as its control for the Lightning's 2022-23 negative. On
// that reading MY2022-2023 vans have none, and their order guides do itemise
// heated seats, heated mirrors, an engine block heater and an auxiliary heater
// package, so a heat pump would have appeared. But the MY2024 US owner's
// manual splits its air-conditioning refrigerant capacity table for
// "VEHICLES BUILT FROM: 03/2024, BATTERY ELECTRIC VEHICLE, VEHICLES WITH:
// EXTENDED RANGE BATTERY" into "Vehicles with heat pump" and "Vehicles without
// heat pump" — while the standard-range section has a single undifferentiated
// row. Ford's own service data therefore contemplates a heat-pump build of the
// extended-range van two model years before its marketing says the feature
// arrives. So MY2024-2025 abstains rather than printing a "none" that Ford's
// service documentation contradicts.
{
  const OG_24 =
    "https://www.fromtheroad.ford.com/content/dam/fordmediasite/us/en/library/2024/order-guides/2024_Ford_Transit_Order_Guide.pdf";
  const OG_25 =
    "https://www.fromtheroad.ford.com/content/dam/fordmediasite/us/en/library/2025/order-guides/2025_Ford_Transit_Order_Guide.pdf";
  const OG_26 =
    "https://www.fromtheroad.ford.com/content/dam/fordmediasite/us/en/library/2026/order-guides/2026_Ford_Transit_Order_Guide.pdf";
  const SPECS_25 =
    "https://www.fromtheroad.ford.com/content/dam/fordmediasite/us/en/library/2025/specs/2025-Transit-Technical-Specs.pdf";
  const BEV_WARRANTY_26 =
    "https://www.fordservicecontent.com/Ford_Content/Catalog/owner_information/26MY_US_Ford_ETRANSIT_WTY_Version1.pdf";
  const BEV_WARRANTY_23 =
    "https://www.fordservicecontent.com/Ford_Content/Catalog/owner_information/US_Ford_BEV_Warranty_Guide_version_2_9.29.22.pdf";
  const ERG_22 =
    "https://www.fordservicecontent.com/ford_content/catalog/motorcraft/2022-E-Transit-Emergency-Response-Guide.pdf";
  const ENHANCED_RANGE_NEWS =
    "https://www.fromtheroad.ford.com/us/en/articles/2024/ford-pro-ships-e-transit-with-enhanced-range";
  const NACS_HOWTO =
    "https://www.ford.com/support/how-tos/electric-vehicles/public-charging/how-do-i-get-a-fast-charging-adapter-nacs/";
  const RECALL_HALFSHAFT = "https://www.nhtsa.gov/recalls?nhtsaId=25V860000";
  const RECALL_HV_BOLTS = "https://www.nhtsa.gov/recalls?nhtsaId=26V062000";

  const ET_ALIASES = [
    "Transit",
    "E-Transit",
    "E-Transit 350",
    "E-Transit-350",
    "E-Transit Cargo Van",
    "E-Transit-350 Cargo",
    "E-Transit-350 Cargo Van",
    "E-Transit-350 Cutaway",
    "Transit Electric",
  ];
  const ET_RANGE_ABSTAIN =
    "Ford's own Transit order guides state that trucks over 8,500 lb GVWR are not included in EPA's fuel-economy rating system, this van is rated 9,500 lb, and fueleconomy.gov holds no E-Transit in any year; Ford's figures are its own targeted, estimated or simulated numbers and stay in the buyer note";
  const ET_WARRANTY = (src: string) => ({
    batteryYears: f(8, "mfr", "high", undefined, src),
    batteryMiles: f(100_000, "mfr", "high", undefined, src),
    sohFloorPct: f(70, "mfr", "high", "65% on cutaway and chassis cab configurations", src),
    batteryTransfers: f(true, "mfr", "high", undefined, src),
  });
  const HALFSHAFT_NOTE = {
    headline: "Recall 25V860000 covers every 2022-2025 E-Transit — a half shaft that can disengage",
    body:
      "NHTSA campaign 25V860000, opened December 2025: “The left rear axle half shaft may partially disengage from the power drive unit, which can result in a loss of drive power,” with an added rollaway risk when parked. It covers the 2022, 2023, 2024 and 2025 model years. Check the VIN against NHTSA's recall lookup and ask the seller for proof the remedy was performed.",
    severity: "trap" as const,
    resolvedBy: "campaign_check" as const,
    learnMore: RECALL_HALFSHAFT,
  };
  const NO_TOW_NOTE = {
    headline: "Ford publishes no tow rating for the E-Transit, and will not sell it a trailer brake controller",
    body:
      "The 2026 Transit order guide marks the Trailer Brake Controller and the RV Prep Package (which bundles the Heavy-Duty Trailer Tow Package) “Not available with E-Transit”, and the maximum 6,900 lb conventional tow rating Ford quotes for the Transit line is footnoted as not applying to the electric van. There is no rated figure to quote for this vehicle.",
    severity: "info" as const,
    learnMore: OG_26,
  };
  const etRangeNote = (body: string, learnMore: string) => ({
    headline: "No EPA range exists for this van — Ford's figure is Ford's own",
    body,
    severity: "warning" as const,
    learnMore,
  });

  R.push({
    id: "e-transit-2022-23",
    make: "FORD",
    model: "Transit",
    modelAliases: ET_ALIASES,
    modelYears: [2022, 2023],
    vin8: ["K", "M"],
    abstains: { epaRangeMi: ET_RANGE_ABSTAIN },
    battery: { packUsableKwh: f(68, "mfr", "high", "Ford's only pack for these years", ERG_22) },
    charging: {
      portStandard: f<PortStandard>("CCS1", "est", "medium", "SAE J1772 CCS combo inlet", OG_26),
      dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, OG_26),
      architectureV: f(400, "mfr", "high", undefined, ERG_22),
    },
    thermal: {
      heatPump: f<"none">(
        "none",
        "mfr",
        "high",
        "Resistive heater only; the heat pump arrives for 2026",
        OG_26
      ),
    },
    warranty: ET_WARRANTY(BEV_WARRANTY_23),
    buyerNotes: [
      etRangeNote(
        "Ford published one range figure for the MY2022 E-Transit — 126 miles — and called it a target rather than a rating: “USA targeted range reflecting current capability based on analytical projection consistent with US EPA MCT drive cycle methodology”, with a second footnote adding “manufacturer computer engineering simulations”. It applies to the low-roof cargo van; Ford published no separate figure for the medium roof, high roof, chassis cab or cutaway, and reused the low-roof number on those pages with the footnote unchanged. fueleconomy.gov has never carried an E-Transit, and Ford's own order guides explain why: trucks over 8,500 lb GVWR are outside EPA's rating system.",
        ERG_22
      ),
      HALFSHAFT_NOTE,
      NO_TOW_NOTE,
    ],
  });

  R.push({
    id: "e-transit-2024",
    make: "FORD",
    model: "Transit",
    modelAliases: ET_ALIASES,
    modelYears: [2024, 2024],
    vin8: ["K", "M"],
    abstains: {
      epaRangeMi: ET_RANGE_ABSTAIN,
      packUsableKwh:
        "MY2024 is the only year Ford sold both the 68 kWh and the 89.9 kWh pack, vPIC files no battery capacity for any E-Transit of that year, and the VIN code that appears to separate them is not published in any Ford document",
      heatPump:
        "Ford's marketing introduces the heat pump for MY2026, but its MY2024 service manual already splits refrigerant capacity between vehicles with and without one on extended-range vans built from March 2024, so neither a yes nor a no would be true of the whole year",
    },
    charging: {
      portStandard: f<PortStandard>("CCS1", "est", "medium", "SAE J1772 CCS combo inlet", OG_26),
      dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, OG_26),
      acOnboardKw: f(19.2, "mfr", "high", "Dual onboard chargers, new for 2024", ENHANCED_RANGE_NEWS),
    },
    warranty: ET_WARRANTY(BEV_WARRANTY_23),
    buyerNotes: [
      etRangeNote(
        "Ford quotes “an estimated range of up to 159 miles with 89 kWh of usable energy” for the MY2024 Enhanced Range van, and it is Ford's estimate rather than an EPA rating — fueleconomy.gov has never carried an E-Transit, because Ford's own order guides state that trucks over 8,500 lb GVWR sit outside EPA's rating system and this van is rated 9,500 lb. The 68 kWh van Ford continued to sell as a fleet-only option that year has no MY2024 figure of its own.",
        ENHANCED_RANGE_NEWS
      ),
      {
        headline: "Two battery sizes shipped in 2024 — 68 kWh and 89.9 kWh — and nothing in the listing says which",
        body:
          "Ford's 2024 order guide carries both: sales code 99K, “Electric Motor (E-Transit) with 68kWH Standard Range High-Voltage Battery… Fleet only option”, and 99M, “Electric Motor (E-Transit Enhanced Range) with 89.9kWH High-Voltage Battery”, which became standard on 148-inch cargo vans and 178-inch chassis cabs for vehicles built on or after 17 June 2024. vPIC files no battery capacity for any 2024 E-Transit, so the VIN cannot settle it either. Ask for the window sticker or the build sheet — the difference is roughly 30% of the van's range.",
        severity: "warning",
        learnMore: OG_24,
      },
      HALFSHAFT_NOTE,
      NO_TOW_NOTE,
    ],
  });

  R.push({
    id: "e-transit-2025",
    make: "FORD",
    model: "Transit",
    modelAliases: ET_ALIASES,
    modelYears: [2025, 2025],
    vin8: ["K", "M"],
    abstains: {
      epaRangeMi: ET_RANGE_ABSTAIN,
      heatPump:
        "Ford's marketing introduces the heat pump for MY2026, but its MY2024 service manual already splits refrigerant capacity between vehicles with and without one on extended-range vans, so a flat no would contradict Ford's own service data",
    },
    battery: { packUsableKwh: f(89, "mfr", "high", "Ford's Enhanced-Range pack, the only one left for 2025", SPECS_25) },
    charging: {
      portStandard: f<PortStandard>("CCS1", "est", "medium", "SAE J1772 CCS combo inlet", OG_26),
      dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, SPECS_25),
      dcPeakKw: f(176, "mfr", "high", undefined, SPECS_25),
      chargeTime1080Min: f(28, "mfr", "medium", "10–80% on a 180 kW or faster DC station, from Ford's simulation", SPECS_25),
      acOnboardKw: f(19.2, "mfr", "high", "Dual onboard chargers, standard this year", SPECS_25),
      superchargerAccess: f<"adapter">("adapter", "mfr", "medium", "Through Ford's NACS adapter, which a dealer must enable on this van", NACS_HOWTO),
    },
    warranty: ET_WARRANTY(BEV_WARRANTY_26),
    buyerNotes: [
      etRangeNote(
        "Ford's 2025 E-Transit spec sheet gives four range figures by roof height — 159 miles low roof, 148 medium, 143 high, 142 extended-body high — and only the first was measured. Its own footnote says the low-roof figure is “demonstrated range reflecting current capability based on testing consistent with U.S. EPA MCT drive cycle methodology at ALVW”, while “Medium Roof and High Roof models projected range reflecting capability based on CAE analytical adjustments from tested vehicle and adjusted for roof height”. None of the four is an EPA rating; fueleconomy.gov has never carried an E-Transit, because trucks over 8,500 lb GVWR sit outside EPA's rating system. Ford publishes no chassis cab or cutaway range in any model year.",
        SPECS_25
      ),
      HALFSHAFT_NOTE,
      NO_TOW_NOTE,
    ],
  });

  R.push({
    id: "e-transit-2026-27",
    make: "FORD",
    model: "Transit",
    modelAliases: ET_ALIASES,
    modelYears: [2026, 2027],
    // M is the only position-8 code that still decodes electric from MY2026:
    // K stops being a valid pattern, which is where Ford's 99K sales code was
    // deleted. See the block comment above.
    vin8: ["M"],
    abstains: { epaRangeMi: ET_RANGE_ABSTAIN },
    battery: { packUsableKwh: f(89, "mfr", "high", undefined, OG_26) },
    charging: {
      portStandard: f<PortStandard>("CCS1", "mfr", "high", "SAE J1772 CCS, charging on 120V, 240V and DC fast", OG_26),
      dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, OG_26),
      acOnboardKw: f(11.2, "mfr", "high", "A single onboard charger is standard for 2026; dual chargers are optional", OG_26),
      superchargerAccess: f<"adapter">("adapter", "mfr", "medium", "Through Ford's NACS adapter, which a dealer must enable on this van", NACS_HOWTO),
    },
    thermal: { heatPump: f<"standard">("standard", "mfr", "high", "Vapor injection heat pump", OG_26) },
    warranty: ET_WARRANTY(BEV_WARRANTY_26),
    buyerNotes: [
      etRangeNote(
        "Ford publishes no range figure at all for the MY2026 E-Transit: the 2026 Transit technical specification sheet contains no electric content, and Ford's own “What's New for 2026” article gives motor output and battery size without a range. The newest figures Ford has published are the MY2025 sheet's — 159 miles low roof, and 148/143/142 for the taller bodies, of which only 159 was measured. There has never been an EPA rating for this van; trucks over 8,500 lb GVWR sit outside EPA's rating system.",
        OG_26
      ),
      {
        headline: "AC charging halved for 2026 — 11.2 kW standard where 2024-25 vans had 19.2 kW",
        body:
          "The 2026 order guide's New/Changed list reads “Single On-board battery charger now standard on E-Transit – Dual on-board battery chargers become optional (65C)”, and standard equipment now specifies a Level 2 peak charging rate of 11.2 kW. A 2024 or 2025 van charged at 19.2 kW as standard. On a 89 kWh pack that is the difference between an overnight and a day-and-a-half fill on Level 2, so check whether option 65C was ordered.",
        severity: "warning",
        learnMore: OG_26,
      },
      {
        headline: "Recall 26V062000: high-voltage battery bolts that may be missing washers",
        body:
          "NHTSA campaign 26V062000, opened March 2026 and specific to the 2026 E-Transit: “Bolts inside the high-voltage battery pack may be missing washers, which can cause high electrical resistance or electrical arcing,” with a fire risk and a loss of drive power as the stated consequences. The remedy is an inspection and repair of the busbar fasteners, replacing the busbar where necessary. Check the VIN against NHTSA's recall lookup before buying.",
        severity: "trap",
        resolvedBy: "campaign_check",
        learnMore: RECALL_HV_BOLTS,
      },
      NO_TOW_NOTE,
    ],
  });
}

// ───────────────────────── RAM PROMASTER EV ────────────────────────────────
//
// One vehicle, one drivetrain, three bodies (Cargo Van high roof, Cargo Van
// super-high-roof extended, Step Van), MY2024-2026. Every EV-relevant figure
// is identical across all three: Stellantis' MY2026 fleet buyer's guide is the
// first to print Cargo Van and Step Van side by side and gives them a single
// shared powertrain row. Only payload and dimensions move, and this schema
// holds neither, so one row covers the lineage.
//
// THE MODEL STRING IS NINE DIFFERENT STRINGS. The feed files this van as
// "ProMaster 3500 EV", "ProMaster EV", "ProMaster Delivery Van BEV",
// "ProMaster 3500 Delivery Van BEV", and bare "ProMaster", in mixed casing
// that norm() already folds. vPIC calls it "ProMaster 3500" on every VIN
// decoded, with an empty Trim. All of those are aliases below.
//
// The bare "ProMaster" alias is the dangerous one — Ram sells a gasoline
// ProMaster — so this row is keyed on VIN POSITION 8, Stellantis' own engine
// code, the same mechanism data4.ts uses for the F-150 Lightning. Swept
// through vPIC's partial-VIN decoder on 2026-08-25, one character at a time:
//   3C6?RW?Z  → Electric, every model year 2024/2025/2026, three body letters
//               (A super-high-roof extended, E high roof, F high-roof
//               extended). Z is the ONLY position-8 code that decodes at all
//               on an ?RW? descriptor.
//   3C6?RV?G  → Gasoline 3.6 L, ProMaster 1500 / 2500.
// So position 8 = Z is the electric drive unit and G is the petrol V6. A row
// keyed `vin8: ["Z"]` therefore cannot reach a gasoline van however loosely
// its model aliases are written, which is what makes the bare nameplate safe
// here where a trim guard could not be (these listings carry no trim string
// at all — that is the whole problem).
//
// RANGE — abstained, and this is the case that most needed it. Ram prints
// "up to 162-mile" in all three fleet buyer's guides, and the prior research
// pass recorded that the 2024 and 2025 guides both footnote it "2025MY EPA
// estimates shown". Re-fetched and re-read as rendered images this pass: the
// MY2024 guide does NOT. Its footnote (34) reads "Based on manufacturer's
// estimates. Requires fully charged battery. Actual mileage may vary." Only
// MY2025's footnote (35) says EPA; MY2026's (28) is back to "Based on
// manufacturer's estimates". Ram's own consumer pages publish two more
// numbers again — 164 miles combined for the Cargo Van, 180 city for the Step
// Van — disclosed as "Based on manufacturer internal simulation data". One of
// five published figures carries an EPA attribution, on one of three model
// years. That is not an EPA rating, and the buyer note says so.
{
  const FBG_25 =
    "https://www.stellantisfleet.com/content/dam/fca-fleet/na/fleet/en_us/shopping-tools/brochures-literature/docs/buyers-guide/2025/25DOMFLT_FBG_PromasterEV.pdf";
  const FBG_26 =
    "https://www.stellantisfleet.com/content/dam/fca-fleet/na/fleet/en_us/shopping-tools/brochures-literature/docs/buyers-guide/2026/26DOMMOP_FBG_ProMasterEV.pdf";
  const HANDBOOK_26 =
    "https://vehicleinfo.mopar.com/assets/publications/en-us-ca/2026/Ram/ProMaster_ProMaster_EV/104116_26_VF_OH_EN_USC_DIGITAL_E2.pdf";
  const PRESS_25 = "https://media.stellantisnorthamerica.com/newsrelease.do?id=26196";
  const WARRANTY_24 =
    "https://vehicleinfo.mopar.com/assets/publications/en-us/Ram/2024/100588_24_R_HW_GW_EN_US_DIGITAL_E3.pdf";
  const WARRANTY_26 =
    "https://vehicleinfo.mopar.com/assets/publications/en-us-ca/2026/Warranties/104707_26_R_HD_GW_ENS_US_PR_DIGITAL_E1V1.pdf";
  const CAPABILITY = "https://www.ramtrucks.com/electric/ram-promaster-ev/capability.html";

  R.push({
    id: "ram-promaster-ev-2024-26",
    make: "RAM",
    model: "ProMaster 3500",
    modelAliases: [
      "ProMaster 3500 EV",
      "ProMaster EV",
      "ProMaster Delivery Van BEV",
      "ProMaster 3500 Delivery Van BEV",
      "ProMaster Delivery Van EV",
      "ProMaster Cargo Van EV",
      "ProMaster 3500 BEV",
      "ProMaster",
    ],
    modelYears: [2024, 2026],
    // Stellantis' electric drive unit. See the block comment: the only
    // position-8 code that decodes electric on this van, and the guard that
    // keeps the bare "ProMaster" alias off a gasoline van.
    vin8: ["Z"],
    abstains: {
      epaRangeMi:
        "This van's 9,350 lb GVWR puts it above EPA's light-duty labelling threshold and fueleconomy.gov holds no ProMaster of any kind, electric or gasoline; Ram's own 162-mile figure is a manufacturer estimate on two of three model years and stays in the buyer note",
      heatPump:
        "Fourteen Ram documents never use the words heat pump, but none of them states the cabin heating mechanism either: the handbook names a Cabin Heater coolant loop and stops, so the silence cannot tell a PTC heater from a heat pump",
    },
    battery: {
      packGrossKwh: f(110, "mfr", "high", "Ram does not label the figure gross or usable", FBG_25),
    },
    charging: {
      portStandard: f<PortStandard>(
        "CCS1",
        "mfr",
        "high",
        "One inlet takes AC Level 1, AC Level 2 and DC fast charging",
        HANDBOOK_26
      ),
      dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, PRESS_25),
      dcPeakKw: f(150, "mfr", "high", "Ram states four rates — 50, 85, 125 and 150 kW; 150 is the peak", PRESS_25),
      acOnboardKw: f(
        11,
        "est",
        "medium",
        "Ram's Level 2 wall box option for this van is rated up to 11 kW, and its handbook recommends a 48-amp home EVSE",
        PRESS_25
      ),
      architectureV: f(400, "mfr", "high", undefined, FBG_25),
    },
    warranty: {
      batteryYears: f(8, "mfr", "high", "Covers defects only, with no capacity-loss floor guaranteed", WARRANTY_26),
      batteryMiles: f(100_000, "mfr", "high", undefined, WARRANTY_26),
      powertrainTerms: f("8 years/100,000 miles, Electric Powertrain Limited Warranty", "mfr", "high", undefined, WARRANTY_26),
    },
    buyerNotes: [
      {
        headline: "No EPA range exists for this van — Ram's 162 miles is a manufacturer estimate",
        body:
          "At 9,350 lb GVWR the ProMaster EV sits above EPA's light-duty labelling threshold, and fueleconomy.gov holds no ProMaster record of any kind — gasoline or electric — for 2024, 2025 or 2026, which is the control that shows the exemption is the body class rather than this drivetrain. Ram publishes 162 miles in all three fleet buyer's guides, but only the MY2025 guide footnotes it as an EPA estimate; MY2024 and MY2026 both footnote it “Based on manufacturer's estimates”. Ram's own consumer pages publish 164 miles combined for the Cargo Van and 180 city for the Step Van, disclosed as internal simulation data. There is no government-certified figure to print.",
        severity: "warning",
        learnMore: CAPABILITY,
      },
      {
        headline: "The battery warranty covers defects but excludes ordinary capacity loss — there is no percentage floor",
        body:
          "Ram's Heavy Duty warranty booklet gives the high-voltage battery eight years or 100,000 miles, then states that “the loss of battery capacity due to or resulting from gradual capacity loss is not covered”. Most EVs on this site guarantee a floor instead — 70% is the common figure — so a ProMaster EV that simply degrades has no claim. The same booklet has no transfer-of-ownership clause at all: seven separate searches for transfer language across the 2024, 2025 and 2026 booklets return nothing.",
        severity: "trap",
        learnMore: WARRANTY_24,
      },
      {
        headline: "Ram says trailer towing is not recommended for this vehicle",
        body:
          "The owner's handbook's specifications page carries an explicit “ELECTRIC VEHICLE (EV) NOTE: Trailer Towing is not recommended for this vehicle”, distinct from the adjacent gasoline note that points at Ram's towing guide for a rated figure. The fleet buyer's guides print the GCWR cell as an em dash. No tow rating exists.",
        severity: "info",
        learnMore: HANDBOOK_26,
      },
      {
        headline: "Using the van as a power source voids the high-voltage battery warranty",
        body:
          "The MY2024 booklet lists “using your Ram ProMaster EV as a power source” among the misuse exclusions from battery coverage; the MY2025 and MY2026 booklets carry the same exclusion generalised to the whole Ram Heavy Duty line. There is no vehicle-to-load feature to use safely — no Ram document for this van mentions V2L or power export at all.",
        severity: "trap",
        learnMore: WARRANTY_26,
      },
    ],
  });
}

// ─────────────────── BRIGHTDROP ZEVO / CHEVROLET BRIGHTDROP ────────────────
//
// One van, two badges, and the badge changed mid-life: MY2022-2024 is the
// BrightDrop Zevo 400/600, MY2025-2026 the Chevrolet BrightDrop 400/600. Both
// spellings are live in the feed AND in vPIC — a 2024 VIN decodes make
// BRIGHTDROP model "Zevo" Series "400", a 2025 VIN decodes make CHEVROLET
// model "BrightDrop" Series "400" — so match.ts's MAKE_ALIASES table now folds
// /^brightdrop\b/ to BRIGHTDROP alongside the /^zevo\b/ entry it already had.
//
// THE 400/600 SPLIT LIVES IN THE VIN, NOT IN THE MODEL STRING, and it has to,
// because both surfaces hand the matcher a bare nameplate: the feed sends
// model "Zevo" with the size in the trim ("400 Std Roof") and model
// "BrightDrop" with the size in the trim ("Zevo 400"), and vPIC's own catalog
// for make BRIGHTDROP contains exactly one model — "Zevo" — with 400/600 in
// the Series field the matcher does not read. Swept through vPIC's partial-VIN
// decoder on 2026-08-25:
//   position 4  Z = GVWR class 2H (9,990 lb), 8 = class 3 (11,000 lb)
//   position 5  J, the only character that decodes as a BrightDrop at all
//   position 6  2 = the 400, 3 = the 600
// So `vds` prefixes ZJ2/8J2 name the 400 and ZJ3/8J3 the 600, on any VIN,
// under either badge, whatever the dealer typed.
//
// PACK, MY2025 — position 8 carries it, and vPIC states it in GM's own RPO
// codes rather than as a capacity:
//   Y = "EAWD - 2-MOTOR SYSTEM + 12 MOD", EngineModel "XRJ + ETC"
//   Z = "EAWD - 2-MOTOR SYSTEM + 20 MOD", EngineModel "XRJ + ETJ"
//   6 = "EFWD - 1-MOTOR SYSTEM + 12 MOD", EngineModel "XRM + ETC"
// GM's 25MY body-builder guide gives those same RPOs their capacities, and
// its wording is what the rows print: "Rechargeable energy storage system
// with 20-module pack / Useful Energy: 173.3 kWh" (ETJ, Max Range) and the
// same line at 12 modules / 102.4 kWh (ETC, Standard Range). Two independent
// sources agreeing on the module count is what makes this a per-VIN fact
// rather than an inference.
//
// PACK, MY2023-2024 AND MY2026 — abstained, for two different reasons.
// GM published no kWh figure at all in the Zevo years; its MY2024 fleet sheet
// gives range and charge rate and never a capacity, so 2023-24 has nothing to
// cite even though vPIC files the same 12/20-module codes. And MY2026 added a
// THIRD pack (RPO EWU, 121 kWh, "Extended Range", flagged NEW in GM's 26MY
// guide) while vPIC has filed no MY2026 pattern at all — so the position-8
// map above cannot be assumed to still hold, and guessing which of three
// packs a 2026 van carries is exactly the coin flip this corpus refuses.
//
// DRIVETRAIN — deliberately NOT keyed, except on the Max Range rows. Both FWD
// and AWD are real (GM's order guide has four model codes, CJ32705/CJ32905
// FWD and CM32705/CM32905 AWD, and its propulsion table gives them 233 hp on
// one motor and 300 hp on two). The feed labels the same van both ways and
// vPIC's own DriveType splits with position 8, so a blanket drive key would be
// wrong in one direction or the other. The one hard constraint GM does state
// is that the Max Range pack is "Available only on AWD versions", and the
// Max rows carry that.
//
// RANGE — abstained on every row. GM's footnote, identical in the 25MY and
// 26MY body-builder guides, is unusually explicit: "GM-estimated range based
// on current capability of analytical projection consistent with SAE J1634
// revision 2017-MCT… EPA estimates not yet available." GM also contradicts
// itself twice — the MY2025 Standard Range is 166 miles in the October 2024
// order guide and 174-179 in the July 2025 guide, and the MY2026 Max Range is
// "up to 285 miles" in the 26MY guide and 295/296 in GM Fleet's own
// comparison tool. The buyer notes give GM's per-model figures and name the
// disagreement rather than picking a side.
{
  const BBG_25 =
    "https://www.gmupfitter.com/wp-content/uploads/2024/12/25MY-Chevrolet-BrightDrop-400-600-V071725.pdf";
  const BBG_26 =
    "https://www.gmupfitter.com/wp-content/uploads/2025/09/26MY-Chevrolet-BrightDrop-400-600-V090425-CLEAN-FINAL.pdf";
  // The MY2025 owner manual: GM's own URL for it 404s today, so the citation
  // points at GM's live commercial page and the manual's own words are quoted
  // in the port note. The copy read this pass carried GM part number 85814496 B
  // and the header "Chevrolet BrightDrop 400/BrightDrop 600 Owner Manual
  // (GMNA-Localizing-U.S./Canada/Mexico-19507133) - 2025", and states
  // "This vehicle is compatible with a CCS1 connector."
  const CHEV_COMMERCIAL = "https://www.chevrolet.com/commercial/brightdrop";
  const GM_FLEET = "https://www.gmfleet.com/vehicles/electric-vehicles/chevrolet-brightdrop";
  // MY2024 BrightDrop EV Limited Warranty & Owner Assistance
  // (GMNA-Localizing-U.S.-17931329). GM's own gmenvolve.com URL now 301s to
  // gmfleet.com and 404s; the copy read this pass came from the Internet
  // Archive's capture of that GM URL, which is why the facts it alone
  // supports — the 75% floor and transferability — sit only on the Zevo-era
  // rows and cite the live MY2026 guide's warranty page for the term itself.
  const RECALL_STEERING = "https://www.nhtsa.gov/recalls?nhtsaId=25V156000";
  const RECALL_AIRBAG = "https://www.nhtsa.gov/recalls?nhtsaId=23V683000";

  const HP_ABSTAIN =
    "Four GM documents including a 599-page owner manual never use the words heat pump, and their option lists reach RPO granularity on heated seats, heated mirrors and a heated steering wheel — but none of them states what heats the cabin, so the silence cannot be read as an absence";
  const RANGE_ABSTAIN =
    "GM's own footnote on every range figure it publishes for this van reads “EPA estimates not yet available”, and fueleconomy.gov holds no BrightDrop or Zevo under any make or year; its GM-estimated figures stay in the buyer note";
  const PACK_ABSTAIN_ZEVO =
    "GM published no battery capacity at all in the Zevo years — its fleet sheets give range and charge rate and never a kWh figure — and the module count vPIC files is not a capacity";
  const PACK_ABSTAIN_2026 =
    "MY2026 offers three packs where MY2025 offered two, the Extended Range pack being new, and vPIC has filed no MY2026 pattern, so nothing in a VIN or a listing says which of the three this van carries";

  const BD_WARRANTY_TERM = {
    batteryYears: f(8, "mfr", "high", undefined, BBG_26),
    batteryMiles: f(100_000, "mfr", "high", undefined, BBG_26),
  };
  const ALIASES_400 = ["Zevo", "Zevo 400", "Zevo 400 Short Range", "BrightDrop", "BrightDrop 400"];
  const ALIASES_600 = ["Zevo", "Zevo 600", "BrightDrop", "BrightDrop 600"];
  const VDS_400 = ["ZJ2", "8J2"];
  const VDS_600 = ["ZJ3", "8J3"];

  const TOW_NOTE = {
    headline: "GM says never tow a trailer with this van",
    body:
      "The owner manual's trailer-towing section carries a boxed warning — “Never tow a trailer with your vehicle. It was not designed or intended to tow a trailer” — and its vehicle-load-limits section repeats that the van is “neither designed nor intended to tow a trailer”. There is no tow rating to quote.",
    severity: "warning" as const,
    learnMore: CHEV_COMMERCIAL,
  };
  const noEpaNote = (body: string) => ({
    headline: "No EPA range exists for this van — GM's own figure is a GM estimate",
    body,
    severity: "warning" as const,
    learnMore: GM_FLEET,
  });

  // MY2023-2024, BrightDrop badge. MY2022 is deliberately outside the window:
  // that year was sold as the "EV600", not the Zevo, it is not in the live
  // feed, and it carries a high-voltage battery recall (22V771000, battery
  // enclosure sealing, remedy under development) that the later vans do not —
  // spanning it would attach the wrong facts to the wrong car in both
  // directions.
  const zevo = (id: string, model: string, aliases: string[], vds: string[], notes: NonNullable<EnrichmentRow["buyerNotes"]>): EnrichmentRow => ({
    id,
    make: "BRIGHTDROP",
    model,
    modelAliases: aliases,
    modelYears: [2023, 2024],
    vds,
    abstains: { epaRangeMi: RANGE_ABSTAIN, heatPump: HP_ABSTAIN, packUsableKwh: PACK_ABSTAIN_ZEVO },
    charging: {
      portStandard: f<PortStandard>("CCS1", "est", "medium", "Same DC inlet as the 2025 van, whose manual states CCS1", CHEV_COMMERCIAL),
      dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, GM_FLEET),
      dcPeakKw: f(120, "mfr", "high", undefined, GM_FLEET),
      architectureV: f(400, "mfr", "high", undefined, GM_FLEET),
    },
    warranty: {
      ...BD_WARRANTY_TERM,
      sohFloorPct: f(75, "mfr", "high", undefined, CHEV_COMMERCIAL),
      batteryTransfers: f(true, "mfr", "high", undefined, CHEV_COMMERCIAL),
    },
    buyerNotes: notes,
  });

  R.push(
    zevo("zevo-400-2023-24", "Zevo 400", ALIASES_400, VDS_400, [
      noEpaNote(
        "GM's fleet material rates the Zevo 400 at up to 200 miles front-wheel drive and up to 250 miles all-wheel drive, and every GM range figure for this nameplate is footnoted “GM-estimated range based on current capability of analytical projection consistent with SAE J1634 revision 2017-MCT”, followed by “EPA estimates not yet available”. fueleconomy.gov has never carried a BrightDrop or Zevo under any make or model year, which is consistent with the van's GVWR putting it above EPA's labelling threshold.",
      ),
      {
        headline: "Steering-shaft recall 25V156000 covers 2024 Zevo 400 vans",
        body:
          "NHTSA campaign 25V156000: “The steering shaft may have been damaged during vehicle assembly and cause the steering to lock up.” Check the VIN against NHTSA's recall lookup before buying, and ask the seller for proof the remedy was performed.",
        severity: "trap",
        resolvedBy: "campaign_check",
        learnMore: RECALL_STEERING,
      },
      TOW_NOTE,
    ]),
    zevo("zevo-600-2023-24", "Zevo 600", ALIASES_600, VDS_600, [
      noEpaNote(
        "GM's fleet material rates the Zevo 600 at up to 200 miles front-wheel drive and up to 250 miles all-wheel drive, and every GM range figure for this nameplate is footnoted “GM-estimated range based on current capability of analytical projection consistent with SAE J1634 revision 2017-MCT”, followed by “EPA estimates not yet available”. fueleconomy.gov has never carried a BrightDrop or Zevo under any make or model year, which is consistent with the van's GVWR putting it above EPA's labelling threshold.",
      ),
      {
        headline: "Two open recalls on the 2023-24 Zevo 600: steering shaft and roof-rail airbag",
        body:
          "25V156000 — “The steering shaft may have been damaged during vehicle assembly and cause the steering to lock up.” 23V683000 — on vans built with the optional jump seat, the wrong B-pillar trim can interfere with right-side roof-rail airbag deployment. Check the VIN against NHTSA's recall lookup and ask for proof both remedies were performed.",
        severity: "trap",
        resolvedBy: "campaign_check",
        learnMore: RECALL_AIRBAG,
      },
      TOW_NOTE,
    ])
  );

  // MY2025, Chevrolet badge — the year vPIC files a per-VIN pack code and GM
  // publishes the capacity for it.
  const bd25 = (
    id: string,
    model: string,
    aliases: string[],
    vds: string[],
    vin8: string[],
    packKwh: number,
    packVariant: string,
    drive: EnrichmentRow["drive"],
    rangeBody: string
  ): EnrichmentRow => ({
    id,
    make: "BRIGHTDROP",
    model,
    modelAliases: aliases,
    modelYears: [2025, 2025],
    vds,
    vin8,
    drive,
    packVariant,
    abstains: { epaRangeMi: RANGE_ABSTAIN, heatPump: HP_ABSTAIN },
    battery: {
      packUsableKwh: f(packKwh, "mfr", "high", `Useful energy, ${packVariant} pack`, BBG_25),
    },
    charging: {
      portStandard: f<PortStandard>("CCS1", "mfr", "high", "One DC inlet, CCS1", CHEV_COMMERCIAL),
      dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, BBG_25),
      dcPeakKw: f(120, "mfr", "high", undefined, BBG_25),
      acOnboardKw: f(11.5, "mfr", "high", "Standard; a 19.2 kW onboard charger is optional", BBG_25),
      architectureV: f(400, "mfr", "high", undefined, BBG_25),
    },
    warranty: BD_WARRANTY_TERM,
    buyerNotes: [noEpaNote(rangeBody), TOW_NOTE],
  });

  const RANGE_2025_STD =
    "GM's 25MY body-builder guide rates the Standard Range van at 177 miles combined front-wheel drive and 174-179 combined all-wheel drive, footnoted “GM-estimated range based on current capability of analytical projection consistent with SAE J1634 revision 2017-MCT… EPA estimates not yet available”. GM's own October 2024 order guide gives a different number for the same pack and year — “up-to 166 miles” — and this site does not pick between two of a maker's own figures. fueleconomy.gov has never carried a BrightDrop or Zevo under any make or model year.";
  const RANGE_2025_MAX =
    "GM's 25MY body-builder guide rates the Max Range van at 272 miles combined, 303 city and 234 highway, footnoted “GM-estimated range based on current capability of analytical projection consistent with SAE J1634 revision 2017-MCT… EPA estimates not yet available”. fueleconomy.gov has never carried a BrightDrop or Zevo under any make or model year, which is consistent with the van's GVWR putting it above EPA's labelling threshold.";

  R.push(
    bd25("brightdrop-400-2025-std", "BrightDrop 400", ALIASES_400, VDS_400, ["Y", "6"], 102.4, "Standard Range", undefined, RANGE_2025_STD),
    bd25("brightdrop-400-2025-max", "BrightDrop 400", ALIASES_400, VDS_400, ["Z"], 173.3, "Max Range", "AWD", RANGE_2025_MAX),
    bd25("brightdrop-600-2025-std", "BrightDrop 600", ALIASES_600, VDS_600, ["Y", "6"], 102.4, "Standard Range", undefined, RANGE_2025_STD),
    bd25("brightdrop-600-2025-max", "BrightDrop 600", ALIASES_600, VDS_600, ["Z"], 173.3, "Max Range", "AWD", RANGE_2025_MAX)
  );

  // MY2026 — three packs, no vPIC pattern, so no pack figure.
  const bd26 = (id: string, model: string, aliases: string[], vds: string[]): EnrichmentRow => ({
    id,
    make: "BRIGHTDROP",
    model,
    modelAliases: aliases,
    modelYears: [2026, 2026],
    vds,
    abstains: { epaRangeMi: RANGE_ABSTAIN, heatPump: HP_ABSTAIN, packUsableKwh: PACK_ABSTAIN_2026 },
    charging: {
      portStandard: f<PortStandard>("CCS1", "est", "medium", "Carried over from the 2025 van; GM has not announced a NACS change", CHEV_COMMERCIAL),
      dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, BBG_26),
      acOnboardKw: f(19.2, "mfr", "high", "Standard for 2026; the 11.5 kW charger becomes the option", BBG_26),
      architectureV: f(400, "mfr", "high", undefined, BBG_26),
    },
    warranty: BD_WARRANTY_TERM,
    buyerNotes: [
      noEpaNote(
        "GM's 26MY body-builder guide rates the three packs at 178-204 miles combined (Standard and Extended Range) and “up to 285 miles” (Max Range), footnoted “GM-estimated range based on current capability of analytical projection consistent with SAE J1634 revision 2017-MCT… EPA estimates not yet available”. GM's own fleet comparison tool gives the Max Range van 295-296 miles instead, and this site does not pick between two of a maker's own figures. fueleconomy.gov has never carried a BrightDrop or Zevo under any make or model year.",
      ),
      TOW_NOTE,
    ],
  });

  R.push(
    bd26("brightdrop-400-2026", "BrightDrop 400", ALIASES_400, VDS_400),
    bd26("brightdrop-600-2026", "BrightDrop 600", ALIASES_600, VDS_600)
  );
}

// ─────────────────────── MERCEDES-BENZ eSPRINTER ───────────────────────────
//
// vPIC decodes this van as make MERCEDES-BENZ, model "eSprinter" — a clean
// string with no gasoline collision, unlike the Ford and Ram vans below and
// above, because the petrol one is the "Sprinter". So the model key needs no
// VIN guard; the feed's spellings ("eSprinter 2500", "Esprinter 2500",
// "eSprinter Cargo Van", "Esprinter Cargo Van") differ only in case and
// suffix and norm() folds them.
//
// THE EUROPE TRAP, and it is the whole story on this vehicle. The European
// eSprinter is sold with 56, 81 and 113 kWh packs on WLTP range figures; the
// US van is a different specification and MBUSA says so itself. Every fact
// below comes from a US-market document (media.mbusa.com or mbvans.com) and
// the European press figures — "a WLTP range of up to 400 km" in 2023, 478 km
// in 2024, both footnoted "The values given refer to the German market" — are
// discarded rather than converted. The US Operator's Manual does contain the
// string "Vehicles with 56 kWh high-voltage battery", but ONLY in the
// windscreen-washer filling-quantity table; its high-voltage-battery technical
// data section has exactly two tables, 81 and 113 kWh. That is multi-market
// document residue, not a US pack.
//
// PACK, MY2024 vs MY2025 — the US launched on 113 kWh usable alone ("the
// eSprinter will be available as a 170'' wheelbase cargo van with a high roof
// equipped with a 113 kilowatt hour battery (usable capacity)", MBUSA pricing
// release, Atlanta, August 2023) and added the 81 kWh option for MY2025 ("the
// launch of the 81-kilowatt hour (kWh) battery option (usable capacity)",
// MBUSA, April 2024). So the MY2024 row states 113 and the MY2025-26 row
// abstains: swept through vPIC's partial-VIN decoder on 2026-08-25, VIN
// position 5 carries the MOTOR (U = 100 kW, V = 150 kW, which is what the
// "HO" in a dealer's trim string means) and position 8 is a don't-care that
// decodes identically on all 33 characters. Nothing in the VIN or in a
// listing says which pack.
//
// RANGE — abstained, and this one is abstained twice over. There is no EPA
// record (control test in the file header). Worse, MBUSA attaches two
// mutually contradictory test bases to its own 150/206-mile figures on the
// same page: one footnote calls them "testing consistent with US EPA MCT
// drive cycle methodology", the other calls them "determined internally in
// accordance with a European test procedure for European vehicles… U.S.-
// specific figures will be announced closer to launch". A number whose own
// publisher cannot say which continent tested it does not go in a field
// labelled "EPA range".
//
// The MY2026 half of the second row's window is a forward extension, not a
// verified model year: MBUSA has published no MY2026 eSprinter release and
// mbvans.com was still advertising the 2025 van on 2026-08-25, while the
// petrol Sprinter pages had moved to 2026. No MY2026 eSprinter is in the live
// feed either. The window covers it because every fact on that row is either
// year-stable (chemistry, warranty, the charging hardware) or already
// abstained (the pack), so a 2026 van arriving tomorrow gets the true facts
// rather than an empty card — but if Mercedes changes the van for 2026, this
// is the row to re-check first.
{
  const MB_PRICING_2024 =
    "https://media.mbusa.com/releases/release-0c1982348d67d84829b2c6869f0566ca-mercedes-benz-usa-announces-pricing-for-the-all-new-esprinter";
  const MB_2025_UPDATE =
    "https://media.mbusa.com/releases/release-9443437b18e9b0076ab5c9a1636c02de-updated-product-offerings-for-new-2025-mercedes-benz-sprinter-and-esprinter";
  const MB_VANS = "https://www.mbvans.com/en/esprinter";
  const MB_MANUAL =
    "https://www.mbvans.com/content/dam/mb-vans/us/manuals/2025/esprinter/Operators%20Manual.pdf";
  const MB_VAN_WARRANTY =
    "https://www.mbvans.com/content/dam/mb-vans/us/generic/MY25_eSprinter_Warranty_and_Service%20Booklet_Web_Eng_Sp.pdf";

  const ESPRINTER_HP_ABSTAIN =
    "Eight US Mercedes documents never use the words heat pump, and the manual is granular enough about climate to name a seat heater, a steering-wheel heater, a windscreen heater and a rear-window heater separately — but a positive control shows MBUSA does say heat pump where one exists, so this is silence on the mechanism rather than a stated absence";
  const ESPRINTER_RANGE_ABSTAIN =
    "There is no EPA record for any Sprinter, and Mercedes' own 150 and 206 mile figures carry two contradictory footnotes on one page — EPA drive-cycle methodology in one, a European procedure with US figures still to come in the other";

  const ESPRINTER_CHARGING = {
    portStandard: f<PortStandard>("CCS1", "est", "medium", "One AC socket plus a DC socket extension, which Mercedes calls CCS", MB_MANUAL),
    dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, MB_PRICING_2024),
    dcPeakKw: f(50, "mfr", "high", "Standard; an optional upgrade raises it to 115 kW", MB_PRICING_2024),
    acOnboardKw: f(9.6, "mfr", "high", undefined, MB_PRICING_2024),
  };
  const ESPRINTER_WARRANTY = {
    batteryYears: f(8, "mfr", "high", undefined, MB_VAN_WARRANTY),
    batteryMiles: f(100_000, "mfr", "high", undefined, MB_VAN_WARRANTY),
    sohFloorPct: f(70, "mfr", "high", undefined, MB_VAN_WARRANTY),
    batteryTransfers: f(true, "mfr", "high", undefined, MB_VAN_WARRANTY),
    extendedCoverage: f(
      "Battery certificate extension to 8 years / 185,000 miles, purchasable with an eMaintenance or eComplete service plan",
      "mfr",
      "high",
      undefined,
      MB_PRICING_2024
    ),
  };
  const ESPRINTER_ALIASES = ["eSprinter 2500", "eSprinter Cargo Van", "eSprinter H.O. Cargo Van", "Sprinter 2500 Electric"];
  const ESPRINTER_RANGE_NOTE = {
    headline: "No EPA range exists, and Mercedes' own figures are footnoted two contradictory ways",
    body:
      "fueleconomy.gov holds no Sprinter of any kind for 2024, 2025 or 2026 while listing 72-89 other Mercedes-Benz models in each of those years, so the absence is the vehicle and not the make. MBUSA's own page shows “Maximum Range: 150 miles (81 kWh battery) – 206 miles (113 kWh battery)” under two footnotes that apply to both numbers: one says the figures reflect “testing consistent with US EPA MCT drive cycle methodology”, the other says they are “determined internally in accordance with a European test procedure for European vehicles” and that “U.S.-specific figures will be announced closer to launch”. Treat them as manufacturer self-tested estimates, not a rating.",
    severity: "warning" as const,
    learnMore: MB_VANS,
  };

  R.push({
    id: "esprinter-2024",
    make: "MERCEDES-BENZ",
    model: "eSprinter",
    modelAliases: ESPRINTER_ALIASES,
    modelYears: [2024, 2024],
    abstains: { epaRangeMi: ESPRINTER_RANGE_ABSTAIN, heatPump: ESPRINTER_HP_ABSTAIN },
    battery: {
      packUsableKwh: f(113, "mfr", "high", "The only pack the US launched with", MB_PRICING_2024),
      chemistry: f<Chemistry>("LFP", "mfr", "high", "Lithium iron phosphate, no cobalt or nickel", MB_PRICING_2024),
    },
    charging: {
      ...ESPRINTER_CHARGING,
      chargeTime1080Min: f(42, "mfr", "high", "10–80% on the 113 kWh pack at a 115 kW DC station", MB_MANUAL),
    },
    warranty: ESPRINTER_WARRANTY,
    specs: { towRatingLb: f(4100, "mfr", "high", undefined, MB_VANS) },
    buyerNotes: [ESPRINTER_RANGE_NOTE],
  });

  R.push({
    id: "esprinter-2025-26",
    make: "MERCEDES-BENZ",
    model: "eSprinter",
    modelAliases: ESPRINTER_ALIASES,
    modelYears: [2025, 2026],
    abstains: {
      epaRangeMi: ESPRINTER_RANGE_ABSTAIN,
      heatPump: ESPRINTER_HP_ABSTAIN,
      packUsableKwh:
        "The US offers 81 and 113 kWh usable from MY2025, and nothing separates them: VIN position 5 carries the motor rating rather than the pack, position 8 decodes identically on every character, and no listing field names a capacity",
    },
    battery: {
      chemistry: f<Chemistry>("LFP", "mfr", "high", "Lithium iron phosphate, no cobalt or nickel", MB_PRICING_2024),
    },
    charging: ESPRINTER_CHARGING,
    warranty: ESPRINTER_WARRANTY,
    specs: { towRatingLb: f(4100, "mfr", "high", undefined, MB_VANS) },
    buyerNotes: [
      ESPRINTER_RANGE_NOTE,
      {
        headline: "Two battery sizes share this listing's name — 81 kWh or 113 kWh, and the VIN does not say which",
        body:
          "Mercedes added an 81 kWh usable pack for MY2025 alongside the 113 kWh pack the US launched with in MY2024. Nothing in the VIN separates them: position 5 encodes the motor (100 kW standard, 150 kW High Output — the “HO” some dealers put in the trim field) and position 8 decodes identically on every character. Mercedes' own maximum-range figures for the two differ by 56 miles, so ask the seller for the window sticker or the battery data on the vehicle's data card before assuming which one this is.",
        severity: "warning",
        learnMore: MB_2025_UPDATE,
      },
    ],
  });
}

// ──────────────────── MERCEDES-BENZ S-CLASS PLUG-IN HYBRIDS ────────────────
//
// Four different cars wearing one nameplate, and the feed hands us the
// nameplate with nothing else: 101 of the live MY2026 listings carry model
// "S-CLASS" and an EMPTY trim field. vPIC's model string is "S-Class" too. So
// every row here is keyed on the vehicle descriptor, VIN positions 4-8, which
// is the one field a dealer cannot blur — verified by decoding live VINs and
// by sweeping vPIC's partial-VIN decoder on 2026-08-25:
//   UG6DB  → "S550e",                    2015-2017, RWD
//   UG7DB  → "S560e",                    2019-2020, RWD
//   6G6KB  → "S580e 4MATIC",             2023-2026
//   6G8CB  → "AMG S 63 E Performance",   2024-2026
// The control that matters is the fifth pattern: 6G7GB decodes "S580 4MATIC"
// with an EMPTY ElectrificationLevel — the petrol S 580. Descriptor-keyed rows
// are a hard filter, so no row here can reach it, which is what makes a
// bare-nameplate model key safe on the /vin/ page as well as in the feed.
//
// vPIC's BatteryKWh IS A PATTERN CONSTANT HERE AND MUST BE IGNORED. Both the
// S 580e and the AMG S 63 E Performance decode "22.7" on MY2026 VINs, with
// BatteryKWh_to empty, which cannot be true of both — Mercedes' own figures
// are 28.6 kWh for the S 580e and 13.1 kWh (10.36 usable) for the AMG. vPIC
// also reports the AMG's onboard charger as 9.6 kW where Mercedes says 3.7,
// so two electrical fields on that pattern are inherited from the S 580e's.
// Every row below sets ignoreKwhHint for that reason: without it the matcher's
// 20% battery-hint filter would veto the AMG's own row.
//
// EPA HAS YEAR HOLES ON BOTH CARS, and they are not the same holes. It rates
// the S580e 4matic in 2023 (56 electric miles) and 2025 (48) and files nothing
// for 2024 or 2026; it rates the AMG S63 E Performance in 2025 (16) and files
// nothing for 2024 or 2026. Where the bracketing figures DISAGREE — the
// S 580e's 56 and 48 — the years in between and after abstain, because
// picking either would be a coin flip on an eight-mile difference. Where they
// AGREE — the AMG's 16 miles is both EPA's 2025 rating and Mercedes' own
// launch figure, which its release labels "16 (EPA)" — one row spans the
// generation.
//
// WARRANTY. Mercedes' EQ warranty booklet does NOT cover these cars: it
// contains zero occurrences of "plug" or "hybrid" and its scope page lists
// only battery-electric EQ variants. The plug-ins fall under the ordinary
// passenger-car booklet, on markedly worse terms — 6 years/62,000 miles
// against the EQ cars' 8 or 10, transferable "to the original and each
// subsequent owner", and with NO state-of-health floor at all (the PHEV
// section omits the capacity bullet the BEV sections carry and adds an
// explicit gradual-capacity-loss exclusion). MBUSA publishes only the MY2026
// booklet on its CDN — the MY2023, MY2024 and MY2025 paths all 404 — so the
// term is carried at medium confidence on the earlier rows and the older
// S 550e/S 560e rows abstain on it outright rather than assume a 2026 term
// applies to a 2015 car.
{
  const MB_PC_WARRANTY_26 =
    "https://www.mbusa.com/content/dam/mb-nafta/us/owners/manuals/2026/MY26PCWarrantyBooklet.pdf";
  const S550E_SPEC =
    "https://media.mbusa.com/releases/release-9fab9430c9e44132bdcfdaee10252728-2017-mercedes-benz-s550e-sedan-specifications";
  const S560E_RELEASE =
    "https://media.mbusa.com/releases/release-084a1d95d4de74bc8ef3d0a30a0197a5-eq-power-new-plug-in-hybrid-mercedes-benz-s560e";
  const S580E_PRICING =
    "https://media.mbusa.com/releases/release-651c668371427afb92b6f5676e07e661-mercedes-benz-usa-announces-pricing-for-the-all-new-s-class-plug-in-hybrid";
  const AMG_S63E_RELEASE =
    "https://media.mbusa.com/releases/release-87e09c20de09cff9b36ebaa27401500c-mercedes-amg-s-63-e-performance";

  const S_HP_ABSTAIN =
    "Six Mercedes documents covering all four of these cars never use the words heat pump, and a positive control on the MMA press material shows MBUSA does say it where one exists — but none of these documents states the cabin heating mechanism, so the silence is not an assertion of absence";
  const S_OLD_WARRANTY_ABSTAIN =
    "MBUSA publishes only its MY2026 warranty booklet, and the MY2015 through MY2020 paths all return 404, so the current 6 year term cannot be assumed backwards onto a car this old";

  const S_PHEV_WARRANTY = (confidence: "high" | "medium") => ({
    batteryYears: f(6, "mfr", confidence, "10 years / 150,000 miles in California and other ZEV-adopting states", MB_PC_WARRANTY_26),
    batteryMiles: f(62_000, "mfr", confidence, undefined, MB_PC_WARRANTY_26),
    batteryTransfers: f(true, "mfr", confidence, undefined, MB_PC_WARRANTY_26),
  });
  const S_ALIASES = ["S-Class Sedan", "S Class"];
  const NO_SOH_NOTE = {
    headline: "The battery warranty is 6 years / 62,000 miles with no capacity floor — shorter than any EQ model's",
    body:
      "Mercedes' EQ warranty booklet does not cover plug-in hybrids at all; these cars fall under the ordinary passenger-car booklet, whose High-Voltage Battery Limited Warranty runs “up to 6 years or 62,000 miles, whichever occurs first” against 8 or 10 years for the battery-electric EQ cars. It is transferable “to the original and each subsequent owner”, but unlike the EQ terms it guarantees no percentage of original capacity, and states that “loss of Capacity due to or resulting from gradual Capacity loss is not covered”. Cars registered in California and fourteen other states get 10 years / 150,000 miles instead.",
    severity: "trap" as const,
    learnMore: MB_PC_WARRANTY_26,
  };

  R.push({
    id: "s550e-2015-17",
    make: "MERCEDES-BENZ",
    model: "S-Class",
    modelAliases: S_ALIASES,
    modelYears: [2015, 2017],
    vds: ["UG6DB"],
    drive: "RWD",
    abstains: { heatPump: S_HP_ABSTAIN, batteryWarranty: S_OLD_WARRANTY_ABSTAIN },
    battery: {
      packGrossKwh: f(8, "mfr", "high", "Mercedes does not label the figure gross or usable", S550E_SPEC),
      chemistry: f<Chemistry>("LFP", "mfr", "medium", "Lithium iron phosphate, replaced by NMC on the S 560e", S560E_RELEASE),
    },
    range: {
      epaRangeMi: f(14, "mfr", "high", "Electric-only EPA range. Identical rating 2015–2017", epa(38460)),
      epaRangeTotalMi: f(450, "mfr", "high", undefined, epa(38460)),
      mpgeElectric: f(58, "mfr", "high", undefined, epa(38460)),
      mpgeCombined: f(31, "mfr", "high", undefined, epa(38460)),
      mpgGasoline: f(26, "mfr", "high", undefined, epa(38460)),
    },
    charging: {
      portStandard: f<PortStandard>("J1772", "est", "medium", "AC only, the US plug-in inlet of its era", S550E_SPEC),
      dcFastCharging: f<"none">("none", "est", "high", undefined, S550E_SPEC),
      acOnboardKw: f(3.6, "mfr", "medium", undefined, S550E_SPEC),
    },
  });

  R.push({
    id: "s560e-2019-20",
    make: "MERCEDES-BENZ",
    model: "S-Class",
    modelAliases: S_ALIASES,
    modelYears: [2019, 2020],
    vds: ["UG7DB"],
    drive: "RWD",
    abstains: { heatPump: S_HP_ABSTAIN, batteryWarranty: S_OLD_WARRANTY_ABSTAIN },
    battery: {
      packGrossKwh: f(13.5, "mfr", "medium", "Mercedes calls it a rated capacity", S560E_RELEASE),
      chemistry: f<Chemistry>("NMC", "mfr", "medium", "Lithium-nickel-manganese-cobalt, replacing the S 550e's LFP", S560E_RELEASE),
    },
    range: {
      epaRangeMi: f(19, "mfr", "high", "Electric-only EPA range. Identical rating 2019–2020", epa(42209)),
      epaRangeTotalMi: f(510, "mfr", "high", undefined, epa(42209)),
      mpgeElectric: f(64, "mfr", "high", undefined, epa(42209)),
      mpgeCombined: f(33, "mfr", "high", undefined, epa(42209)),
      mpgGasoline: f(23, "mfr", "high", undefined, epa(42209)),
    },
    charging: {
      portStandard: f<PortStandard>("J1772", "est", "medium", "AC only, the US plug-in inlet of its era", S560E_RELEASE),
      dcFastCharging: f<"none">("none", "est", "high", undefined, S560E_RELEASE),
      acOnboardKw: f(7.2, "mfr", "medium", undefined, S560E_RELEASE),
    },
  });

  const S580E_BATTERY = {
    packGrossKwh: f(28.6, "mfr", "high", "Mercedes does not label the figure gross or usable", S580E_PRICING),
  };
  const S580E_CHARGING = {
    portStandard: f<PortStandard>("CCS1", "est", "medium", "The only US DC inlet its 60 kW fast charger could use", S580E_PRICING),
    dcFastCharging: f<"optional">("optional", "mfr", "high", "A 60 kW DC charger is an option, not standard", S580E_PRICING),
    dcPeakKw: f(60, "mfr", "high", undefined, S580E_PRICING),
    chargeTime1080Min: f(20, "mfr", "high", "10–80% on the optional 60 kW DC charger", S580E_PRICING),
    acOnboardKw: f(9.6, "mfr", "high", undefined, S580E_PRICING),
  };
  const s580e = (id: string, years: [number, number], confidence: "high" | "medium", range: EnrichmentRow["range"], abstainRange?: string, extraNote?: NonNullable<EnrichmentRow["buyerNotes"]>[number]): EnrichmentRow => ({
    id,
    make: "MERCEDES-BENZ",
    model: "S-Class",
    modelAliases: S_ALIASES,
    modelYears: years,
    vds: ["6G6KB"],
    drive: "AWD",
    packVariant: "S 580e 4MATIC",
    ignoreKwhHint: true,
    abstains: abstainRange
      ? { heatPump: S_HP_ABSTAIN, epaRangeMi: abstainRange }
      : { heatPump: S_HP_ABSTAIN },
    battery: S580E_BATTERY,
    range,
    charging: S580E_CHARGING,
    warranty: S_PHEV_WARRANTY(confidence),
    buyerNotes: extraNote ? [NO_SOH_NOTE, extraNote] : [NO_SOH_NOTE],
  });

  const S580E_YEAR_HOLE = (year: number, note: string): NonNullable<EnrichmentRow["buyerNotes"]>[number] => ({
    headline: `EPA published no electric-range rating for the ${year} S 580e`,
    body: note,
    severity: "info",
    learnMore: epa(49021),
  });

  R.push(
    s580e("s580e-2023", [2023, 2023], "medium", {
      epaRangeMi: f(56, "mfr", "high", "Electric-only EPA range", epa(47279)),
      epaRangeTotalMi: f(470, "mfr", "high", undefined, epa(47279)),
      mpgeElectric: f(49, "mfr", "high", undefined, epa(47279)),
      mpgeCombined: f(41, "mfr", "high", undefined, epa(47279)),
      mpgGasoline: f(23, "mfr", "high", undefined, epa(47279)),
    }),
    s580e(
      "s580e-2024",
      [2024, 2024],
      "medium",
      undefined,
      "EPA filed no MY2024 record for this car, and its rating moved between the two years that bracket it — 56 electric miles in 2023, 48 in 2025 — so neither figure can be carried across the gap",
      S580E_YEAR_HOLE(
        2024,
        "fueleconomy.gov holds S580e 4matic records for 2023 and 2025 but none for 2024, which is a filing gap rather than a change of car — EPA has the same hole on the AMG S 63 E Performance. The two ratings that bracket 2024 disagree: 56 electric miles in 2023 and 48 in 2025. Rather than pick one for a car neither of them describes, this page prints no electric range. Mercedes publishes no US figure of its own for MY2024 either."
      )
    ),
    s580e("s580e-2025", [2025, 2025], "medium", {
      epaRangeMi: f(48, "mfr", "high", "Electric-only EPA range", epa(49021)),
      epaRangeTotalMi: f(470, "mfr", "high", undefined, epa(49021)),
      mpgeElectric: f(63, "mfr", "high", undefined, epa(49021)),
      mpgeCombined: f(42, "mfr", "high", undefined, epa(49021)),
      mpgGasoline: f(23, "mfr", "high", undefined, epa(49021)),
    }),
    s580e(
      "s580e-2026",
      [2026, 2026],
      "high",
      undefined,
      "EPA filed no MY2026 record for this car, and its rating has already moved once inside this generation — 56 electric miles in 2023, 48 in 2025 — so the 2025 figure cannot be assumed to carry forward",
      S580E_YEAR_HOLE(
        2026,
        "fueleconomy.gov holds S580e 4matic records for 2023 and 2025 and none for 2026, and Mercedes publishes no US electric-range figure of its own for MY2026 — its MY2026 owner's manual leaves the usable-energy row blank, marked “Missing values were not yet available by the copy deadline”. The rating already moved once inside this generation, from 56 miles to 48, so carrying 48 forward would be a guess. The 2025 car's rating is linked below for comparison, not as this car's number."
      )
    )
  );

  R.push({
    id: "amg-s63e-2024-26",
    make: "MERCEDES-BENZ",
    model: "S-Class",
    modelAliases: S_ALIASES,
    modelYears: [2024, 2026],
    vds: ["6G8CB"],
    drive: "AWD",
    packVariant: "AMG S 63 E Performance",
    ignoreKwhHint: true,
    abstains: { heatPump: S_HP_ABSTAIN },
    battery: {
      packUsableKwh: f(10.36, "mfr", "high", "Of 13.1 kWh installed", AMG_S63E_RELEASE),
      packGrossKwh: f(13.1, "mfr", "high", undefined, AMG_S63E_RELEASE),
    },
    range: {
      epaRangeMi: f(16, "mfr", "high", "Electric-only EPA range", epa(49020)),
      epaRangeTotalMi: f(390, "mfr", "high", undefined, epa(49020)),
      mpgeElectric: f(49, "mfr", "high", undefined, epa(49020)),
      mpgeCombined: f(23, "mfr", "high", undefined, epa(49020)),
      mpgGasoline: f(18, "mfr", "high", undefined, epa(49020)),
    },
    charging: {
      portStandard: f<PortStandard>("J1772", "est", "medium", "AC only — Mercedes fits this car no DC charger", AMG_S63E_RELEASE),
      dcFastCharging: f<"none">("none", "mfr", "high", "External charging is through the 3.7 kW AC charger only", AMG_S63E_RELEASE),
      acOnboardKw: f(3.7, "mfr", "high", undefined, AMG_S63E_RELEASE),
      architectureV: f(400, "mfr", "high", undefined, AMG_S63E_RELEASE),
    },
    warranty: S_PHEV_WARRANTY("medium"),
    buyerNotes: [
      NO_SOH_NOTE,
      {
        headline: "This is the AMG, not the S 580e — 16 electric miles rather than roughly 50, and no DC fast charging",
        body:
          "Most listings for this car arrive with an empty trim field under the bare name “S-Class”, and the two plug-in S-Classes are very different vehicles. The AMG S 63 E Performance carries a 13.1 kWh battery (10.36 kWh usable) built for power rather than range, charges only on AC at 3.7 kW, and is EPA-rated at 16 electric miles. The S 580e carries 28.6 kWh, offers an optional 60 kW DC charger, and is rated at 48 to 56 miles. The VIN separates them: positions 4-8 read 6G8CB on this car and 6G6KB on the S 580e.",
        severity: "info",
        learnMore: AMG_S63E_RELEASE,
      },
    ],
  });
}

export const RESEARCH_ROWS_11: EnrichmentRow[] = R;
