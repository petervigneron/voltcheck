// A fixed, deterministic feed for pinning the free asking-vs-similar band
// (tests/new-car-band.test.ts): used cohorts priced to land in every band,
// a buyback, a recent car, and new cars with and without a sticker.
import type { Listing } from "../../lib/listings/types";
import type { EnrichedListing } from "../../lib/listings/enrich";
import type { RecentAsk } from "../../lib/listings/recentAsks";

// A small deterministic generator: the same numbers on every run.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

const COHORTS = [
  { vin8: "KNDC3DLC", year: 2023, make: "Kia", model: "EV6", centre: 31000, id: "EV6 77", drive: "RWD" as const },
  { vin8: "5YJ3E1EA", year: 2022, make: "Tesla", model: "Model 3", centre: 27000, id: "M3 LR", drive: "AWD" as const },
  { vin8: "1G1FY6S0", year: 2023, make: "Chevrolet", model: "Bolt EV", centre: 19000, id: "Bolt 65", drive: undefined },
  { vin8: "WBY73AW0", year: 2024, make: "BMW", model: "i4", centre: 48000, id: "i4 81", drive: "RWD" as const },
];

export function pinFeed(): { listings: Listing[]; enriched: Map<string, EnrichedListing>; trimKeys: Map<string, string>; recent: RecentAsk[] } {
  const r = rng(20261118);
  const listings: Listing[] = [];
  const enriched = new Map<string, EnrichedListing>();
  const trimKeys = new Map<string, string>();
  let serial = 100000;
  for (const c of COHORTS) {
    const n = 6 + Math.floor(r() * 30);
    for (let i = 0; i < n; i++) {
      const vin = `${c.vin8}0P${serial++}`.slice(0, 17).padEnd(17, "0");
      const mileage = 8000 + Math.floor(r() * 50000);
      // Mostly near the centre, a few far out either way.
      const z = r();
      const off = z < 0.08 ? -0.12 : z < 0.16 ? 0.12 : (r() - 0.5) * 0.12;
      const priceUsd = Math.round(c.centre * (1 + off) - 0.09 * (mileage - 30000));
      const l: Listing = {
        id: vin.toLowerCase(), vin, year: c.year, make: c.make, model: c.model, drive: c.drive,
        priceUsd, mileage, sellerType: "dealer", condition: "used",
        buybackDisclosed: i === 2 ? true : undefined,
      };
      listings.push(l);
      enriched.set(vin, { listing: l, row: { id: c.id, drive: c.drive } } as unknown as EnrichedListing);
    }
    // New cars of the same cohort with no sticker: the used rule refuses them
    // (under 2,000 miles) and the new rule has nothing to compare.
    for (let i = 0; i < 4; i++) {
      const vin = `${c.vin8}0N${serial++}`.slice(0, 17).padEnd(17, "0");
      const l: Listing = { id: vin.toLowerCase(), vin, year: c.year, make: c.make, model: c.model, drive: c.drive, priceUsd: c.centre + 9000, mileage: i % 2 ? 5 : undefined, sellerType: "dealer", condition: "new" };
      listings.push(l);
      enriched.set(vin, { listing: l, row: { id: c.id, drive: c.drive } } as unknown as EnrichedListing);
    }
  }
  const recent: RecentAsk[] = [
    { vin: "KNDC3DLC0P9999990", year: 2023, mileage: 30000, priceUsd: 30500, condition: "used", drive: "RWD", identity: "EV6 77", recent: true },
  ];
  return { listings, enriched, trimKeys, recent };
}
