import zipData from "@/data/zips.json";

// Census ZCTA centroids (2024 gazetteer, public domain): zip → [lat, lng]
const ZIPS = zipData as unknown as Record<string, [number, number]>;

export function zipCoords(zip: string | undefined): [number, number] | undefined {
  if (!zip) return undefined;
  return ZIPS[zip.trim().slice(0, 5)];
}

export function milesBetween(a: [number, number], b: [number, number]): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}
