// What the in-chat card reads: the `structuredContent` of a search_listings
// result on the UI-enabled connector (/api/mcp?ui=1; lib/mcp/ui/html.ts says
// how that is tested and switched on). Pure. The model-facing `content` text
// is built elsewhere and is untouched by anything here.
//
// Small on purpose. A tool result above ~150,000 characters never reaches the
// app in claude.ai or Claude Desktop (claude.com/docs/connectors/building/
// mcp-apps/troubleshooting, "App doesn't render when tool results are
// large"), and the card shows at most CARD_MAX cars, so it is handed exactly
// those and nothing a card does not print.

import { SITE, type ApiListing } from "@/lib/api/records";
import type { SearchBreakdown } from "@/lib/api/search";

/** The one UI resource. tools/list points search_listings at it. */
export const CARD_URI = "ui://censusev/cars";
/** The design guidelines' carousel: 3 to 8 items. */
export const CARD_MAX = 8;
/** The label a visit from a card arrives with (lib/visit.ts visitSrc). */
export const CARD_REF = "mcp-card";
const TITLE_MAX = 120;

export interface CardCar {
  vin: string;
  title: string;
  price_usd?: number;
  mileage?: number;
  location: { city?: string; state?: string };
  distance_mi?: number;
  range_mi?: number;
  /** Present (true) only when the range is not the manufacturer's or EPA's own figure. */
  range_estimated?: true;
  /** Present (true) for a plug-in hybrid: the range is its electric-only range. */
  range_electric_only?: true;
  battery_kwh?: number;
  battery_estimated?: true;
  /** https://censusev.com/img/<vin>, only when the listing has a photo. */
  image?: string;
  /** Our listing page, labelled ?ref=mcp-card. Never a dealer link. */
  url: string;
}

export interface Card {
  cars: CardCar[];
  total: number;
  as_of: string;
  breakdown?: SearchBreakdown;
}

type Rec = ApiListing & { distance_mi?: number };

/** Our own listing page for a record, labelled; undefined when the record's
 *  url is not on this site, so a card can never carry anyone else's link. */
function cardUrl(rec: Rec): string | undefined {
  if (typeof rec.url !== "string" || !rec.url.startsWith(`${SITE}/`)) return undefined;
  try {
    const u = new URL(rec.url);
    u.search = "";
    u.hash = "";
    u.searchParams.set("ref", CARD_REF);
    return u.toString();
  } catch {
    return undefined;
  }
}

export function cardCar(rec: Rec): CardCar | undefined {
  const url = cardUrl(rec);
  if (!url || typeof rec.vin !== "string" || !rec.vin) return undefined;
  const vin = rec.vin.toUpperCase();
  const car: CardCar = { vin, title: String(rec.title ?? "").slice(0, TITLE_MAX), location: {}, url };
  if (typeof rec.price_usd === "number" && rec.price_usd > 0) car.price_usd = rec.price_usd;
  if (typeof rec.mileage === "number" && rec.mileage >= 0) car.mileage = rec.mileage;
  if (rec.location?.city) car.location.city = rec.location.city;
  if (rec.location?.state) car.location.state = rec.location.state;
  if (typeof rec.distance_mi === "number") car.distance_mi = rec.distance_mi;
  if (rec.range && rec.range.mi > 0) {
    car.range_mi = rec.range.mi;
    if (rec.range.estimated) car.range_estimated = true;
    if (rec.range.electric_only) car.range_electric_only = true;
  }
  if (rec.battery && rec.battery.kwh > 0) {
    car.battery_kwh = rec.battery.kwh;
    if (rec.battery.estimated) car.battery_estimated = true;
  }
  if (rec.image_url) car.image = `${SITE}/img/${vin.toLowerCase()}`;
  return car;
}

/** The card for one search: the first CARD_MAX cars of the page in the
 *  page's own order, the count of every match, and the breakdown already
 *  computed for the model. */
export function cardOf(r: { total: number; as_of: string; breakdown?: SearchBreakdown }, records: Rec[]): Card {
  const cars: CardCar[] = [];
  for (const rec of records) {
    if (cars.length >= CARD_MAX) break;
    const c = cardCar(rec);
    if (c) cars.push(c);
  }
  return { cars, total: r.total, as_of: r.as_of, ...(r.breakdown ? { breakdown: r.breakdown } : {}) };
}
