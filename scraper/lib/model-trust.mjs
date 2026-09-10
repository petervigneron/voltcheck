// A model string the feed cannot fold on.
//
// Three shapes, all live on 2026-09-09 and all from AutoManager rooftops
// (lib/platforms/automanager.mjs has the platform's side of it):
//
//   ""       — no model read at all.
//   "Other"  — the platform's model dropdown had no entry for the car
//              (Lyriq, Vistiq, Optiq, Equinox EV, EX90, Ariya, every EQE and
//              EQS on one Houston lot), so the dealer picked the placeholder
//              and typed the real name into the headline. Five rooftops had
//              it live as a model; it is a nameplate nobody makes.
//   "VISTIQ 2026 Luxury AWD NAV PANO SUPERCRUISE 6PASS 1K Mi"
//            — the listing headline in the model column. The car's own model
//              year is the tell: no nameplate contains its own year, and a
//              headline nearly always does. 48 rows on ultimatems.com.
//
// Untrusted is not dropped. vpic-enrich.mjs puts these VINs to vPIC and takes
// its Model (lib/vpic-model.mjs spells it the feed's way), and ingest.mjs
// holds only what vPIC could not name — the same abstain-not-guess shape as
// the fuel-text-only hold beside it.
export function isHeadlineModel(model, year) {
  const y = Number(year);
  if (!model || !Number.isFinite(y)) return false;
  return new RegExp(`(^|[^0-9])${y}([^0-9]|$)`).test(String(model));
}

export function untrustedModel(l) {
  const m = String(l?.model ?? "").trim();
  if (!m) return true;
  if (/^other$/i.test(m)) return true;
  return isHeadlineModel(m, l.year);
}
