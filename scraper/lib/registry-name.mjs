// A seller name for a car whose page did not state one, from the registry
// entry for the rooftop it was crawled from.
//
// Measured 2026-11-18 on 30,510 cars from the public API: 27.5% carry no
// seller name, and for about 70% of the unnamed ones that have a domain the
// registry holds a "rooftop" entry with a name. ingest.mjs already falls back
// to that entry for the LOCATION; this is the same fallback for the name.
//
// IT SHIPS OFF (ingest.mjs REGISTRY_NAME_FILL = false). The reason is not in
// this file; it is in ingest_listings (supabase/migrations/0103, the
// `challenger_is_home` rule from 0094/0095). A car co-listed on several of a
// group's sites keeps its headline on the incumbent site, EXCEPT that a
// dealer site whose `dealerName` name_key()-equals the dealer a maker's
// marketplace names takes the headline over its sibling — and writes a
// `seller_changed … (home rooftop)` event and, when the two sites ask
// different prices, a price-history row. A name filled where there was none
// can newly satisfy that equality, so switching this on can move headlines
// and write seller_changed events on the first night for cars that did not
// change hands. It cannot flap (the rule refuses the move whenever the
// incumbent's own name also matches, so the move back can never qualify),
// and the moves it makes are the ones the rule was written to make — but a
// shopper would see a price and a seller change on cars nobody touched, and
// that is the owner's call, not a side effect. It is also a one-time payload
// rewrite of every newly named row (migration 0025: payload-equal is
// row-equal). Both are reasons to switch it on deliberately, on a quiet night.
//
// THE REGISTRY'S NAMES ARE NOT ALL NAMES. Of 40,050 rooftop entries on
// 2026-11-18, 10,536 are named "Dealership Website" (a page <title>), a few
// hundred are just a make ("Ford"), ~10,000 carry a legal suffix and many of
// those are a licence roll's legal entity rather than the store
// ("FLORIDA MAG ENTERPRISES INC" on griecocars.com), and some are another
// rooftop's name outright ("Courtesy Chevrolet - San Diego" on
// courtesyinfinitioftucson.com, "THOMPSON BUICK GMC" on
// thompsoncadillacraleigh.com). Matching nothing is honest; matching the
// wrong thing is not. So a name is used only when every word of it is spelled
// out in the domain itself (nameAgreesWithDomain): "Lou Fusz Kia" on
// loufuszkia.com, "Toyota of Downtown LA" on toyotaofdowntownla.com. That
// throws away true names too ("Mercedes-Benz of Champaign" on
// mbofchampaign.com) — deliberately: the domain is the one thing about the
// seller this car's own page proved.

const OPTIONAL = new Set(["of", "the", "and", "at", "inc", "llc", "ltd", "corp", "co", "incorporated", "corporation", "company"]);
// Words that say nothing about WHICH seller. A name made only of these and
// make names ("Ford", "Toyota Motors") is not a seller's name.
const GENERIC = new Set([
  "auto", "autos", "automotive", "motor", "motors", "car", "cars", "sales", "group", "dealer", "dealers",
  "dealership", "website", "new", "used", "preowned", "pre", "owned", "certified", "center", "centre",
]);
const MAKE_WORDS = new Set([
  "acura", "alfa", "romeo", "aston", "martin", "audi", "bentley", "bmw", "buick", "cadillac", "chevrolet",
  "chevy", "chrysler", "dodge", "fiat", "fisker", "ford", "genesis", "gmc", "honda", "hyundai", "infiniti",
  "jaguar", "jeep", "kia", "land", "rover", "lexus", "lincoln", "lucid", "maserati", "mazda", "mercedes",
  "benz", "mini", "mitsubishi", "nissan", "polestar", "porsche", "ram", "rivian", "subaru", "tesla",
  "toyota", "vinfast", "volkswagen", "vw", "volvo",
]);

/** The domain's registrable label, letters and digits only:
 *  "sewellcadillac-houston.com" → "sewellcadillachouston". */
function domainLabel(domain) {
  const host = String(domain ?? "").toLowerCase().trim().replace(/^www\./, "");
  const dot = host.lastIndexOf(".");
  if (dot <= 0) return "";
  return host.slice(0, dot).replace(/[^a-z0-9]/g, "");
}

/** The name's words, lower case: possessives folded ("Rairdon's" → "rairdon"),
 *  "&" and punctuation dropped. */
function nameWords(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * True when every word of `name` (bar of/the/and and legal suffixes) is
 * spelled out in `domain`'s label, at least one of them is not a make or a
 * generic word, and together they spell at least half the label. A "dba"
 * name is two names and is refused.
 */
export function nameAgreesWithDomain(name, domain) {
  const label = domainLabel(domain);
  if (!label) return false;
  const words = nameWords(name);
  if (!words.length || words.includes("dba")) return false;
  const required = words.filter((w) => !OPTIONAL.has(w));
  if (!required.length) return false;
  if (!required.some((w) => !GENERIC.has(w) && !MAKE_WORDS.has(w))) return false;
  if (!required.every((w) => label.includes(w))) return false;
  // And the name has to account for at least half of the domain: a fragment
  // ("Ever" on evercars.com) is not the seller's name even when it is spelled
  // inside it.
  const covered = [...new Set(required)].reduce((n, w) => n + w.length, 0);
  return covered * 2 >= label.length;
}

/**
 * domain → name, for registry entries of kind "rooftop" whose name agrees
 * with their domain. Never "group" (one domain, many rooftops: the domain
 * does not say which one), never any other kind. A domain listed more than
 * once is left out rather than resolved.
 */
export function registryRooftopNames(registry) {
  const seen = new Map();
  for (const s of registry?.sites ?? []) {
    if (!s?.domain) continue;
    seen.set(s.domain, seen.has(s.domain) ? null : s);
  }
  const out = new Map();
  for (const [domain, s] of seen) {
    if (!s || s.kind !== "rooftop" || typeof s.name !== "string") continue;
    const name = s.name.trim();
    if (name && nameAgreesWithDomain(name, domain)) out.set(domain, name);
  }
  return out;
}

/**
 * The name to store: the listing's own whenever it stated one, else the
 * registry's for its domain, else `stated` exactly as it came (so with no
 * registry name an empty string stays an empty string and the payload is
 * byte-identical to what ingest wrote before this existed). `stated` is the
 * already-cleaned listing name.
 */
export function dealerNameFor(stated, domain, names) {
  if (typeof stated === "string" && stated.trim()) return stated;
  return (domain && names?.get(domain)) || stated;
}
