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

export function normalize(vehicle, { sourceUrl, dealerDomain }) {
  const offer = Array.isArray(vehicle.offers) ? vehicle.offers[0] : vehicle.offers;
  const mileageObj = vehicle.mileageFromOdometer;
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
    year: num(vehicle.vehicleModelDate ?? vehicle.productionDate ?? vehicle.modelDate),
    make: text(vehicle.brand ?? vehicle.manufacturer),
    model: text(vehicle.model),
    trim: text(vehicle.vehicleConfiguration ?? vehicle.trim),
    name: text(vehicle.name),
    priceUsd: num(offer?.price),
    mileage: num(mileageObj?.value ?? mileageObj),
    exteriorColor: text(vehicle.color),
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
