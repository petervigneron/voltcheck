// Dealer.com (DDC) platform extractor. VDPs embed the full vehicle record —
// odometer, trim, driveLine, colors, images, features, and GM RPO optionCodes —
// in `DDC.dataLayer['vehicles'] = [ {...} ]`, server-rendered in the HTML the
// page serves to everyone. This is the same data the page's own widgets read.
const MARKER = /DDC\.dataLayer\[['"]vehicles['"]\]\s*=\s*\[/;

// Some dealers' feeds leak invalid JSON escapes into this blob (e.g.
// "Front\-Wheel Drive" — \- isn't a JSON escape), which makes JSON.parse
// throw and silently drops the whole vehicles array. Strip the backslash on
// any escape JSON doesn't recognize; valid escapes (\" \\ \/ \b \f \n \r \t
// \uXXXX) pass through untouched.
const sanitizeJson = (s) => s.replace(/\\(?!["\\/bfnrtu])/g, "");

export function extractDdcVehicles(html) {
  const m = html.match(MARKER);
  if (!m) return [];
  const start = html.indexOf("[", m.index + m[0].length - 1);
  let depth = 0;
  let end = start;
  for (let j = start; j < html.length; j++) {
    if (html[j] === "[") depth++;
    else if (html[j] === "]") {
      depth--;
      if (depth === 0) {
        end = j;
        break;
      }
    }
  }
  try {
    const arr = JSON.parse(sanitizeJson(html.slice(start, end + 1)));
    return Array.isArray(arr) ? arr.filter((v) => v && v.vin) : [];
  } catch {
    return [];
  }
}

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// Merge DDC fields into a normalized record (DDC wins where present — it's
// the platform's own structured data, richer than the JSON-LD summary).
export function enrichFromDdc(rec, ddcVehicle) {
  if (!ddcVehicle || ddcVehicle.vin?.toUpperCase() !== rec.vin) return rec;
  const d = ddcVehicle;
  return {
    ...rec,
    mileage: num(d.odometer) ?? rec.mileage,
    trim: d.trim && d.trim !== "null" ? d.trim : rec.trim,
    driveLine: ["FWD", "RWD", "AWD", "4WD"].includes(d.driveLine) ? d.driveLine : undefined,
    exteriorColor: d.exteriorColor ?? rec.exteriorColor,
    interiorColor: d.interiorColor ?? undefined,
    // internetPrice is the price the platform's own widgets display, and it
    // beats the JSON-LD offer price: dealer.com's JSON-LD mirrors askingPrice,
    // which some rooftops misconfigure — observed carrying the accessories
    // total ($2,293 on a $50,273 car, vanhyundai.com VIN 7YAKN4DA0SY005538,
    // 2026-08-14).
    priceUsd: num(d.internetPrice) ?? num(d.salePrice) ?? rec.priceUsd ?? num(d.askingPrice),
    optionCodes: Array.isArray(d.optionCodes) && d.optionCodes.length ? d.optionCodes : undefined,
    certified: d.certified === "true" || d.certified === true || undefined,
    stockNumber: d.stockNumber ?? undefined,
    city: d.address?.city ?? rec.city,
    state: d.address?.state ?? rec.state,
    zip: d.address?.postalCode ?? rec.zip,
    // On group sites the accountName is the actual rooftop (e.g. "Hendrick
    // Kia of Cary"), which beats attributing every car to the group domain.
    dealerName: d.accountName ?? rec.dealerName,
    condition: d.newOrUsed ?? rec.condition,
    platform: "dealer.com",
  };
}
