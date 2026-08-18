// Is this vehicle an EV? Belt and suspenders: structured fuel-type fields
// first, then VIN WMI, then model-name match. Anything that only matches by
// name is flagged lower-confidence so the pipeline can vPIC-verify it later.
export const EV_MODEL_RE = new RegExp(
  [
    "model [3sxy]\\b", "cybertruck",
    "bolt e[uv]v?", "silverado ev", "blazer ev", "equinox ev", "lyriq", "hummer ev",
    "sierra ev", "escalade iq", "optiq", "vistiq", "celestiq",
    "charger daytona", "wagoneer s", "500e", "cooper se", "countryman se",
    "leaf", "ariya",
    "ioniq 5", "ioniq 6", "ioniq5", "ioniq6", "kona electric",
    "ev6", "ev9", "niro ev", "soul ev",
    "id\\.? ?4", "id\\.? ?buzz", "e-tron", "q4 e", "q8 e", "taycan", "macan electric",
    "mach-e", "mach e", "f-150 lightning", "lightning",
    // \b in front of the iX too, for the same reason as the C40 above: bare
    // "ix\b" matched the tail of every word ending in those letters, so a
    // Toyota Matrix and a Pontiac Grand Prix both came back name-matched EVs
    // (2026-08-16). vPIC declined to confirm them and ingest held them, as
    // designed — the cost was the decode, not a false listing.
    "i3\\b", "i4\\b", "i5\\b", "i7\\b", "\\bix\\b",
    "eqb", "eqe", "eqs",
    "polestar [234]", "r1t", "r1s", "lucid air", "lucid gravity",
    "bz4x", "solterra", "prologue", "zdx",
    // The Lexus RZ enumerated its variants and got the list wrong as Lexus
    // added them: "rz ?[34]50" covered the RZ 350e and RZ 450e but not the
    // RZ 300e or the RZ 550e, so half of Lexus's only BEV nameplate fell
    // through to name_match (found 2026-08-18 building lib/oem/toyota.mjs,
    // where the live CPO lot carries all four). Every RZ variant Lexus has
    // sold is battery-electric, so widening the digits is a correction, not a
    // relaxation. The \b in front is the same guard the iX and C40 entries
    // above needed: unanchored, "rz" matches inside other words.
    // 300e / 350e / 450e / 550e — the second digit is 0 or 5, so [3-5][05]0.
    "\\brz ?[3-5][05]0e?\\b",
    // \b on the C40: unanchored, it matched inside "XC40", so every petrol
    // XC40 came back a name-matched EV (a 2022 XC40 T5 AWD R-Design on
    // gaautoworld.com, 2026-08-16). vPIC refuted them before ingest, so
    // nothing false reached the site — it just spent a decode on each.
    "ex30", "ex90", "\\bc40", "xc40 recharge",
  ].join("|"),
  "i"
);

// Makers whose every car is a BEV, so the WMI alone settles it. Membership
// here is load-bearing in a way that is easy to miss: vpic-enrich's
// fuelTextOnly guard deliberately SKIPS vPIC verification for these VINs, so
// a wrong entry ships a non-EV at high confidence with nothing downstream to
// catch it.
//
// LPS was wrong and was removed 2026-08-18. Polestar used it for the BEV
// Polestar 2 AND the Polestar 1, which is a plug-in hybrid — four 2021
// Polestar 1s were live on the site as EVs because of it. Polestar 2/3/4 lose
// nothing: they match EV_MODEL_RE by nameplate, so they arrive as
// "name_match" and vPIC promotes them, while a Polestar 1 gets refuted. The
// slower path is the correct one when the VIN genuinely does not settle it.
// LPS was wrong and was removed 2026-08-18 (Polestar 1 is a plug-in hybrid
// sharing the Polestar 2's WMI). Worth recording WHY it was the entry that
// broke, because it generalises: vPIC's DecodeWMI shows LPS is registered to
// "ZHEJIANG HAOQING AUTOMOBILE MFG CO LTD" — a Geely contract plant, not a
// brand — so it can carry whatever that factory builds. The safe entries are
// the ones registered to the EV maker itself with no parent company.
//
// 7UU added 2026-08-18: Lucid's SECOND WMI, and it was missing. The Air is 50E
// but every Gravity is 7UU, so a used Gravity on a dealer site fell through to
// the name-match path and only landed if the listing said "Lucid Gravity"
// rather than, say, "Gravity Grand Touring". Checked against vPIC rather than
// inferred, both per-VIN and per-WMI: 7UUG1TJK2VA046654 decodes Make LUCID,
// FuelTypePrimary Electric, ElectrificationLevel "BEV (Battery Electric
// Vehicle)"; DecodeWMI/7UU and /50E both return ManufacturerName "LUCID USA,
// INC." with an empty ParentCompanyName, and vPIC lists exactly two models
// ever built under that make (Air, Gravity), both battery-electric.
// Rivian's 7FC/7PD were re-checked at the same time and stay: DecodeWMI
// returns Make RIVIAN / "RIVIAN AUTOMOTIVE LLC" / no parent company for both,
// and vPIC's model list for the make is R1T, R1S, RCV, EDV, R2 — Rivian has
// never built a plug-in hybrid or a combustion vehicle under any of them.
export const EV_ONLY_WMIS = new Set(["5YJ", "7SA", "7G2", "LRW", "XP7", "7FC", "7PD", "50E", "7UU", "YSP"]);

const text = (v) => (v == null ? "" : typeof v === "string" ? v : JSON.stringify(v));

export function classifyEv(vehicle) {
  const fuelFields = [
    vehicle.fuelType,
    vehicle.vehicleEngine?.fuelType,
    ...(Array.isArray(vehicle.vehicleEngine) ? vehicle.vehicleEngine.map((e) => e?.fuelType) : []),
  ].map(text).join(" ").toLowerCase();

  if (fuelFields.includes("electric")) {
    // "electric" alone still admits hybrids ("Gas/Electric Hybrid")
    if (fuelFields.includes("hybrid") || fuelFields.includes("gas")) {
      return fuelFields.includes("plug") ? { isEv: true, kind: "PHEV", confidence: "high" } : { isEv: false };
    }
    return { isEv: true, kind: "BEV", confidence: "high" };
  }

  const vin = text(vehicle.vehicleIdentificationNumber).toUpperCase();
  if (vin.length === 17 && EV_ONLY_WMIS.has(vin.slice(0, 3))) {
    return { isEv: true, kind: "BEV", confidence: "high" };
  }

  const name = [vehicle.name, vehicle.model, text(vehicle.model?.name)].map(text).join(" ");
  if (EV_MODEL_RE.test(name)) return { isEv: true, kind: "BEV?", confidence: "name_match" };

  return { isEv: false };
}
