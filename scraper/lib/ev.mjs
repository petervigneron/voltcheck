// Is this vehicle an EV? Belt and suspenders: structured fuel-type fields
// first, then VIN WMI, then model-name match. Anything that only matches by
// name is flagged lower-confidence so the pipeline can vPIC-verify it later.
const EV_MODEL_RE = new RegExp(
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
    "i3\\b", "i4\\b", "i5\\b", "i7\\b", "ix\\b",
    "eqb", "eqe", "eqs",
    "polestar [234]", "r1t", "r1s", "lucid air", "lucid gravity",
    "bz4x", "solterra", "rz ?[34]50", "prologue", "zdx",
    "ex30", "ex90", "c40", "xc40 recharge",
  ].join("|"),
  "i"
);

// Tesla, Rivian, Lucid, Polestar build only EVs — WMI alone settles those.
const EV_ONLY_WMIS = new Set(["5YJ", "7SA", "7G2", "LRW", "XP7", "7FC", "7PD", "50E", "LPS", "YSP"]);

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
