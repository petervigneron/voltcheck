// The model hubs: one crawlable page per nameplate, at /ev/<make>/<model>.
//
// Why this file exists. Measured 2026-09-02: the homepage is a static shell
// that fetches inventory in the browser, so its HTML carries eight links and
// none of them points at a car. Every one of ~149,000 listing URLs was
// therefore an orphan — reachable only through a sitemap whose 12 shards
// Google had registered ZERO of. 18 of 18 sampled listing pages came back
// "URL is unknown to Google, crawled never". A hub is the missing middle:
// homepage to hub to car, in HTML a crawler can follow without running React.
//
// Generated from the live feed, not guessed — every make+model spelling with
// at least 20 live cars on 2026-09-02, which is 246 hubs over 147,594 of
// 149,070 cars (99.0%). The threshold exists so a hub is a real page about a
// real choice rather than a shell around two cars; below it the sitemap is
// the right instrument, not a page.
//
// Committed rather than derived at request time so a URL cannot appear and
// vanish with the week's inventory. Regenerating is a deliberate act: add
// rows for nameplates that have grown past the threshold, and leave rows
// whose inventory has thinned, because an indexed URL that starts 404ing is
// worse than a quiet page.
//
// MATCHING. Exact on modelKey (lib/listings/modelName.ts), the same contract
// as lib/facts/links.ts and lib/listings/facetSpec.ts: no prefix rule, so
// "BMW X5" and "BMW X5 PHEV" are two hubs rather than one guess about
// whether they are the same car. That is deliberate — see the nameplate-fold
// work, where folding on our own enrichment was refuted for the Cayenne and
// the X3. A hub carries MORE than one key only when two feed spellings
// produce the same URL because they are the same words ("NX 450h+" and
// "NX 450h Plus"), which is the normalisation modelKey already does for
// Plug-In and Plugin.
//
// The slug keeps "+" as "-plus" on purpose: modelKey preserves the plus, so
// dropping it would collide EQS 450 with EQS 450+ into one URL covering two
// different cars.

import { modelKey } from "./modelName";

export type ModelHub = {
  /** URL segment for the make. */
  makeSlug: string;
  /** How the make is written. */
  make: string;
  /** URL segment for the model. */
  modelSlug: string;
  /** How the model is written — the feed's own commonest spelling. */
  model: string;
  /** modelKey() spellings that are this hub. */
  keys: string[];
};

export const MODEL_HUBS: ModelHub[] = [
  { makeSlug: "ford", make: "Ford", modelSlug: "mustang-mach-e", model: "Mustang Mach-E", keys: ["mustangmache"] },
  { makeSlug: "cadillac", make: "Cadillac", modelSlug: "lyriq", model: "Lyriq", keys: ["lyriq"] },
  { makeSlug: "hyundai", make: "Hyundai", modelSlug: "ioniq-5", model: "Ioniq 5", keys: ["ioniq5"] },
  { makeSlug: "chevrolet", make: "Chevrolet", modelSlug: "equinox-ev", model: "Equinox EV", keys: ["equinoxev"] },
  { makeSlug: "cadillac", make: "Cadillac", modelSlug: "optiq", model: "Optiq", keys: ["optiq"] },
  { makeSlug: "chevrolet", make: "Chevrolet", modelSlug: "bolt-ev", model: "Bolt EV", keys: ["boltev"] },
  { makeSlug: "kia", make: "Kia", modelSlug: "ev9", model: "EV9", keys: ["ev9"] },
  { makeSlug: "kia", make: "Kia", modelSlug: "ev6", model: "EV6", keys: ["ev6"] },
  { makeSlug: "honda", make: "Honda", modelSlug: "prologue", model: "Prologue", keys: ["prologue"] },
  { makeSlug: "chevrolet", make: "Chevrolet", modelSlug: "blazer-ev", model: "Blazer EV", keys: ["blazerev"] },
  { makeSlug: "jeep", make: "Jeep", modelSlug: "wrangler-4xe", model: "Wrangler 4xe", keys: ["wrangler4xe"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "x5", model: "X5", keys: ["x5"] },
  { makeSlug: "volvo", make: "Volvo", modelSlug: "xc90-plug-in-hybrid", model: "XC90 plug-in hybrid", keys: ["xc90pluginhybrid"] },
  { makeSlug: "toyota", make: "Toyota", modelSlug: "rav4-plug-in-hybrid", model: "RAV4 Plug-in Hybrid", keys: ["rav4pluginhybrid"] },
  { makeSlug: "tesla", make: "Tesla", modelSlug: "model-y", model: "Model Y", keys: ["modely"] },
  { makeSlug: "tesla", make: "Tesla", modelSlug: "model-3", model: "Model 3", keys: ["model3"] },
  { makeSlug: "toyota", make: "Toyota", modelSlug: "bz", model: "bZ", keys: ["bz"] },
  { makeSlug: "cadillac", make: "Cadillac", modelSlug: "vistiq", model: "Vistiq", keys: ["vistiq"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "i4", model: "i4", keys: ["i4"] },
  { makeSlug: "jeep", make: "Jeep", modelSlug: "grand-cherokee-4xe", model: "Grand Cherokee 4xe", keys: ["grandcherokee4xe"] },
  { makeSlug: "volkswagen", make: "Volkswagen", modelSlug: "id-4", model: "ID.4", keys: ["id4"] },
  { makeSlug: "nissan", make: "Nissan", modelSlug: "rogue-plug-in-hybrid", model: "Rogue Plug-In Hybrid", keys: ["roguepluginhybrid"] },
  { makeSlug: "nissan", make: "Nissan", modelSlug: "leaf", model: "Leaf", keys: ["leaf"] },
  { makeSlug: "volvo", make: "Volvo", modelSlug: "xc60-plug-in-hybrid", model: "XC60 plug-in hybrid", keys: ["xc60pluginhybrid"] },
  { makeSlug: "lucid", make: "Lucid", modelSlug: "gravity", model: "Gravity", keys: ["gravity"] },
  { makeSlug: "kia", make: "Kia", modelSlug: "niro-ev", model: "Niro EV", keys: ["niroev"] },
  { makeSlug: "jeep", make: "Jeep", modelSlug: "wrangler", model: "Wrangler", keys: ["wrangler"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "x5-phev", model: "X5 PHEV", keys: ["x5phev"] },
  { makeSlug: "toyota", make: "Toyota", modelSlug: "bz-woodland", model: "bZ Woodland", keys: ["bzwoodland"] },
  { makeSlug: "mazda", make: "Mazda", modelSlug: "cx-90-phev", model: "CX-90 PHEV", keys: ["cx90phev"] },
  { makeSlug: "toyota", make: "Toyota", modelSlug: "c-hr", model: "C-HR", keys: ["chr"] },
  { makeSlug: "hyundai", make: "Hyundai", modelSlug: "tucson-plug-in-hybrid", model: "Tucson Plug-In Hybrid", keys: ["tucsonpluginhybrid"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "ix", model: "iX", keys: ["ix"] },
  { makeSlug: "toyota", make: "Toyota", modelSlug: "prius-plug-in-hybrid", model: "Prius Plug-in Hybrid", keys: ["priuspluginhybrid"] },
  { makeSlug: "nissan", make: "Nissan", modelSlug: "ariya", model: "Ariya", keys: ["ariya"] },
  { makeSlug: "kia", make: "Kia", modelSlug: "sportage-plug-in-hybrid", model: "Sportage Plug-In Hybrid", keys: ["sportagepluginhybrid"] },
  { makeSlug: "cadillac", make: "Cadillac", modelSlug: "escalade-iq", model: "Escalade IQ", keys: ["escaladeiq"] },
  { makeSlug: "volvo", make: "Volvo", modelSlug: "ex30", model: "EX30", keys: ["ex30"] },
  { makeSlug: "gmc", make: "GMC", modelSlug: "hummer-ev-suv", model: "Hummer EV SUV", keys: ["hummerevsuv"] },
  { makeSlug: "gmc", make: "GMC", modelSlug: "sierra-ev", model: "Sierra EV", keys: ["sierraev"] },
  { makeSlug: "hyundai", make: "Hyundai", modelSlug: "ioniq-9", model: "Ioniq 9", keys: ["ioniq9"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "i5", model: "i5", keys: ["i5"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "q6-e-tron", model: "Q6 e-tron", keys: ["q6etron"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "eqs", model: "EQS", keys: ["eqs"] },
  { makeSlug: "porsche", make: "Porsche", modelSlug: "taycan", model: "Taycan", keys: ["taycan"] },
  { makeSlug: "tesla", make: "Tesla", modelSlug: "model-x", model: "Model X", keys: ["modelx"] },
  { makeSlug: "mazda", make: "Mazda", modelSlug: "cx-90-plug-in-hybrid", model: "CX-90 Plug-In Hybrid", keys: ["cx90pluginhybrid"] },
  { makeSlug: "subaru", make: "Subaru", modelSlug: "trailseeker", model: "Trailseeker", keys: ["trailseeker"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "eqe", model: "EQE", keys: ["eqe"] },
  { makeSlug: "mitsubishi", make: "Mitsubishi", modelSlug: "outlander-phev", model: "Outlander PHEV", keys: ["outlanderphev"] },
  { makeSlug: "gmc", make: "GMC", modelSlug: "hummer-ev", model: "Hummer EV", keys: ["hummerev"] },
  { makeSlug: "jeep", make: "Jeep", modelSlug: "grand-cherokee", model: "Grand Cherokee", keys: ["grandcherokee"] },
  { makeSlug: "tesla", make: "Tesla", modelSlug: "model-s", model: "Model S", keys: ["models"] },
  { makeSlug: "chevrolet", make: "Chevrolet", modelSlug: "silverado-ev", model: "Silverado EV", keys: ["silveradoev"] },
  { makeSlug: "volvo", make: "Volvo", modelSlug: "ex90", model: "EX90", keys: ["ex90"] },
  { makeSlug: "cadillac", make: "Cadillac", modelSlug: "escalade-iql", model: "Escalade IQL", keys: ["escaladeiql"] },
  { makeSlug: "ford", make: "Ford", modelSlug: "f-150-lightning", model: "F-150 Lightning", keys: ["f150lightning"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "m5", model: "M5", keys: ["m5"] },
  { makeSlug: "lucid", make: "Lucid", modelSlug: "air", model: "Air", keys: ["air"] },
  { makeSlug: "polestar", make: "Polestar", modelSlug: "2", model: "2", keys: ["2"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "i7", model: "i7", keys: ["i7"] },
  { makeSlug: "chrysler", make: "Chrysler", modelSlug: "pacifica-hybrid", model: "Pacifica Hybrid", keys: ["pacificahybrid"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "e-class", model: "E-CLASS", keys: ["eclass"] },
  { makeSlug: "subaru", make: "Subaru", modelSlug: "solterra", model: "Solterra", keys: ["solterra"] },
  { makeSlug: "mazda", make: "Mazda", modelSlug: "cx-70-phev", model: "CX-70 PHEV", keys: ["cx70phev"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "550e", model: "550e", keys: ["550e"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "glc", model: "GLC", keys: ["glc"] },
  { makeSlug: "hyundai", make: "Hyundai", modelSlug: "ioniq-6", model: "Ioniq 6", keys: ["ioniq6"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "q4-e-tron", model: "Q4 e-tron", keys: ["q4etron"] },
  { makeSlug: "toyota", make: "Toyota", modelSlug: "rav4-prime", model: "RAV4 Prime", keys: ["rav4prime"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "cla", model: "CLA", keys: ["cla"] },
  { makeSlug: "kia", make: "Kia", modelSlug: "ev3", model: "EV3", keys: ["ev3"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "xm", model: "XM", keys: ["xm"] },
  { makeSlug: "kia", make: "Kia", modelSlug: "sorento-plug-in-hybrid", model: "Sorento Plug-In Hybrid", keys: ["sorentopluginhybrid"] },
  { makeSlug: "volvo", make: "Volvo", modelSlug: "xc90-recharge-plug-in-hybrid", model: "XC90 Recharge Plug-In Hybrid", keys: ["xc90rechargepluginhybrid"] },
  { makeSlug: "chrysler", make: "Chrysler", modelSlug: "pacifica", model: "Pacifica", keys: ["pacifica"] },
  { makeSlug: "dodge", make: "Dodge", modelSlug: "hornet", model: "Hornet", keys: ["hornet"] },
  { makeSlug: "toyota", make: "Toyota", modelSlug: "prius-prime", model: "Prius Prime", keys: ["priusprime"] },
  { makeSlug: "lexus", make: "Lexus", modelSlug: "ese", model: "ESe", keys: ["ese"] },
  { makeSlug: "toyota", make: "Toyota", modelSlug: "bz4x", model: "bZ4X", keys: ["bz4x"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "750e", model: "750e", keys: ["750e"] },
  { makeSlug: "porsche", make: "Porsche", modelSlug: "cayenne", model: "Cayenne", keys: ["cayenne"] },
  { makeSlug: "dodge", make: "Dodge", modelSlug: "charger-daytona", model: "Charger Daytona", keys: ["chargerdaytona"] },
  { makeSlug: "volvo", make: "Volvo", modelSlug: "c40-recharge-pure-electric", model: "C40 Recharge Pure Electric", keys: ["c40rechargepureelectric"] },
  { makeSlug: "jeep", make: "Jeep", modelSlug: "recon", model: "Recon", keys: ["recon"] },
  { makeSlug: "jeep", make: "Jeep", modelSlug: "wagoneer-s", model: "Wagoneer S", keys: ["wagoneers"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "s-class", model: "S-Class", keys: ["sclass"] },
  { makeSlug: "rivian", make: "Rivian", modelSlug: "r1s", model: "R1S", keys: ["r1s"] },
  { makeSlug: "porsche", make: "Porsche", modelSlug: "macan-electric", model: "Macan Electric", keys: ["macanelectric"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "q8-e-tron", model: "Q8 e-tron", keys: ["q8etron"] },
  { makeSlug: "ford", make: "Ford", modelSlug: "escape", model: "Escape", keys: ["escape"] },
  { makeSlug: "lexus", make: "Lexus", modelSlug: "rz", model: "RZ", keys: ["rz"] },
  { makeSlug: "volvo", make: "Volvo", modelSlug: "xc60-recharge-plug-in-hybrid", model: "XC60 Recharge Plug-In Hybrid", keys: ["xc60rechargepluginhybrid"] },
  { makeSlug: "mazda", make: "Mazda", modelSlug: "cx-70-plug-in-hybrid", model: "CX-70 Plug-In Hybrid", keys: ["cx70pluginhybrid"] },
  { makeSlug: "ford", make: "Ford", modelSlug: "escape-plug-in-hybrid", model: "Escape Plug-In Hybrid", keys: ["escapepluginhybrid"] },
  { makeSlug: "volvo", make: "Volvo", modelSlug: "xc40-recharge-pure-electric", model: "XC40 Recharge Pure Electric", keys: ["xc40rechargepureelectric"] },
  { makeSlug: "hyundai", make: "Hyundai", modelSlug: "kona-electric", model: "Kona Electric", keys: ["konaelectric"] },
  { makeSlug: "genesis", make: "Genesis", modelSlug: "gv60", model: "GV60", keys: ["gv60"] },
  { makeSlug: "volvo", make: "Volvo", modelSlug: "ex30-cross-country", model: "EX30 Cross Country", keys: ["ex30crosscountry"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "gle", model: "GLE", keys: ["gle"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "amg-e-53-e", model: "AMG E 53 E", keys: ["amge53e"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "sq6-e-tron", model: "SQ6 e-tron", keys: ["sq6etron"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "5-series", model: "5 Series", keys: ["5series"] },
  { makeSlug: "mitsubishi", make: "Mitsubishi", modelSlug: "outlander-plug-in-hybrid", model: "Outlander Plug-In Hybrid", keys: ["outlanderpluginhybrid"] },
  { makeSlug: "genesis", make: "Genesis", modelSlug: "electrified-gv70", model: "Electrified GV70", keys: ["electrifiedgv70"] },
  { makeSlug: "chevrolet", make: "Chevrolet", modelSlug: "bolt-euv", model: "Bolt EUV", keys: ["bolteuv"] },
  { makeSlug: "lexus", make: "Lexus", modelSlug: "nx-plug-in-hybrid-electric-vehicle", model: "NX PLUG-IN HYBRID ELECTRIC VEHICLE", keys: ["nxpluginhybridelectricvehicle"] },
  { makeSlug: "bentley", make: "Bentley", modelSlug: "continental-gt", model: "Continental GT", keys: ["continentalgt"] },
  { makeSlug: "porsche", make: "Porsche", modelSlug: "macan", model: "Macan", keys: ["macan"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "cla-250-plus", model: "CLA 250+", keys: ["cla250+"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "glc-350e", model: "GLC 350e", keys: ["glc350e"] },
  { makeSlug: "land-rover", make: "Land rover", modelSlug: "range-rover-sport", model: "Range Rover Sport", keys: ["rangeroversport"] },
  { makeSlug: "lexus", make: "Lexus", modelSlug: "nx-450h-plus", model: "NX 450h+", keys: ["nx450h+", "nx450hplus"] },
  { makeSlug: "lincoln", make: "Lincoln", modelSlug: "corsair-plug-in-hybrid", model: "Corsair Plug-In Hybrid", keys: ["corsairpluginhybrid"] },
  { makeSlug: "land-rover", make: "Land rover", modelSlug: "range-rover", model: "Range Rover", keys: ["rangerover"] },
  { makeSlug: "rivian", make: "Rivian", modelSlug: "r1t", model: "R1T", keys: ["r1t"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "q5-tfsi-e", model: "Q5 TFSI e", keys: ["q5tfsie"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "a6-sportback-e-tron", model: "A6 Sportback e-tron", keys: ["a6sportbacketron"] },
  { makeSlug: "lexus", make: "Lexus", modelSlug: "es-350e", model: "ES 350e", keys: ["es350e"] },
  { makeSlug: "lincoln", make: "Lincoln", modelSlug: "corsair", model: "Corsair", keys: ["corsair"] },
  { makeSlug: "lexus", make: "Lexus", modelSlug: "rz-450e", model: "RZ 450e", keys: ["rz450e"] },
  { makeSlug: "chrysler", make: "Chrysler", modelSlug: "pacifica-plug-in-hybrid", model: "Pacifica Plug-In Hybrid", keys: ["pacificapluginhybrid"] },
  { makeSlug: "porsche", make: "Porsche", modelSlug: "cayenne-e-hybrid", model: "Cayenne E-Hybrid", keys: ["cayenneehybrid"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "g-class", model: "G-Class", keys: ["gclass"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "cla-350", model: "CLA 350", keys: ["cla350"] },
  { makeSlug: "dodge", make: "Dodge", modelSlug: "charger", model: "Charger", keys: ["charger"] },
  { makeSlug: "volvo", make: "Volvo", modelSlug: "xc90", model: "XC90", keys: ["xc90"] },
  { makeSlug: "brightdrop", make: "Brightdrop", modelSlug: "zevo-600", model: "Zevo 600", keys: ["zevo600"] },
  { makeSlug: "subaru", make: "Subaru", modelSlug: "uncharted", model: "Uncharted", keys: ["uncharted"] },
  { makeSlug: "tesla", make: "Tesla", modelSlug: "cybertruck", model: "Cybertruck", keys: ["cybertruck"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "q6-sportback-e-tron", model: "Q6 Sportback e-tron", keys: ["q6sportbacketron"] },
  { makeSlug: "jeep", make: "Jeep", modelSlug: "wrangler-unlimited-4xe", model: "Wrangler Unlimited 4xe", keys: ["wranglerunlimited4xe"] },
  { makeSlug: "polestar", make: "Polestar", modelSlug: "3", model: "3", keys: ["3"] },
  { makeSlug: "lexus", make: "Lexus", modelSlug: "rx-plug-in-hybrid-electric-vehicle", model: "RX PLUG-IN HYBRID ELECTRIC VEHICLE", keys: ["rxpluginhybridelectricvehicle"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "eqb", model: "EQB", keys: ["eqb"] },
  { makeSlug: "volkswagen", make: "Volkswagen", modelSlug: "id-buzz", model: "ID. Buzz", keys: ["idbuzz"] },
  { makeSlug: "acura", make: "Acura", modelSlug: "zdx", model: "ZDX", keys: ["zdx"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "e-tron", model: "e-tron", keys: ["etron"] },
  { makeSlug: "bentley", make: "Bentley", modelSlug: "flying-spur", model: "Flying Spur", keys: ["flyingspur"] },
  { makeSlug: "alfa-romeo", make: "Alfa romeo", modelSlug: "tonale", model: "Tonale", keys: ["tonale"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "q4-sportback-e-tron", model: "Q4 Sportback e-tron", keys: ["q4sportbacketron"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "gle-450e", model: "GLE 450e", keys: ["gle450e"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "e-tron-gt", model: "e-tron GT", keys: ["etrongt"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "eqs-450-sedan", model: "EQS 450 Sedan", keys: ["eqs450sedan"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "ix3", model: "iX3", keys: ["ix3"] },
  { makeSlug: "chevrolet", make: "Chevrolet", modelSlug: "volt", model: "Volt", keys: ["volt"] },
  { makeSlug: "hyundai", make: "Hyundai", modelSlug: "santa-fe-plug-in-hybrid", model: "Santa Fe Plug-In Hybrid", keys: ["santafepluginhybrid"] },
  { makeSlug: "honda", make: "Honda", modelSlug: "clarity-plug-in-hybrid", model: "Clarity Plug-In Hybrid", keys: ["claritypluginhybrid"] },
  { makeSlug: "polestar", make: "Polestar", modelSlug: "4", model: "4", keys: ["4"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "3-series", model: "3 Series", keys: ["3series"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "eqe-350", model: "EQE 350", keys: ["eqe350"] },
  { makeSlug: "lexus", make: "Lexus", modelSlug: "rx-450h-plus", model: "RX 450h+", keys: ["rx450h+", "rx450hplus"] },
  { makeSlug: "kia", make: "Kia", modelSlug: "niro-plug-in-hybrid", model: "Niro Plug-In Hybrid", keys: ["niropluginhybrid"] },
  { makeSlug: "bentley", make: "Bentley", modelSlug: "continental-gtc", model: "Continental GTC", keys: ["continentalgtc"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "7-series", model: "7 Series", keys: ["7series"] },
  { makeSlug: "volvo", make: "Volvo", modelSlug: "xc60", model: "XC60", keys: ["xc60"] },
  { makeSlug: "porsche", make: "Porsche", modelSlug: "cayenne-e-hybrid-coupe", model: "Cayenne E-Hybrid Coupe", keys: ["cayenneehybridcoupe"] },
  { makeSlug: "ford", make: "Ford", modelSlug: "fusion-energi", model: "Fusion Energi", keys: ["fusionenergi"] },
  { makeSlug: "lexus", make: "Lexus", modelSlug: "nx", model: "NX", keys: ["nx"] },
  { makeSlug: "mclaren", make: "Mclaren", modelSlug: "artura", model: "Artura", keys: ["artura"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "q8-sportback-e-tron", model: "Q8 Sportback e-tron", keys: ["q8sportbacketron"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "330e", model: "330e", keys: ["330e"] },
  { makeSlug: "hyundai", make: "Hyundai", modelSlug: "ioniq-5-n", model: "Ioniq 5 N", keys: ["ioniq5n"] },
  { makeSlug: "fiat", make: "Fiat", modelSlug: "500e", model: "500e", keys: ["500e"] },
  { makeSlug: "lincoln", make: "Lincoln", modelSlug: "aviator", model: "Aviator", keys: ["aviator"] },
  { makeSlug: "volvo", make: "Volvo", modelSlug: "s60-recharge-plug-in-hybrid", model: "S60 Recharge Plug-In Hybrid", keys: ["s60rechargepluginhybrid"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "eqs-400-suv", model: "EQS 400 SUV", keys: ["eqs400suv"] },
  { makeSlug: "lexus", make: "Lexus", modelSlug: "rz-350e", model: "RZ 350e", keys: ["rz350e"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "530e", model: "530e", keys: ["530e"] },
  { makeSlug: "bentley", make: "Bentley", modelSlug: "continental", model: "Continental", keys: ["continental"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "s-e-tron-gt", model: "S e-tron GT", keys: ["setrongt"] },
  { makeSlug: "lexus", make: "Lexus", modelSlug: "es-500e", model: "ES 500e", keys: ["es500e"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "eqs-450", model: "EQS 450", keys: ["eqs450"] },
  { makeSlug: "ford", make: "Ford", modelSlug: "e-transit", model: "E-Transit", keys: ["etransit"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "rs-e-tron-gt", model: "RS e-tron GT", keys: ["rsetrongt"] },
  { makeSlug: "lamborghini", make: "Lamborghini", modelSlug: "urus", model: "Urus", keys: ["urus"] },
  { makeSlug: "chevrolet", make: "Chevrolet", modelSlug: "brightdrop-400", model: "BrightDrop 400", keys: ["brightdrop400"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "eqs-450-plus", model: "EQS 450+", keys: ["eqs450+"] },
  { makeSlug: "porsche", make: "Porsche", modelSlug: "panamera-e-hybrid", model: "Panamera E-Hybrid", keys: ["panameraehybrid"] },
  { makeSlug: "chevrolet", make: "Chevrolet", modelSlug: "blazer-ev-police-package", model: "Blazer EV Police Package", keys: ["blazerevpolicepackage"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "rs-e-tron-gt-performance", model: "RS e-tron GT performance", keys: ["rsetrongtperformance"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "eqe-suv", model: "EQE SUV", keys: ["eqesuv"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "eqe-350-plus", model: "EQE 350+", keys: ["eqe350+"] },
  { makeSlug: "brightdrop", make: "Brightdrop", modelSlug: "zevo-400", model: "Zevo 400", keys: ["zevo400"] },
  { makeSlug: "volvo", make: "Volvo", modelSlug: "c40-recharge", model: "C40 Recharge", keys: ["c40recharge"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "eqs-580", model: "EQS 580", keys: ["eqs580"] },
  { makeSlug: "lexus", make: "Lexus", modelSlug: "nxphev", model: "NXphev", keys: ["nxphev"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "sq6-sportback-e-tron", model: "SQ6 Sportback e-tron", keys: ["sq6sportbacketron"] },
  { makeSlug: "land-rover", make: "Land rover", modelSlug: "range-rover-sport-plug-in-hybrid", model: "Range Rover Sport Plug-in Hybrid", keys: ["rangeroversportpluginhybrid"] },
  { makeSlug: "porsche", make: "Porsche", modelSlug: "cayenne-electric", model: "Cayenne Electric", keys: ["cayenneelectric"] },
  { makeSlug: "lexus", make: "Lexus", modelSlug: "es", model: "ES", keys: ["es"] },
  { makeSlug: "lexus", make: "Lexus", modelSlug: "rx", model: "RX", keys: ["rx"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "s6-sportback-e-tron", model: "S6 Sportback e-tron", keys: ["s6sportbacketron"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "esprinter-2500", model: "eSprinter 2500", keys: ["esprinter2500"] },
  { makeSlug: "mini", make: "MINI", modelSlug: "hardtop-2-door", model: "Hardtop 2 Door", keys: ["hardtop2door"] },
  { makeSlug: "land-rover", make: "Land rover", modelSlug: "range-rover-plug-in-hybrid", model: "Range Rover Plug-In Hybrid", keys: ["rangeroverpluginhybrid"] },
  { makeSlug: "ford", make: "Ford", modelSlug: "e-transit-350", model: "E-Transit-350", keys: ["etransit350"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "x5-xdrive50e", model: "X5 xDrive50e", keys: ["x5xdrive50e"] },
  { makeSlug: "lexus", make: "Lexus", modelSlug: "rxphev", model: "RXphev", keys: ["rxphev"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "i3", model: "i3", keys: ["i3"] },
  { makeSlug: "porsche", make: "Porsche", modelSlug: "panamera", model: "Panamera", keys: ["panamera"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "e-tron-sportback", model: "e-tron Sportback", keys: ["etronsportback"] },
  { makeSlug: "volvo", make: "Volvo", modelSlug: "xc40", model: "XC40", keys: ["xc40"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "q5-e", model: "Q5 e", keys: ["q5e"] },
  { makeSlug: "ford", make: "Ford", modelSlug: "c-max-energi", model: "C-Max Energi", keys: ["cmaxenergi"] },
  { makeSlug: "lincoln", make: "Lincoln", modelSlug: "aviator-plug-in-hybrid", model: "Aviator Plug-In Hybrid", keys: ["aviatorpluginhybrid"] },
  { makeSlug: "fisker", make: "Fisker", modelSlug: "ocean", model: "Ocean", keys: ["ocean"] },
  { makeSlug: "lexus", make: "Lexus", modelSlug: "nx-450h", model: "NX 450h", keys: ["nx450h"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "q4-e-tron-sportback", model: "Q4 e-tron Sportback", keys: ["q4etronsportback"] },
  { makeSlug: "audi", make: "Audi", modelSlug: "q5", model: "Q5", keys: ["q5"] },
  { makeSlug: "volkswagen", make: "Volkswagen", modelSlug: "e-golf", model: "e-Golf", keys: ["egolf"] },
  { makeSlug: "ram", make: "Ram", modelSlug: "promaster-3500-ev", model: "Promaster 3500 EV", keys: ["promaster3500ev"] },
  { makeSlug: "jeep", make: "Jeep", modelSlug: "wrangler-unlimited", model: "Wrangler Unlimited", keys: ["wranglerunlimited"] },
  { makeSlug: "volvo", make: "Volvo", modelSlug: "ex40", model: "EX40", keys: ["ex40"] },
  { makeSlug: "mini", make: "MINI", modelSlug: "electric-hardtop-2-door", model: "Electric Hardtop 2 Door", keys: ["electrichardtop2door"] },
  { makeSlug: "porsche", make: "Porsche", modelSlug: "taycan-cross-turismo", model: "Taycan Cross Turismo", keys: ["taycancrossturismo"] },
  { makeSlug: "lexus", make: "Lexus", modelSlug: "rz-300e", model: "RZ 300e", keys: ["rz300e"] },
  { makeSlug: "vinfast", make: "Vinfast", modelSlug: "vf-8", model: "VF 8", keys: ["vf8"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "ix-xdrive50", model: "iX xDrive50", keys: ["ixxdrive50"] },
  { makeSlug: "subaru", make: "Subaru", modelSlug: "crosstrek", model: "Crosstrek", keys: ["crosstrek"] },
  { makeSlug: "rolls-royce", make: "Rolls-royce", modelSlug: "spectre", model: "Spectre", keys: ["spectre"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "i4-edrive40", model: "i4 eDrive40", keys: ["i4edrive40"] },
  { makeSlug: "lamborghini", make: "Lamborghini", modelSlug: "revuelto", model: "Revuelto", keys: ["revuelto"] },
  { makeSlug: "chevrolet", make: "Chevrolet", modelSlug: "brightdrop-600", model: "BrightDrop 600", keys: ["brightdrop600"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "i4-edrive35", model: "i4 eDrive35", keys: ["i4edrive35"] },
  { makeSlug: "mini", make: "MINI", modelSlug: "countryman", model: "Countryman", keys: ["countryman"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "x3", model: "X3", keys: ["x3"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "eqb-300", model: "EQB 300", keys: ["eqb300"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "eqs-550", model: "EQS 550", keys: ["eqs550"] },
  { makeSlug: "volvo", make: "Volvo", modelSlug: "s60-plug-in-hybrid", model: "S60 plug-in hybrid", keys: ["s60pluginhybrid"] },
  { makeSlug: "toyota", make: "Toyota", modelSlug: "mirai", model: "Mirai", keys: ["mirai"] },
  { makeSlug: "jaguar", make: "Jaguar", modelSlug: "i-pace", model: "I-PACE", keys: ["ipace"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "eqe-320-plus-suv", model: "EQE 320+ SUV", keys: ["eqe320+suv"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "eqs-450-plus-sedan", model: "EQS 450+ Sedan", keys: ["eqs450+sedan"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "mercedes-amg-gt", model: "Mercedes-AMG GT", keys: ["mercedesamggt"] },
  { makeSlug: "bmw", make: "BMW", modelSlug: "i8", model: "i8", keys: ["i8"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "c-class", model: "C-Class", keys: ["cclass"] },
  { makeSlug: "ram", make: "Ram", modelSlug: "promaster", model: "ProMaster", keys: ["promaster"] },
  { makeSlug: "ferrari", make: "Ferrari", modelSlug: "296-gtb", model: "296 GTB", keys: ["296gtb"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "sl", model: "SL", keys: ["sl"] },
  { makeSlug: "mini", make: "MINI", modelSlug: "cooper-se-electric", model: "Cooper SE Electric", keys: ["cooperseelectric"] },
  { makeSlug: "toyota", make: "Toyota", modelSlug: "prius-plug-in", model: "Prius Plug-In", keys: ["priusplugin"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "eqe-320", model: "EQE 320", keys: ["eqe320"] },
  { makeSlug: "ferrari", make: "Ferrari", modelSlug: "sf90-spider", model: "SF90 Spider", keys: ["sf90spider"] },
  { makeSlug: "volvo", make: "Volvo", modelSlug: "xc60-hybrid", model: "XC60 Hybrid", keys: ["xc60hybrid"] },
  { makeSlug: "mercedes-benz", make: "Mercedes-Benz", modelSlug: "amg-eqs", model: "AMG EQS", keys: ["amgeqs"] },
];

/** The hub at a URL, or undefined if there is none. */
export function findModelHub(makeSlug: string, modelSlug: string): ModelHub | undefined {
  return MODEL_HUBS.find((h) => h.makeSlug === makeSlug && h.modelSlug === modelSlug);
}

const BY_KEY = new Map<string, ModelHub>();
for (const h of MODEL_HUBS) {
  for (const k of h.keys) BY_KEY.set(`${h.make.toLowerCase()}|${k}`, h);
}

/**
 * The hub for a car, keyed on make and model the way the feed spells them.
 * Returns undefined rather than a near-match: a link to the wrong nameplate
 * is worse than no link.
 */
export function hubFor(make: string, model: string): ModelHub | undefined {
  return BY_KEY.get(`${make.toLowerCase()}|${modelKey(model)}`);
}

/** The path for a hub. */
export function hubPath(h: ModelHub): string {
  return `/ev/${h.makeSlug}/${h.modelSlug}`;
}

/**
 * The hubs a fact sheet belongs to, resolved by modelKey rather than by URL
 * segment.
 *
 * Slug-matching would cover 18 of the 19 fact-link models and silently drop
 * the nineteenth: one sheet covers both the Bolt EV and the Bolt EUV
 * (lib/facts/registry.ts says why), and those are two hubs. Returning both is
 * the honest answer; picking one would be a guess about which car the reader
 * came for.
 */
export function hubsForKeys(makeSlug: string, keys: string[]): ModelHub[] {
  const wanted = new Set(keys);
  return MODEL_HUBS.filter(
    (h) => h.makeSlug === makeSlug && h.keys.some((k) => wanted.has(k)),
  );
}
