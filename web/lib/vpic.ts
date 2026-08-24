import type { VinDecode } from "./types";

const VPIC_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues";

const num = (s: string | undefined): number | undefined => {
  if (!s || s.trim() === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

const str = (s: string | undefined): string | undefined =>
  s && s.trim() !== "" ? s.trim() : undefined;

export function isValidVin(vin: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin);
}

export async function decodeVin(vin: string): Promise<VinDecode> {
  const res = await fetch(`${VPIC_URL}/${encodeURIComponent(vin)}?format=json`, {
    // vPIC data for a given VIN is effectively static; cache a day.
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`vPIC returned HTTP ${res.status}`);
  const json = await res.json();
  const r = json?.Results?.[0] ?? {};

  // ErrorCode 7 = manufacturer not registered with NHTSA — the signature of a
  // non-US-market car (Shanghai/Berlin Teslas, grey imports). Blank make, same
  // meaning. Must not fall through silently.
  const errorCodes = String(r.ErrorCode ?? "").split(",").map((s: string) => s.trim());
  const usMarket = !errorCodes.includes("7") && str(r.Make) !== undefined;

  return {
    vin: vin.toUpperCase(),
    usMarket,
    make: str(r.Make),
    model: str(r.Model),
    modelYear: num(r.ModelYear),
    plantCity: str(r.PlantCity),
    plantState: str(r.PlantState),
    plantCountry: str(r.PlantCountry),
    electrificationLevel: str(r.ElectrificationLevel),
    bodyClass: str(r.BodyClass),
    series: str(r.Series),
    trim: str(r.Trim),
    trimFromVpic: str(r.Trim) ? true : undefined,
    driveType: str(r.DriveType),
    batteryKwhHint: num(r.BatteryKWh),
    errorText: usMarket ? undefined : str(r.ErrorText),
  };
}
