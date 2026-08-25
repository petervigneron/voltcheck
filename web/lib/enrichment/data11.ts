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
// SOURCING, same bar as data6 and data9, with two honest qualifications.
// Every battery, charging, thermal and warranty fact below comes from a
// manufacturer document read in its own words, and nothing came from a search
// snippet or from memory; where a document does not state a thing, the row
// abstains and says why.
//
// The qualifications. First, "fetched" is not uniformly true of the FORD
// citations: fromtheroad.ford.com, the CDN holding Ford's order guides and
// spec sheets, refuses connections from this environment entirely — the host
// root 301s and every /content/dam/ path hangs — which is the same refusal
// data4.ts recorded in 2026-08. The Ford documents cited below were read from
// copies fetched into a shared cache by a session that could reach that host,
// and their identity was checked against the PDFs' own titles and running
// headers. Treat a Ford URL here as "this document says it, and this is where
// it lives", not as "this URL resolved for the author". Ford's other hosts —
// media.ford.com, ford.com, fordservicecontent.com — do resolve, and the
// warranty guides and the NACS page were fetched directly.
//
// Second, the render rule applies where it matters rather than everywhere:
// figures that live in multi-column PDF tables were read from RENDERED pages
// (GM's two range grids, GM's warranty page 5, the Chrysler pack row), because
// extracted text interleaves columns. Figures that sit in running prose or in
// a plain two-column key/value list were read from extracted text, which is
// what that layout can be trusted for.
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
// NO batteryTransfers ON ANY FORD ROW, and that is a finding rather than an
// omission. Both of Ford's BEV warranty guides — the MY2023 one and the
// E-Transit-specific MY2026 one — were fetched and searched: the string
// "transfer" appears zero times in either. Ford states the 8-year/100,000-mile
// term and the 70% capacity floor (65% on cutaway and chassis cab) and says
// nothing at all about what happens to that coverage on resale. An earlier
// draft of this file asserted the coverage transfers, cited to those guides;
// it does not say so, so the field is gone rather than downgraded.
//
// THE PACK FIGURE COMES FROM THE SPEC SHEET, NOT THE ORDER GUIDE, and the
// difference is one word. Ford's MY2026 order guide sells an "89kWH
// High-Voltage Battery" without saying whether that is usable or gross, and
// its MY2024 guide calls what appears to be the same pack "89.9 kWH". The
// MY2025 technical specification sheet is the one document that disambiguates
// it — "Usable energy: 89 kWh" — so that is what the 2025 and 2026-27 rows
// cite, and this corpus's packUsableKwh means what it says. The MY2022 guide
// does the same job for the earlier pack: "68kWh Useable Energy".
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
  const OG_22 =
    "https://www.fromtheroad.ford.com/content/dam/fordmediasite/us/en/library/2022/order-guides/2022_Ford_Transit_Order_Guide.pdf";
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
    // Cited to the MY2024 order guide ("Electric Motor (E-Transit) with 68kWH
    // Standard Range High-Voltage Battery" — the same pack, still shipping as
    // MY2024's Standard Range): the MY2022 guide's URL now 404s with no
    // archive capture, so the live document that names the figure carries it.
    battery: { packUsableKwh: f(68, "mfr", "high", "The only pack for these years", OG_24) },
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
      acOnboardKw: f(19.2, "mfr", "high", "Dual onboard chargers, new for 2024", SPECS_25),
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
      superchargerAccess: f<"adapter">("adapter", "mfr", "medium", "Updates are not required; E-Transit owners get optional updates from a dealer", NACS_HOWTO),
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
    battery: { packUsableKwh: f(89, "mfr", "high", "Ford calls it usable energy", SPECS_25) },
    charging: {
      portStandard: f<PortStandard>("CCS1", "mfr", "high", "SAE J1772 CCS, charging on 120V, 240V and DC fast", OG_26),
      dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, OG_26),
      acOnboardKw: f(11.2, "mfr", "high", "A single onboard charger is standard for 2026; dual chargers are optional", OG_26),
      superchargerAccess: f<"adapter">("adapter", "mfr", "medium", "Updates are not required; E-Transit owners get optional updates from a dealer", NACS_HOWTO),
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
      // est/medium, not mfr/high: Ram never writes "CCS1". It describes one
      // "industry standard SAE J1772 charge inlet" used "for both AC Level 1
      // (120 V), AC Level 2 (240 V), and Level 3 DC Fast (400 V) charging" —
      // and an inlet carrying J1772 AC pins AND DC fast pins is a CCS1 port.
      // That is our inference from Ram's description, not Ram's word, so it
      // takes the same tier as the E-Transit's, the Zevo's and the eSprinter's
      // inferred ports rather than the manufacturer tier the prior research
      // doc assigned it.
      portStandard: f<PortStandard>(
        "CCS1",
        "est",
        "medium",
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
        headline: "Damage from using the van as a power source is excluded from the warranty",
        body:
          "Ram’s warranty booklets list “using your vehicle as a power source” among the misuse examples under “What Is Not Covered”, alongside driving over curbs and overloading. Read it precisely: it does not void the warranty, it excludes the cost of repairing damage caused that way — narrower, and worth knowing before wiring equipment in. Ram does fit a 115-volt auxiliary power outlet (sales code JKV) as a factory option, which is the sanctioned way to draw power; no Ram document for this van describes vehicle-to-load or high-power export through the charge port.",
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
// PACK, MY2023-2024 AND MY2026 — abstained, for two different reasons, and
// the first one is stronger than "we could not find it".
// GM published no kWh figure at all in the Zevo years — zero occurrences of
// "kWh" or "kilowatt hour" across the MY2023 and MY2024 order guides, the
// MY2024 fleet sheet and the archived gobrightdrop product page, with the
// control that "120kW DC Fast Charging or AC Level 2 11.5kW" greps out of the
// same page fine, so the extraction is not the problem. Worse, GM and NHTSA
// disagree about what is in the van: vPIC files MY2024 position 8 as 12 and
// 20 MODULES, while GM's own MY2024 order guide sells "(EW2) Battery, Ultium,
// 14 module pack" and "(ETJ) Battery, Ultium, 20 module pack". A 14-module
// pack and a 12-module pack cannot both be the standard MY2024 battery, so
// the position-8 map that works for MY2025 must NOT be carried backwards, and
// converting either count into a capacity would be arithmetic, not a source.
// MY2026 abstains for the opposite reason: it added a THIRD pack (RPO EWU,
// "Extended Range", 204 GM-estimated miles, flagged NEW in the 26MY guide)
// while vPIC has filed no MY2026 pattern at all, so nothing can say which of
// three a given van carries.
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
// revision 2017-MCT… EPA estimates not yet available." So the buyer notes
// carry GM's numbers and the field stays empty.
//
// Those numbers are per MODEL and per DRIVETRAIN and this file got them wrong
// once, which is worth recording: the 25MY guide's two tables give the 400
// 177 combined miles on front-wheel drive and 175 on all-wheel drive, and the
// 600 174 and 179 — the two vans do not even rank the same way round, so the
// single shared sentence this file used to print for both was wrong on three
// of the four figures. The tables were re-read as RENDERED pages, because
// they are four-column grids and extracted text interleaves them.
//
// One earlier claim here has been withdrawn rather than corrected: that GM
// contradicted itself with a "166 miles" figure in an October 2024 order
// guide. That document is not publicly retrievable — a control-tested sweep
// of GM's media API, the Wayback CDX index and several hundred candidate
// filenames finds the earliest public 25MY revision dated 11/26/24, carrying
// 177/179 and no 166 anywhere — and GM's real dealer order guides sit behind
// an SSO wall. An accusation of self-contradiction that rests on a document
// nobody can open is not a finding, so it is gone.
{
  const BBG_25 =
    "https://www.gmupfitter.com/wp-content/uploads/2024/12/25MY-Chevrolet-BrightDrop-400-600-V071725.pdf";
  const BBG_26 =
    "https://www.gmupfitter.com/wp-content/uploads/2025/09/26MY-Chevrolet-BrightDrop-400-600-V090425-CLEAN-FINAL.pdf";
  // The port citation. GM's public manual index (gmfleet.com/resources/
  // guides-and-manuals, enumerated 2026-08-25) carries exactly two BrightDrop
  // owner manuals - MY2023 and MY2024 - and the MY2024 one is live and says it
  // in one sentence: "This vehicle is compatible with a CCS1 connector." That
  // is what every row below cites. The MY2025 manual is not on that index and
  // no public URL for it could be found, but a copy was read this pass (GM
  // part 85814496 B, running header "Chevrolet BrightDrop 400/BrightDrop 600
  // Owner Manual (GMNA-Localizing-U.S./Canada/Mexico-19507133) - 2025", 282
  // PDF sheets in GM's 2-up layout, so about 599 printed pages) and it repeats
  // that sentence verbatim. It stays in this comment rather than on a fact,
  // the same way data9.ts keeps Mercedes' draft MY2027 booklet in a comment:
  // a citation a reader cannot open is not a citation.
  const OM_24 =
    "https://www.gmfleet.com/content/dam/gmfleet/na/us/en/index/pdfs/guides-and-manuals/02-pdfs/24-brightdrop-zevo-400-600-om-en-08-03-23.pdf";
  // MY2024 BrightDrop Electric Vehicle Limited Warranty and Owner Assistance
  // Information (GMNA-Localizing-U.S.-17931329). GM's own gmenvolve.com URL
  // 404s today, so the citation is the Internet Archive's raw capture of that
  // GM URL - verified live this pass, and read from a RENDERED page 5 rather
  // than from extracted text, because both facts it carries sit in a
  // three-column layout: "the coverage described in this Electric Vehicle
  // Propulsion Battery Warranty is transferable at no cost to any subsequent
  // person(s) who assumes ownership of the vehicle within the 8 years or
  // 100,000 miles term", and "The battery will be replaced/repaired if the
  // capacity falls below 75% of its original value during the warranty
  // period".
  const WARRANTY_24 =
    "https://web.archive.org/web/20250623125919id_/https://www.gmenvolve.com/content/dam/gmenvolve/na/us/en/index/pdfs/24-warranty/02-pdfs/brightdrop-zevo-my24-warrantyguide-052423.pdf";
  const CHEV_COMMERCIAL = "https://www.chevrolet.com/commercial/brightdrop";
  const GM_FLEET = "https://www.gmfleet.com/vehicles/electric-vehicles/chevrolet-brightdrop";
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

  // MY2026 term only; the MY2025 rows and the Zevo-era rows cite their own
  // model year's document rather than this one.
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
      portStandard: f<PortStandard>("CCS1", "mfr", "high", "One DC inlet, CCS1", OM_24),
      dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, OM_24),
      // No dcPeakKw and no architectureV on these rows. GM published both for
      // the MY2025 van (BBG_25: "DC FAST CHARGING - 400 volt, up to 120 kW")
      // and this file used to carry them here too, cited to gmfleet.com's
      // landing page, which states neither. Rather than forward-cite a MY2025
      // guide onto a MY2023-24 van, the rows say nothing.
    },
    warranty: {
      batteryYears: f(8, "mfr", "high", undefined, WARRANTY_24),
      batteryMiles: f(100_000, "mfr", "high", undefined, WARRANTY_24),
      sohFloorPct: f(75, "mfr", "high", undefined, WARRANTY_24),
      batteryTransfers: f(true, "mfr", "high", "Transfers at no cost to any subsequent owner", WARRANTY_24),
    },
    buyerNotes: notes,
  });

  R.push(
    zevo("zevo-400-2023-24", "Zevo 400", ALIASES_400, VDS_400, [
      noEpaNote(
        "GM's MY2024 order guide splits the range by PACK, not by drivetrain: “(EW2) Battery, Ultium, 14 module pack (GM-estimated range 200 miles)”, standard on all four configurations, and “(ETJ) Battery, Ultium, 20 module pack (GM-estimated range 250 miles)”, available on the all-wheel-drive versions only. So an AWD van on the standard pack is a 200-mile van, not a 250-mile one. Every GM range figure for this nameplate carries the same footnote — “On a full charge based on development testing and/or analytical projection consistent with SAE J1634 revision 2017 – MCT”, ending “EPA estimates not yet available”. fueleconomy.gov has never carried a BrightDrop or Zevo under any make or model year, which is consistent with the van's GVWR putting it above EPA's labelling threshold.",
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
        "GM's MY2024 order guide splits the range by PACK, not by drivetrain: “(EW2) Battery, Ultium, 14 module pack (GM-estimated range 200 miles)”, standard on all four configurations, and “(ETJ) Battery, Ultium, 20 module pack (GM-estimated range 250 miles)”, available on the all-wheel-drive versions only. So an AWD van on the standard pack is a 200-mile van, not a 250-mile one. Every GM range figure for this nameplate carries the same footnote — “On a full charge based on development testing and/or analytical projection consistent with SAE J1634 revision 2017 – MCT”, ending “EPA estimates not yet available”. fueleconomy.gov has never carried a BrightDrop or Zevo under any make or model year, which is consistent with the van's GVWR putting it above EPA's labelling threshold.",
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
      portStandard: f<PortStandard>("CCS1", "mfr", "high", "One DC inlet, CCS1", OM_24),
      dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, BBG_25),
      dcPeakKw: f(120, "mfr", "high", undefined, BBG_25),
      acOnboardKw: f(11.5, "mfr", "high", "Standard; a 19.2 kW onboard charger is optional", BBG_25),
      architectureV: f(400, "mfr", "high", undefined, BBG_25),
    },
    warranty: {
      batteryYears: f(8, "mfr", "high", undefined, BBG_25),
      batteryMiles: f(100_000, "mfr", "high", undefined, BBG_25),
    },
    buyerNotes: [noEpaNote(rangeBody), TOW_NOTE],
  });

  // Per model AND per drivetrain, read off the 25MY guide's own two tables
  // (rendered, not extracted — they are four-column grids): the 400 is 177
  // combined FWD and 175 AWD, the 600 is 174 FWD and 179 AWD. The two vans do
  // not rank the same way round, which is exactly why one shared sentence for
  // both was wrong.
  const range2025Std = (model: string, fwd: number, awd: number, city: string) =>
    `GM's 25MY body-builder guide rates the Standard Range ${model} at ${fwd} miles combined with front-wheel drive and ${awd} with all-wheel drive (${city}). Its footnote reads “GM-estimated range based on current capability of analytical projection consistent with SAE J1634 revision 2017-MCT” and ends “EPA estimates not yet available”, so this is GM's own simulation rather than a rating. fueleconomy.gov has never carried a BrightDrop or Zevo under any make or model year, which is consistent with the van's GVWR putting it above EPA's labelling threshold.`;
  const RANGE_2025_MAX =
    "GM's 25MY body-builder guide rates the Max Range van at 272 miles combined, 303 city and 234 highway, footnoted “GM-estimated range based on current capability of analytical projection consistent with SAE J1634 revision 2017-MCT… EPA estimates not yet available”. fueleconomy.gov has never carried a BrightDrop or Zevo under any make or model year, which is consistent with the van's GVWR putting it above EPA's labelling threshold.";

  R.push(
    bd25("brightdrop-400-2025-std", "BrightDrop 400", ALIASES_400, VDS_400, ["Y", "6"], 102.4, "Standard Range", undefined,
      range2025Std("400", 177, 175, "197 city either way; 152 highway FWD, 147 AWD")),
    bd25("brightdrop-400-2025-max", "BrightDrop 400", ALIASES_400, VDS_400, ["Z"], 173.3, "Max Range", "AWD", RANGE_2025_MAX),
    bd25("brightdrop-600-2025-std", "BrightDrop 600", ALIASES_600, VDS_600, ["Y", "6"], 102.4, "Standard Range", undefined,
      range2025Std("600", 174, 179, "193 city FWD and 200 AWD; 151 highway FWD, 152 AWD")),
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
      portStandard: f<PortStandard>("CCS1", "est", "medium", "Carried over from the 2025 van; GM has not announced a NACS change", OM_24),
      dcFastCharging: f<"standard">("standard", "mfr", "high", undefined, BBG_26),
      acOnboardKw: f(19.2, "mfr", "high", "Standard for 2026; the 11.5 kW charger becomes the option", BBG_26),
      architectureV: f(400, "mfr", "high", undefined, BBG_26),
    },
    warranty: BD_WARRANTY_TERM,
    buyerNotes: [
      noEpaNote(
        "GM's 26MY body-builder guide gives each of the three packs its own figure: Standard Range “up to 176 miles”, “(EWU) BATTERY PACK - Extended Range (GM-estimated city/highway combined range up-to 204 miles)”, and “(ETJ) BATTERY PACK - Maximum Range (GM-estimated city/highway combined range up-to 285 miles)”, the last raised from the MY2025 van's 272. All three carry the footnote “GM estimated range based on current capability of analytical projection consistent with SAE J1634 revision 2017-MCT”, and GM adds “Performance targets”. fueleconomy.gov has never carried a BrightDrop or Zevo under any make or model year, so none of the three is an EPA rating — and since nothing in the VIN or the listing says which pack this van has, this page prints no range at all.",
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
// windshield-washer-fluid filling-quantities table, once, against "around
// 5.6 gal"; its high-voltage-battery technical
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
  const MB_SELL_SHEET = "https://www.mbvans.com/content/dam/mb-vans/us/esprinter/eSprinter_Sell-SheetV2.pdf";
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
  // Including the bare diesel-shared names. That was unsafe until this pass —
  // the row had no VIN guard and "Sprinter 2500" is what Mercedes calls the
  // diesel — and it is safe now for exactly the reason the Ford row can alias
  // "Transit": ESPRINTER_VDS below is a hard filter that no diesel VIN passes.
  const ESPRINTER_ALIASES = ["eSprinter 2500", "eSprinter Cargo Van", "eSprinter H.O. Cargo Van", "Sprinter 2500 Electric", "Sprinter 2500", "Sprinter"];
  // VIN position 5, the one field that says electric. Swept through vPIC's
  // partial decoder on 2026-08-25, every character, MY2024 and MY2025 alike:
  //   U -> eSprinter, Electric, 100 kW      V -> eSprinter, Electric, 150 kW
  //   D, E, K, N -> Sprinter, Diesel        0 -> Sprinter, Gasoline
  // Without this guard a diesel Sprinter filed by a dealer under model
  // "eSprinter 2500" — the feed already carries the mislabel in the other
  // direction, an electric van typed as "Sprinter 2500" — would take this
  // row's battery and warranty. Every other row in this file refuses to trust
  // the model string; this one had been the exception.
  const ESPRINTER_VDS = ["4U", "4V"];
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
    vds: ESPRINTER_VDS,
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
    specs: { towRatingLb: f(4100, "mfr", "high", undefined, MB_SELL_SHEET) },
    buyerNotes: [ESPRINTER_RANGE_NOTE],
  });

  R.push({
    id: "esprinter-2025-26",
    make: "MERCEDES-BENZ",
    model: "eSprinter",
    modelAliases: ESPRINTER_ALIASES,
    modelYears: [2025, 2026],
    vds: ESPRINTER_VDS,
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
    specs: { towRatingLb: f(4100, "mfr", "high", undefined, MB_SELL_SHEET) },
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
  // One booklet per model year, because MBUSA publishes one per model year.
  // An earlier draft of this file claimed it published only MY2026 and
  // abstained on that basis; enumerating mbusa.com/en/owners/
  // service-warranty-manuals on 2026-08-25 lists warranty booklets for MY2021,
  // MY2022, MY2023, MY2024, MY2025 and MY2026 plus a MY2027 draft, and all
  // four of the years these rows need were fetched and read. Every one of them
  // states the same line — "HIGH VOLTAGE BATTERY LIMITED WARRANTY Plug-in
  // Hybrid Electric ... 6 Years/62,000 Miles" — so the rows below no longer
  // hedge at medium confidence; each cites its own year.
  const MB_PC_WARRANTY = {
    2023: "https://www.mbusa.com/content/dam/mb-nafta/us/owners/manuals/2023/2023-warranty-booklet.pdf",
    2024: "https://www.mbusa.com/content/dam/mb-nafta/us/owners/manuals/2024/2024-warranty-booklet.pdf",
    2025: "https://www.mbusa.com/content/dam/mb-nafta/us/owners/manuals/2025/MY25%20PC%20Warranty%20and%20Service%20Booklet_Web%20Eng_Sp.pdf",
    2026: "https://www.mbusa.com/content/dam/mb-nafta/us/owners/manuals/2026/MY26PCWarrantyBooklet.pdf",
  } as const;
  const MB_PC_WARRANTY_26 = MB_PC_WARRANTY[2026];
  const S550E_SPEC =
    "https://media.mbusa.com/releases/release-9fab9430c9e44132bdcfdaee10252728-2017-mercedes-benz-s550e-sedan-specifications";
  // MBUSA's launch release for the car (US naming throughout — "S550 PLUG-IN
  // HYBRID"). It is the only Mercedes document that states either of this
  // row's two electrical figures: "The new high-voltage lithium-ion battery
  // with an energy content of 8.7 kWh", and "can be charged via external
  // electricity mains using a 3.6 kW on-board charger". The MY2017
  // specifications release above carries neither, which is why both facts
  // moved here.
  const S550E_LAUNCH =
    "https://media.mbusa.com/releases/release-00c3e3f3f92248998c60ea10fef9d6a6-first-plug-in-hybrid-with-a-star-s550-plug-in-hybrid";
  const S560E_RELEASE =
    "https://media.mbusa.com/releases/release-084a1d95d4de74bc8ef3d0a30a0197a5-eq-power-new-plug-in-hybrid-mercedes-benz-s560e";
  const S580E_PRICING =
    "https://media.mbusa.com/releases/release-651c668371427afb92b6f5676e07e661-mercedes-benz-usa-announces-pricing-for-the-all-new-s-class-plug-in-hybrid";
  const AMG_S63E_RELEASE =
    "https://media.mbusa.com/releases/release-87e09c20de09cff9b36ebaa27401500c-mercedes-amg-s-63-e-performance";

  const S_HP_ABSTAIN =
    "Six Mercedes documents covering all four of these cars never use the words heat pump, and a positive control on the MMA press material shows MBUSA does say it where one exists — but none of these documents states the cabin heating mechanism, so the silence is not an assertion of absence";
  // Re-scoped 2026-08-25 after the original reason turned out to be false:
  // it said MBUSA published only MY2026. It publishes one booklet per model
  // year and its own index goes back to MY2021 — four model years after this
  // car and one after the S 560e ended. That is still a real gap, but it is
  // now a tested one, and the test is the index rather than a guessed URL.
  const S_OLD_WARRANTY_ABSTAIN =
    "MBUSA's published warranty archive begins at model year 2021, after this car was discontinued, so no booklet covering it exists to read and the current 6-year term must not be assumed backwards";

  const S_PHEV_WARRANTY = (year: keyof typeof MB_PC_WARRANTY) => {
    const src = MB_PC_WARRANTY[year];
    return {
      batteryYears: f(6, "mfr", "high", "10 years / 150,000 miles in California and other ZEV-adopting states", src),
      batteryMiles: f(62_000, "mfr", "high", undefined, src),
      batteryTransfers: f(true, "mfr", "high", "Transfers to each subsequent owner", src),
    };
  };
  const S_ALIASES = ["S-Class Sedan", "S Class"];
  const NO_SOH_NOTE = {
    headline: "The battery warranty is 6 years / 62,000 miles with no capacity floor — shorter than any EQ model's",
    body:
      "Mercedes' EQ warranty booklet does not cover plug-in hybrids at all; these cars fall under the ordinary passenger-car booklet, whose High-Voltage Battery Limited Warranty runs “up to 6 years or 62,000 miles, whichever occurs first” against 8 or 10 years for the battery-electric EQ cars. It is transferable “to the original and each subsequent owner”. What it does not do is name a capacity floor: where several makers guarantee a percentage of original capacity, this booklet says only that a replacement battery will be “in a condition appropriate to the age and mileage of the vehicle”, and that “Loss of Capacity due to or resulting from gradual Capacity loss is not covered beyond the terms and limits specified in this Battery Limited Warranty” — covered inside the six years, on Mercedes' own measurement, and not after. Cars registered in California and fourteen other states get 10 years / 150,000 miles instead.",
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
      packGrossKwh: f(8.7, "mfr", "high", "Mercedes calls it the battery's energy content, neither gross nor usable", S550E_LAUNCH),
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
      acOnboardKw: f(3.6, "mfr", "high", "Single-phase, up to 16 amps", S550E_LAUNCH),
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
  const s580e = (id: string, years: [number, number], year: keyof typeof MB_PC_WARRANTY, range: EnrichmentRow["range"], abstainRange?: string, extraNote?: NonNullable<EnrichmentRow["buyerNotes"]>[number]): EnrichmentRow => ({
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
    warranty: S_PHEV_WARRANTY(year),
    buyerNotes: extraNote ? [NO_SOH_NOTE, extraNote] : [NO_SOH_NOTE],
  });

  const S580E_YEAR_HOLE = (year: number, note: string): NonNullable<EnrichmentRow["buyerNotes"]>[number] => ({
    headline: `EPA published no electric-range rating for the ${year} S 580e`,
    body: note,
    severity: "info",
    learnMore: epa(49021),
  });

  R.push(
    s580e("s580e-2023", [2023, 2023], 2023, {
      epaRangeMi: f(56, "mfr", "high", "Electric-only EPA range", epa(47279)),
      epaRangeTotalMi: f(470, "mfr", "high", undefined, epa(47279)),
      mpgeElectric: f(49, "mfr", "high", undefined, epa(47279)),
      mpgeCombined: f(41, "mfr", "high", undefined, epa(47279)),
      mpgGasoline: f(23, "mfr", "high", undefined, epa(47279)),
    }),
    s580e(
      "s580e-2024",
      [2024, 2024],
      2024,
      undefined,
      "EPA filed no MY2024 record for this car, and its rating moved between the two years that bracket it — 56 electric miles in 2023, 48 in 2025 — so neither figure can be carried across the gap",
      S580E_YEAR_HOLE(
        2024,
        "fueleconomy.gov holds S580e 4matic records for 2023 and 2025 but none for 2024, which is a filing gap rather than a change of car — EPA has the same hole on the AMG S 63 E Performance. The two ratings that bracket 2024 disagree: 56 electric miles in 2023 and 48 in 2025. Rather than pick one for a car neither of them describes, this page prints no electric range. Mercedes publishes no US figure of its own for MY2024 either."
      )
    ),
    s580e("s580e-2025", [2025, 2025], 2025, {
      epaRangeMi: f(48, "mfr", "high", "Electric-only EPA range", epa(49021)),
      epaRangeTotalMi: f(470, "mfr", "high", undefined, epa(49021)),
      mpgeElectric: f(63, "mfr", "high", undefined, epa(49021)),
      mpgeCombined: f(42, "mfr", "high", undefined, epa(49021)),
      mpgGasoline: f(23, "mfr", "high", undefined, epa(49021)),
    }),
    s580e(
      "s580e-2026",
      [2026, 2026],
      2026,
      undefined,
      "EPA filed no MY2026 record for this car, and its rating has already moved once inside this generation — 56 electric miles in 2023, 48 in 2025 — so the 2025 figure cannot be assumed to carry forward",
      S580E_YEAR_HOLE(
        2026,
        "fueleconomy.gov holds S580e 4matic records for 2023 and 2025 and none for 2026, and no Mercedes document found this pass publishes a US electric-range figure of its own for the MY2026 car. The rating already moved once inside this generation, from 56 miles in 2023 to 48 in 2025, so carrying 48 forward would be a guess rather than a carry-over. The 2025 car's rating is linked below for comparison, not as this car's number."
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
    warranty: S_PHEV_WARRANTY(2024),
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
