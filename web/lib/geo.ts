// Pure distance math — client-safe. The zip → coordinates lookup lives in
// lib/zips.ts, server-side, so the 892K centroid table never ships to (or
// gets parsed by) anything that only needs to measure a distance.
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
