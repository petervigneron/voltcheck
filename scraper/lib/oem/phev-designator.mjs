// Is this model/trim text carrying a manufacturer's own PLUG-IN designation?
//
// Some multi-make used feeds (Enterprise, Audi's trade-in network, CarBravo)
// have no facet that separates plug-in hybrids from conventional/mild ones —
// their "Hybrid"/"H" buckets lump a Wrangler 4xe with a Prius and an A3 40
// TFSI mild hybrid. For those lanes the only per-record signal is the name
// the MAKER stamped on the car, and every US-market plug-in wears one:
//
//   4xe            Jeep (Wrangler/Grand Cherokee)
//   Plug-In        Chrysler Pacifica Plug-In Hybrid, Mitsubishi Outlander
//                  Plug-in Hybrid, Hyundai/Kia "... Plug-In Hybrid",
//                  Subaru Crosstrek Plug-in Hybrid, MB S 550 Plug-In Hybrid
//   PHEV           Mazda CX-70/CX-90 PHEV and dealer shorthand generally
//   Energi         Ford Fusion/C-MAX Energi
//   Prius Prime / RAV4 Prime   Toyota's plug-ins (bare "Prime" is NOT enough)
//   E-Hybrid       every Porsche Cayenne/Panamera E-Hybrid is a plug-in
//   E PERFORMANCE  the AMG plug-in line (S 63 E, C 63 S E, GLC 63 S E …)
//   T8             Volvo's plug-in powertrain code (T5/T6/B5/B6 are not)
//   TFSI e         Audi's plug-in badge — the petrol "45/55 TFSI" lacks the e
//   xxxe           BMW 330e/530e/550e/745e/750e; Mercedes 350e/450e/580e/250e;
//                  BMW's 45e/50e xDrive suffixes ("xDrive45e")
//
// The regex is deliberately allowlist-tight: it must NEVER match a
// conventional hybrid's naming ("Hybrid", "HEV", "e:HEV", "Prime" alone,
// "e-POWER"), because rows passing it ship as PHEV at high confidence.
// Downstream, every such VIN still goes through vpic-enrich's fuelTextOnly
// hold (none of these names are in EV_MODEL_RE), where a mislabeled mild or
// strong hybrid is refuted before it can publish — this gate exists so that
// the vPIC pass is a second check, not the only one.
export const PHEV_DESIGNATOR = new RegExp(
  [
    "\\b4xe\\b",
    "plug-?in",
    "\\bPHEV\\b",
    "\\bEnergi\\b",
    "\\b(?:prius|rav4)\\s+prime\\b",
    "\\bE-Hybrid\\b",
    "\\bE PERFORMANCE\\b",
    "\\bT8\\b",
    // \W{0,2}: Audi's own strings often carry the ® between TFSI and the e
    // ("55 TFSI® e quattro"), which \s alone misses.
    "\\bTFSI\\W{0,2}e\\b",
    // (?!500e): the Fiat 500e is a BEV wearing exactly this shape of name.
    "\\b(?:xDrive)?(?!500e)\\d{2,3}e\\b",
  ].join("|"),
  "i"
);

export const isPhevDesignated = (text) => PHEV_DESIGNATOR.test(String(text ?? ""));
