// Census ZCTA centroids (2024 gazetteer, public domain): zip → [lat, lng].
// Server-only, and imported lazily — 892K of JSON that only zip-aware code
// paths should ever load or parse.
let zipsPromise: Promise<Record<string, [number, number]>> | undefined;

export async function zipCoords(zip: string | undefined): Promise<[number, number] | undefined> {
  if (!zip) return undefined;
  zipsPromise ??= import("@/data/zips.json").then(
    (m) => m.default as unknown as Record<string, [number, number]>
  );
  return (await zipsPromise)[zip.trim().slice(0, 5)];
}
