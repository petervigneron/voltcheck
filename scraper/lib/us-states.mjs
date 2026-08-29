// Is this listing's address in the United States?
//
// The site's whole premise is EVs and PHEVs for sale in the UNITED STATES, and
// until 2026-08-29 nothing in the dealer-crawl lane checked. normalize.mjs
// takes JSON-LD's addressRegion verbatim, so whatever a page says becomes the
// listing's state, and 82 foreign cars were live:
//
//   clikautofinance.com   18 cars   Querétaro / Michoacán de Ocampo / CDMX
//                                   $440,000-$962,900 — Mexican PESOS
//   castlegartoyota.com   30 cars   British Columbia
//   vernontoyota.com
//   oceanparkford.com     23 cars   BC
//   frontierwhitecourt.com 11 cars  AB
//   stampedeauto.com                $48,000-$53,000 — Canadian DOLLARS
//
// The Mexican rows were caught by live-price-audit.mjs only because a peso
// price is ~20x a dollar one and reads as absurd. The CANADIAN rows are the
// dangerous half and no audit was ever going to find them: 1.37 CAD to the
// dollar makes a $51,300 sticker look like a perfectly ordinary US asking
// price. A shopper would have seen a plausible number, in the wrong currency,
// on a car they cannot buy.
//
// Every OEM lane already had a private copy of this set (oem/honda.mjs,
// kia.mjs, genesis.mjs, mazda.mjs, mitsubishi.mjs) and used it the weaker way
// — to null out a foreign state while keeping the car. That is right for a
// locator feed, where a missing state is cosmetic. It is not enough for the
// dealer lane, where the address is what says the car is in the market at all.
//
// Full names as well as codes: three live listings carry "Georgia" spelled
// out, which is a US state and must not be dropped by a codes-only test.
const CODES =
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO " +
  "MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY " +
  "DC PR VI GU AS MP";

// Spelled out, as a plain list. An earlier version packed these into one
// delimited string and silently lost every multi-word name — "New York" and
// "West Virginia" both read as foreign — which is exactly the kind of clever
// that has no business guarding whether a car is in the country.
const US_STATE_NAMES = new Set([
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
  "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
  "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
  "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
  "new mexico", "new york", "north carolina", "north dakota", "ohio",
  "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina",
  "south dakota", "tennessee", "texas", "utah", "vermont", "virginia",
  "washington", "west virginia", "wisconsin", "wyoming",
  "district of columbia", "washington dc", "puerto rico", "virgin islands",
  "guam", "american samoa", "northern mariana islands",
]);

export const US_STATE_CODES = new Set(CODES.split(" "));

// UNKNOWN IS NOT FOREIGN. 30,702 of 145,849 live listings carry no state at
// all (21%), overwhelmingly US rooftops whose pages simply omit addressRegion,
// and dropping them would cost a fifth of the feed to catch 82 cars. So this
// answers false — "not established to be outside the US" — whenever there is
// nothing to judge. The hole is real and named: a foreign rooftop that also
// omits its region still gets through, and only a zip/phone/currency signal
// would catch it. Coverage is the job; the guard stays narrow on purpose.
export function isOutsideUs(state) {
  const s = String(state ?? "").trim();
  if (!s) return false;
  if (s.length <= 3) return !US_STATE_CODES.has(s.toUpperCase());
  return !US_STATE_NAMES.has(s.toLowerCase());
}
