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
    "bz4x", "solterra", "rz ?[34]50", "prologue", "zdx",
    // \b on the C40: unanchored, it matched inside "XC40", so every petrol
    // XC40 came back a name-matched EV (a 2022 XC40 T5 AWD R-Design on
    // gaautoworld.com, 2026-08-16). vPIC refuted them before ingest, so
    // nothing false reached the site — it just spent a decode on each.
    "ex30", "ex90", "\\bc40", "xc40 recharge",
  ].join("|"),
  "i"
);

// Tesla, Rivian and Lucid build only EVs — WMI alone settles those. Nothing
// goes on this list that isn't settled: a hit here is "high" confidence, and
// ingest.mjs admits "high" without a vPIC check, so a wrong entry ships a
// false claim rather than costing a decode.
//
// Polestar was on it and shouldn't have been. The Polestar 1 is a plug-in
// hybrid — 2.0L petrol driving the front axle — and shares the LPS block with
// the battery-electric Polestar 2: LPSBE0YL8MB001098 (a 2021 Polestar 1 on
// bobpenkhusmazdaatpowers.com) against LPSED3KA2NL078778 (a 2022 Polestar 2),
// both from the same crawl. Four Polestar 1s reached the feed as high-
// confidence BEVs that way. Dropping LPS costs the Polestar 2s nothing they
// can't get back: they match EV_MODEL_RE by nameplate, and vPIC promotes them
// (LPSED3KA2NL078778 decodes BEV) while refuting the 1 (LPSBE0YL8MB001098
// decodes FuelTypePrimary "Gasoline", level "Strong HEV") — measured
// 2026-08-18. A Polestar-1-only exception ahead of the WMI check was the
// other option and was rejected: it would rest on reading LPSB vs LPSE out
// of the VDS, which Polestar documents nowhere.
//
// "YSP" went with it. It was in the first commit, no Polestar VIN in the
// 64,436-row snapshot starts with it, and vPIC knows no such WMI — neither
// DecodeWMI/YSP nor Polestar's own manufacturer listing (which returns YSM,
// YSR, 7SY). Absence from vPIC alone wouldn't settle it, since LRW and XP7
// are real Tesla blocks vPIC's US registry doesn't carry either; absence of
// any observation on top of it does.
//
// Polestar's other observed blocks — YSM (Polestar 2), YSR and 7SY (both
// Polestar 3 in the snapshot; the Polestar 4 is reported on YSR as well) —
// are deliberately NOT added. They'd buy no
// coverage: 62 rows on those WMIs are in the feed today with no WMI support
// at all, carried by fuel-type text and the "polestar [234]" nameplate, and
// among them are Polestar 3s whose model field is the bare digit "3". What
// they would buy is the vPIC exemption above, on a make that has already
// used one WMI block for two powertrains.
export const EV_ONLY_WMIS = new Set(["5YJ", "7SA", "7G2", "LRW", "XP7", "7FC", "7PD", "50E"]);

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
