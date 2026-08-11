// Team Velocity platform (teamvelocityportal.com API; seen on livermoreford.net,
// dublinmazda.com). Unlike Dealer.com/DealerOn there's no single JSON blob —
// VDPs server-render a long sequence of `var name = 'value';` assignments that
// the page's own JS reads directly. The vehicle-specific block (vin, trim,
// driveTrain, vdpVehicle*) plus a dealer-info block (city/state/zip/clientName,
// present on every page) carry the odometer/interior/address fields the
// generic JSON-LD summary is missing.
function grabVar(html, name) {
  const m = html.match(new RegExp(`var\\s+${name}\\s*=\\s*["']([^"']*)["']`));
  return m && m[1] !== "" ? m[1] : undefined;
}

export function extractTeamVelocity(html) {
  const vin = grabVar(html, "vin");
  if (!vin) return null;
  // `miles` is server-rendered as a ternary literal — new-inventory pages
  // read '0', everything else carries the real odometer figure as the
  // else-branch, e.g. var miles = 'cpo' ==='new' ? '0':'23584';
  const milesMatch = html.match(
    /var\s+miles\s*=\s*['"]([^'"]*)['"]\s*===\s*['"]new['"]\s*\?\s*['"]0['"]\s*:\s*['"](\d+)['"]/
  );
  const mileage = milesMatch
    ? milesMatch[1] === "new"
      ? 0
      : Number(milesMatch[2])
    : undefined;
  return {
    vin: vin.toUpperCase(),
    stockNumber: grabVar(html, "stockNumber"),
    trim: grabVar(html, "trim"),
    driveTrain: grabVar(html, "driveTrain"),
    vehicleType: grabVar(html, "vehicleType"), // "new" | "used" | "cpo"
    exteriorColor: grabVar(html, "vdpVehicleExteriorColor"),
    interiorColor: grabVar(html, "vdpVehicleInteriorColor"),
    mileage,
    dealer: {
      name: grabVar(html, "clientName"),
      city: grabVar(html, "city"),
      state: grabVar(html, "state"),
      zip: grabVar(html, "zip"),
    },
  };
}

const DRIVES = new Set(["FWD", "RWD", "AWD", "4WD"]);

// Merge Team Velocity fields into a normalized record. Mileage passes through
// verbatim including 0 for new inventory (same standing as dealeron.mjs: the
// dealer's own page shows "Mileage: 0" to shoppers on these cars).
export function enrichFromTeamVelocity(rec, data) {
  if (!data || data.vin !== rec.vin) return rec;
  return {
    ...rec,
    mileage: data.mileage ?? rec.mileage,
    trim: data.trim ?? rec.trim,
    driveLine: DRIVES.has(data.driveTrain) ? data.driveTrain : rec.driveLine,
    exteriorColor: data.exteriorColor ?? rec.exteriorColor,
    interiorColor: data.interiorColor ?? rec.interiorColor,
    certified: data.vehicleType === "cpo" || undefined,
    stockNumber: data.stockNumber ?? rec.stockNumber,
    city: data.dealer.city ?? rec.city,
    state: data.dealer.state ?? rec.state,
    zip: data.dealer.zip ?? rec.zip,
    dealerName: data.dealer.name ?? rec.dealerName,
    platform: "team-velocity",
  };
}
