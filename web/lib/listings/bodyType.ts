import type { Listing } from "./types";
import type { BodyType } from "@/lib/filters";

// Body type is curated, not scraped: feeds don't carry it, so it's an exact
// make+model lookup over the strings actually in inventory (audited 2026-08).
// The rule is the site's usual one — a wrong answer is worse than no answer.
// A model is mapped only when every car sold under that string has one body
// style; anything ambiguous stays unmapped and sits out the type filters.
//
// Deliberately unmapped, so they don't come back as "gaps" on the next audit:
// - Polestar 1 (coupe), Taycan/Panamera Cross & Sport Turismo (wagons),
//   Mercedes SL (roadster): real body styles we don't offer as a filter.
// - Dodge Charger / Charger Daytona: sold as both a 2-door and a 4-door
//   under the same model strings, and trims rarely say which.
// - BMW M5: sedan and Touring (wagon) share the string; trim only
//   sometimes says "Touring".
// - Dealer-garbled rows ("Tesla ModelS", make-is-a-dealer-name rows): the
//   string doesn't verifiably name a vehicle.
// Mercedes EQE/EQS (sedan or SUV under one string) and the GMC Hummer EV
// (pickup or SUV) resolve per listing from the trim field below, when the
// dealer's own trim names the body.
const MODEL_BODY: Record<string, BodyType> = {
  // SUVs and crossovers
  "acura zdx": "suv",
  "alfa romeo tonale": "suv",
  "audi e-tron": "suv",
  "audi e-tron s": "suv",
  "audi e-tron sportback": "suv",
  "audi q4 e-tron": "suv",
  "audi q4 e-tron sportback": "suv",
  "audi q4 sportback e-tron": "suv",
  "audi q5": "suv",
  "audi q6 e-tron": "suv",
  "audi q8 e-tron": "suv",
  "audi q8 sportback e-tron": "suv",
  "audi sq6 e-tron": "suv",
  "audi sq8 e-tron": "suv",
  "bmw ix": "suv",
  "bmw ix m60": "suv",
  "bmw ix xdrive45": "suv",
  "bmw ix xdrive50": "suv",
  "bmw ix3": "suv",
  "bmw x5": "suv",
  "bmw x5 phev": "suv",
  "bmw xm": "suv",
  "cadillac escalade iq": "suv",
  "cadillac escalade iql": "suv",
  "cadillac lyriq": "suv",
  "cadillac optiq": "suv",
  "cadillac vistiq": "suv",
  "chevrolet blazer ev": "suv",
  "chevrolet blazer ev police package": "suv",
  "chevrolet bolt euv": "suv",
  "chevrolet equinox ev": "suv",
  "dodge hornet": "suv",
  "fisker ocean": "suv",
  "ford escape": "suv",
  "ford mustang mach e": "suv",
  "ford mustang mach-e": "suv",
  "genesis electrified gv70": "suv",
  "genesis gv60": "suv",
  "gmc hummer ev suv": "suv",
  "honda prologue": "suv",
  "hyundai ioniq 5": "suv",
  "hyundai ioniq 5 n": "suv",
  "hyundai ioniq 9": "suv",
  "hyundai kona": "suv",
  "hyundai kona electric": "suv",
  "hyundai santa fe plug-in hybrid": "suv",
  "hyundai tucson plug-in hybrid": "suv",
  "jeep gr cherokee 4xe": "suv",
  "jeep grand cherokee": "suv",
  "jeep grand cherokee 4xe": "suv",
  "jeep wagoneer s": "suv",
  "jeep wrangler": "suv",
  "jeep wrangler 4xe": "suv",
  "jeep wrangler unlimited 4xe": "suv",
  "kia ev6": "suv",
  "kia ev9": "suv",
  "kia niro ev": "suv",
  "kia sorento plug-in hybrid": "suv",
  "kia sportage plug-in hybrid": "suv",
  "land rover range rover": "suv",
  "land rover range rover sport": "suv",
  "lexus nx 450h+": "suv",
  "lexus rx 450h plus": "suv",
  "lexus rx 450h+": "suv",
  "lexus rz": "suv",
  "lexus rz 300e": "suv",
  "lexus rz 450e": "suv",
  "lexus tx 550h+": "suv",
  "lincoln aviator": "suv",
  "lincoln corsair": "suv",
  "mazda cx-70 phev": "suv",
  "mazda cx-70 plug-in hybrid": "suv",
  "mazda cx-90 plug-in hybrid": "suv",
  "mazda mazda cx-90 phev": "suv",
  "mercedes-benz eqb": "suv",
  "mercedes-benz eqb 250+": "suv",
  "mercedes-benz eqb 300": "suv",
  "mercedes-benz eqe suv": "suv",
  "mercedes-benz g-class": "suv",
  "mercedes-benz glc": "suv",
  "mercedes-benz glc 350e": "suv",
  "mercedes-benz gle 450e": "suv",
  "mini cooper countryman": "suv",
  "mini countryman": "suv",
  "mitsubishi outlander phev": "suv",
  "nissan ariya": "suv",
  "nissan rogue plug-in hybrid": "suv",
  "polestar 3": "suv",
  "polestar polestar 3": "suv",
  "porsche cayenne": "suv",
  "porsche cayenne e-hybrid": "suv",
  "porsche cayenne e-hybrid coupe": "suv",
  "porsche cayenne s coupe electric": "suv",
  "porsche cayenne turbo e-hybrid": "suv",
  "porsche macan": "suv",
  "porsche macan electric": "suv",
  "rivian r1s": "suv",
  "rivian r2": "suv",
  "subaru solterra": "suv",
  "subaru trailseeker": "suv",
  "subaru uncharted": "suv",
  "tesla model x": "suv",
  "tesla model y": "suv",
  "tesla model y long range": "suv",
  "toyota bz": "suv",
  "toyota bz woodland": "suv",
  "toyota bz4x": "suv",
  "toyota c-hr": "suv",
  "toyota rav4 plug-in hybrid": "suv",
  "toyota rav4 prime": "suv",
  "volkswagen id.4": "suv",
  "volvo c40 recharge pure electric": "suv",
  "volvo ex30": "suv",
  "volvo ex30 cross country": "suv",
  "volvo ex40": "suv",
  "volvo ex90": "suv",
  "volvo xc40 recharge pure electric": "suv",
  "volvo xc60": "suv",
  "volvo xc60 plug-in hybrid": "suv",
  "volvo xc60 recharge plug-in hyb": "suv",
  "volvo xc90 plug-in hybrid": "suv",

  // Sedans (BMW's own site files the i4 Gran Coupe under sedans; the e-tron
  // GT and A6 e-tron follow the same maker categorization)
  "audi a6 e-tron": "sedan",
  "audi a6 sportback e-tron": "sedan",
  "audi e-tron gt": "sedan",
  "audi rs e-tron gt": "sedan",
  "bmw 3 series": "sedan",
  "bmw 330e": "sedan",
  "bmw 5 series": "sedan",
  "bmw 530e": "sedan",
  "bmw 550e": "sedan",
  "bmw 7 series": "sedan",
  "bmw 750e": "sedan",
  "bmw i4": "sedan",
  "bmw i4 edrive35": "sedan",
  "bmw i4 edrive40": "sedan",
  "bmw i4 m50": "sedan",
  "bmw i5": "sedan",
  "bmw i7": "sedan",
  "genesis electrified g80": "sedan",
  "hyundai ioniq 6": "sedan",
  "kia optima plug-in hybrid": "sedan",
  "lexus es": "sedan",
  "lexus es 350e": "sedan",
  "lexus es 500e": "sedan",
  "lexus ese": "sedan", // garbled ES trim string, but every Lexus ES is a sedan
  "lucid air": "sedan",
  "mercedes-benz amg e 53 e": "sedan", // the E 53 plug-in hybrid is US sedan-only
  "mercedes-benz cla": "sedan",
  "mercedes-benz cla 350": "sedan",
  "mercedes-benz eqe 350+ sedan": "sedan",
  "mercedes-benz s-class": "sedan",
  // Maker says "fastback" and shopping sites split sedan/hatchback; owner's
  // call (2026-08): shoppers cross-shop it with the Model 3, so sedan.
  "polestar 2": "sedan",
  "polestar polestar 2": "sedan",
  "porsche panamera 4 e-hybrid": "sedan",
  "porsche taycan": "sedan", // wagon variants carry Cross/Sport Turismo in the model string
  "porsche taycan 4s black edition": "sedan",
  "tesla model 3": "sedan",
  "tesla model 3 standard range": "sedan",
  "tesla model 3 standard range plus": "sedan",
  "tesla model s": "sedan",

  // Trucks
  "chevrolet silverado ev": "truck",
  "ford f-150 lightning": "truck",
  "gmc sierra ev": "truck",
  "rivian r1t": "truck",
  "tesla cybertruck": "truck",

  // Vans
  "brightdrop zevo": "van",
  "brightdrop zevo 600": "van",
  "chrysler pacifica": "van",
  "chrysler pacifica hybrid": "van",
  "chrysler pacifica plug-in hybrid": "van",
  "ford e-transit": "van",
  "mercedes-benz esprinter 2500": "van",
  "ram promaster": "van",
  "ram promaster delivery van bev": "van",
  "rivian delivery": "van",
  "volkswagen id. buzz": "van",

  // Hatchbacks
  "chevrolet bolt ev": "hatchback",
  "chevrolet spark ev": "hatchback",
  "chevrolet volt": "hatchback",
  "fiat 500e": "hatchback",
  "fiat 500e beauty": "hatchback",
  "hyundai ioniq plug-in hybrid": "hatchback",
  "mini cooper se electric": "hatchback",
  "mini electric hardtop 2 door": "hatchback",
  "mini hardtop 2 door": "hatchback",
  "mini se hardtop": "hatchback",
  "smart fortwo electric drive": "hatchback",
  "toyota prius plug-in hybrid": "hatchback",
  "toyota prius prime": "hatchback",
  "volkswagen e-golf": "hatchback",
};

// One model string, more than one body — resolvable per listing, not per model.
const RESOLVERS: Record<string, (l: Pick<Listing, "year" | "trim">) => BodyType | undefined> = {
  // Redesigned as a crossover for 2026; a hatchback before that.
  "nissan leaf": (l) => (l.year >= 2026 ? "suv" : "hatchback"),
  // Pickup or SUV under the same string; 2X/3X trims exist for both.
  "gmc hummer ev": (l) =>
    /pickup/i.test(l.trim ?? "") ? "truck" : /\bsuv\b/i.test(l.trim ?? "") ? "suv" : undefined,
  // The US E-Class plug-in is the E 53 sedan; other E-Class bodies exist, so
  // only that trim resolves.
  "mercedes-benz e-class": (l) => (/\be ?53\b/i.test(l.trim ?? "") ? "sedan" : undefined),
};

// Sedan and SUV share these strings; many dealers name the body in the trim.
const MB_SEDAN_OR_SUV = [
  "mercedes-benz eqe",
  "mercedes-benz eqe 350",
  "mercedes-benz eqe 350+",
  "mercedes-benz eqe amg",
  "mercedes-benz amg eqe",
  "mercedes-benz amg® eqe",
  "mercedes-benz eqs",
  "mercedes-benz eqs 450",
  "mercedes-benz eqs 450+",
  "mercedes-benz eqs 580",
  "mercedes-benz amg eqs",
  "mercedes-benz amg® eqs",
];
for (const key of MB_SEDAN_OR_SUV) {
  RESOLVERS[key] = (l) =>
    /\bsuv\b/i.test(l.trim ?? "") ? "suv" : /\bsedan\b/i.test(l.trim ?? "") ? "sedan" : undefined;
}

/** The listing's body type, or undefined when we can't verifiably say. */
export function bodyTypeOf(l: Pick<Listing, "make" | "model" | "year" | "trim">): BodyType | undefined {
  const key = `${l.make} ${l.model}`.toLowerCase().replace(/\s+/g, " ").trim();
  return MODEL_BODY[key] ?? RESOLVERS[key]?.(l);
}
