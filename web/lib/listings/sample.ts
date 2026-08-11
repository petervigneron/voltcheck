import type { Listing } from "./types";

// DEMO INVENTORY. Realistic cars, synthetic VINs (valid check digits, correct
// plant/year positions) — stands in for a real feed while the UX is built.
export const SAMPLE_LISTINGS: Listing[] = [
  // The trap pair: two 2023 listings both SAYING "Long Range AWD" at the same
  // price. The Fremont VIN proves the 330-mi car; the Austin VIN could be the
  // mislabeled 279-mi "Model Y AWD" — which is exactly what the site surfaces.
  {
    id: "my23-lr-fremont",
    vin: "7SAYGDEE0PF231862",
    year: 2023, make: "Tesla", model: "Model Y", trim: "Long Range AWD", drive: "AWD",
    priceUsd: 28900, mileage: 44800, city: "Sacramento", state: "CA",
    sellerType: "dealer", exteriorColor: "Pearl White",
  },
  {
    id: "my23-awd-austin",
    vin: "7SAYGDEE1PA123456",
    year: 2023, make: "Tesla", model: "Model Y", trim: "Long Range AWD", drive: "AWD",
    priceUsd: 28900, mileage: 39400, city: "Round Rock", state: "TX",
    sellerType: "dealer", exteriorColor: "Deep Blue",
  },
  {
    id: "m3-2020",
    vin: "5YJ3E1EA8LF790210",
    year: 2020, make: "Tesla", model: "Model 3", trim: "Standard Range Plus", drive: "RWD",
    priceUsd: 19400, mileage: 61000, city: "Portland", state: "OR",
    sellerType: "private", exteriorColor: "Midnight Silver",
  },
  {
    id: "m3-2021",
    vin: "5YJ3E1EAXMF850344",
    year: 2021, make: "Tesla", model: "Model 3", trim: "Standard Range Plus", drive: "RWD",
    priceUsd: 20900, mileage: 52400, city: "Denver", state: "CO",
    sellerType: "dealer", exteriorColor: "Red Multi-Coat",
  },
  // Bolts: the fast-charge lottery, and a replaced-pack car that's underrated.
  {
    id: "bolt18-lt-nodc",
    vin: "1G1FW6S0XJ4100005",
    year: 2018, make: "Chevrolet", model: "Bolt EV", trim: "LT", drive: "FWD",
    priceUsd: 10900, mileage: 68300, city: "Columbus", state: "OH",
    sellerType: "dealer", exteriorColor: "Nightfall Gray",
    photoChecks: { dcFastCharge: "confirmed_absent" },
  },
  {
    id: "bolt18-premier-dc",
    vin: "1G1FX6S07J4137882",
    year: 2018, make: "Chevrolet", model: "Bolt EV", trim: "Premier", drive: "FWD",
    priceUsd: 12800, mileage: 51900, city: "Ann Arbor", state: "MI",
    sellerType: "dealer", exteriorColor: "Kinetic Blue",
    photoChecks: { dcFastCharge: "confirmed_present" },
    campaignCheck: {
      packReplaced: true,
      packReplacedDate: "2022-11-14",
      odometerAtReplacement: 38650,
      gmProgramNumber: "N212343881",
    },
  },
  {
    id: "bolt22",
    vin: "1G1FW6S06N4114201",
    year: 2022, make: "Chevrolet", model: "Bolt EV", trim: "2LT", drive: "FWD",
    priceUsd: 15900, mileage: 30100, city: "Raleigh", state: "NC",
    sellerType: "dealer", exteriorColor: "Summit White",
  },
  // Ioniq 5 pair: same car to a listing site, different winters.
  {
    id: "ioniq5-22-awd",
    vin: "KM8KNDAF2NU080000",
    year: 2022, make: "Hyundai", model: "Ioniq 5", trim: "SEL", drive: "AWD",
    priceUsd: 23400, mileage: 39800, city: "Minneapolis", state: "MN",
    sellerType: "dealer", exteriorColor: "Cyber Gray",
  },
  {
    id: "ioniq5-22-rwd",
    vin: "KM8KMDAF4NU041377",
    year: 2022, make: "Hyundai", model: "Ioniq 5", trim: "SEL", drive: "RWD",
    priceUsd: 22700, mileage: 41500, city: "Chicago", state: "IL",
    sellerType: "dealer", exteriorColor: "Lucid Blue",
  },
  // EV6: the heat pump is on the window sticker, not the trim sheet.
  {
    id: "ev6-23-wind",
    vin: "KNDC3DLC4P5104988",
    year: 2023, make: "Kia", model: "EV6", trim: "Wind", drive: "AWD",
    priceUsd: 24300, mileage: 33900, city: "Bellevue", state: "WA",
    sellerType: "dealer", exteriorColor: "Yacht Blue",
  },
  {
    id: "ev6-23-gt",
    vin: "KNDC5DLC3P5061240",
    year: 2023, make: "Kia", model: "EV6", trim: "GT", drive: "AWD",
    priceUsd: 33800, mileage: 26700, city: "Phoenix", state: "AZ",
    sellerType: "dealer", exteriorColor: "Moonscape",
  },
];

export function getListing(id: string): Listing | undefined {
  return SAMPLE_LISTINGS.find((l) => l.id === id);
}
