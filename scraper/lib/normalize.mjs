// schema.org Vehicle → one normalized listing record, VIN-keyed.
const text = (v) => {
  if (v == null) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") return text(v.name ?? v["@value"] ?? v.value);
  return undefined;
};

const num = (v) => {
  const s = text(v);
  if (!s) return undefined;
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// vehicleModelDate is nominally a model year but some dealer platforms emit a
// full date ("2025-01-01"); digit-stripping that yields 20250101, which
// overflows the DB's smallint year column. Take the leading 4-digit year and
// bound it to plausible model years instead.
const modelYear = (v) => {
  const m = text(v)?.match(/\b(19[89]\d|20\d{2})\b/);
  const y = m ? Number(m[0]) : undefined;
  return y >= 1981 && y <= new Date().getFullYear() + 2 ? y : undefined;
};

// driveWheelConfiguration arrives as free text ("All-wheel Drive", "AWD") or a
// schema.org URL (…/AllWheelDriveConfiguration). Map to the registry's tokens.
const driveLine = (v) => {
  const s = text(v)?.toUpperCase();
  if (!s) return undefined;
  if (/ALL.?WHEEL|AWD/.test(s)) return "AWD";
  if (/FOUR.?WHEEL|4WD|4X4/.test(s)) return "4WD";
  if (/REAR.?WHEEL|RWD/.test(s)) return "RWD";
  if (/FRONT.?WHEEL|FWD/.test(s)) return "FWD";
  return undefined;
};

export function normalize(vehicle, { sourceUrl, dealerDomain }) {
  const offer = Array.isArray(vehicle.offers) ? vehicle.offers[0] : vehicle.offers;
  const mileageObj = vehicle.mileageFromOdometer;
  // Dealer identity/location from the offer's seller block (AutoDealer with a
  // PostalAddress). Only trusted when structured — a bare string address could
  // be anything, so it is not guessed at.
  const seller = Array.isArray(offer?.seller) ? offer.seller[0] : offer?.seller;
  const addr = seller?.address && typeof seller.address === "object" ? seller.address : undefined;
  const images = (Array.isArray(vehicle.image) ? vehicle.image : [vehicle.image])
    .map(text)
    .filter(Boolean)
    .slice(0, 12);
  // The offer's url is the car's own page (VDP) — canonical even when this
  // vehicle node was embedded in a search-results page.
  const vdpUrl = text(offer?.url);
  return {
    images,
    description: text(vehicle.description)?.slice(0, 2000),
    vdpUrl,
    vin: text(vehicle.vehicleIdentificationNumber)?.toUpperCase(),
    year: modelYear(vehicle.vehicleModelDate ?? vehicle.productionDate ?? vehicle.modelDate),
    make: text(vehicle.brand ?? vehicle.manufacturer),
    model: text(vehicle.model),
    trim: text(vehicle.vehicleConfiguration ?? vehicle.trim),
    name: text(vehicle.name),
    priceUsd: num(offer?.price),
    mileage: num(mileageObj?.value ?? mileageObj),
    exteriorColor: text(vehicle.color),
    interiorColor: text(vehicle.vehicleInteriorColor),
    driveLine: driveLine(vehicle.driveWheelConfiguration),
    stockNumber: text(vehicle.sku ?? vehicle.mpn ?? offer?.sku),
    previousOwners: num(vehicle.numberOfPreviousOwners),
    dealerName: text(seller?.name),
    city: text(addr?.addressLocality),
    state: text(addr?.addressRegion),
    zip: text(addr?.postalCode),
    condition: text(vehicle.itemCondition)?.replace(/.*\//, ""),
    imageUrl: text(Array.isArray(vehicle.image) ? vehicle.image[0] : vehicle.image),
    sourceUrl: vdpUrl ?? sourceUrl,
    dealerDomain,
    scrapedAt: new Date().toISOString(),
  };
}

// When the same VIN is seen twice (SRP tile now, VDP later), keep the richer
// record.
export function richness(rec) {
  return (
    (rec.mileage != null ? 2 : 0) +
    (rec.trim ? 2 : 0) +
    (rec.description ? 1 : 0) +
    Math.min(rec.images?.length ?? 0, 5) +
    (rec.fromVdp ? 3 : 0)
  );
}
