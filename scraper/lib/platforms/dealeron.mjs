// DealerOn platform extractor. VDPs embed `sdDataLayer = {...}` with
// vehicleDetails (vin, trim, drivetrain, colors, price, fuelType) plus the
// dealer's city/state/zip, and render odometer as a server-side
// info__item--mileage block. All in the HTML served to everyone.
export function extractDealerOn(html) {
  const m = html.match(/sdDataLayer\s*=\s*\{/);
  if (!m) return null;
  const start = html.indexOf("{", m.index);
  let depth = 0;
  let end = start;
  for (let j = start; j < html.length; j++) {
    if (html[j] === "{") depth++;
    else if (html[j] === "}") {
      depth--;
      if (depth === 0) {
        end = j;
        break;
      }
    }
  }
  let dl;
  try {
    dl = JSON.parse(html.slice(start, end + 1));
  } catch {
    return null;
  }
  const mileageMatch = html.match(/info__item--mileage[\s\S]{0,500}?info__value"[^>]*title="([\d,]+)"/);
  return {
    vehicle: dl.vehicleDetails ?? null,
    dealer: { city: dl.dealerCity, state: dl.dealerState, zip: dl.dealerZipCode, name: dl.dealerName },
    mileage: mileageMatch ? Number(mileageMatch[1].replace(/,/g, "")) : undefined,
  };
}

const DRIVES = new Set(["FWD", "RWD", "AWD", "4WD"]);

export function enrichFromDealerOn(rec, data) {
  const v = data?.vehicle;
  if (!v || String(v.vin).toUpperCase() !== rec.vin) return rec;
  return {
    ...rec,
    // Dealer-stated mileage passes through verbatim, 0 included — it has the
    // same standing as the dealer's price. (Verified: the dealer's own page
    // shows "Mileage: 0" to shoppers on these cars.) Implausible values get
    // flagged at display, not suppressed.
    mileage: data.mileage ?? rec.mileage,
    trim: v.trim && v.trim !== "Base" ? v.trim : rec.trim ?? v.trim,
    driveLine: DRIVES.has(v.drivetrain) ? v.drivetrain : rec.driveLine,
    exteriorColor: v.exteriorColor ?? rec.exteriorColor,
    interiorColor: v.interiorColor ?? rec.interiorColor,
    priceUsd: rec.priceUsd ?? (Number(v.displayedPrice) > 0 ? Number(v.displayedPrice) : undefined),
    condition: typeof v.status === "string" ? v.status.toLowerCase() : rec.condition,
    city: data.dealer?.city ?? rec.city,
    state: data.dealer?.state ?? rec.state,
    zip: data.dealer?.zip ?? rec.zip,
    dealerName: data.dealer?.name ?? rec.dealerName,
    stockNumber: v.stockNumber ?? rec.stockNumber,
    platform: "dealeron",
  };
}
