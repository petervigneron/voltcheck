// A syntactically plausible VIN: 17 characters from the VIN alphabet (no I, O or
// Q) that is not a placeholder. Dealer SRPs sometimes render an "inbound" or
// "coming soon" car with a filler VIN of one repeated character
// (11111111111111111, 00000000000000000); a real VIN's 17 positions — WMI, VDS,
// the check digit, the VIS — always carry many distinct characters, so requiring
// a handful of them rejects the fillers without touching any genuine VIN.
//
// This is deliberately a syntactic gate, not a check-digit validator: the check
// digit is a real filter but it also rejects the small number of correctly
// transcribed VINs whose issuer got the digit wrong, and this project would
// rather admit those (vPIC settles them downstream) than silently drop a real
// car. What it must never admit is a fabricated VIN that becomes a listing key.
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

export function isPlausibleVin(vin) {
  const v = String(vin ?? "").toUpperCase();
  return VIN_RE.test(v) && new Set(v).size >= 5;
}
