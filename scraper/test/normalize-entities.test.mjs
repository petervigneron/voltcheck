// node --test scraper/test/normalize-entities.test.mjs
//
// HTML entities in scraped text. An undecoded one is not a display blemish:
// web/lib/enrichment/match.ts keys trims on norm(), which strips everything
// outside [A-Z0-9], so "&reg;" contributes the letters R, E, G to the key.
// "4MATIC &reg;" became "4MATICREG" and matched no registry trim.
//
// The live feed on 2026-08-25 carried 130 such listings out of 136,915 — 129
// Mercedes (EQE, EQS, EQB, CLA 350 Electric, GLC 350e 4MATIC, and AMG rows
// where the + in "4MATIC+" arrives as "&#x2B;") and one Ford "Platinum&reg;"
// Lightning. The strings below are those rows verbatim.
import test from "node:test";
import assert from "node:assert/strict";
import { decodeEntities, normalize, text } from "../lib/normalize.mjs";

const norm = (s) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""); // web/lib/enrichment/match.ts

test("the live Mercedes trims norm to the registry's key once decoded", () => {
  // pictures.dealer.com rooftops, 2026-08-25. Left side is what is stored
  // today; right side is the trim the registry actually holds.
  assert.equal(norm(text("EQE 320 4MATIC &reg;")), "EQE3204MATIC");
  assert.equal(norm(text("EQS 400 4MATIC &reg;")), "EQS4004MATIC");
  assert.equal(norm(text("Electric 4MATIC &reg;")), "ELECTRIC4MATIC");
  assert.equal(norm(text("350e 4MATIC &reg;")), "350E4MATIC");
  assert.equal(norm(text("EQS 450 4MATIC &reg;")), "EQS4504MATIC");
  assert.equal(norm(text("EQS 550 4MATIC &reg;")), "EQS5504MATIC");
  // No space before the entity on the older EQB/EQE/EQS rows — same defect.
  for (const [raw, want] of [
    ["300 4MATIC&reg;", "3004MATIC"],
    ["350 4MATIC&reg;", "3504MATIC"],
    ["350e 4MATIC&reg;", "350E4MATIC"],
    ["400 4MATIC&reg;", "4004MATIC"],
    ["500 4MATIC&reg;", "5004MATIC"],
    ["550 4MATIC&reg;", "5504MATIC"],
    ["580 4MATIC&reg;", "5804MATIC"],
    ["Platinum&reg;", "PLATINUM"], // the one Ford in the set, an F-150 Lightning
  ]) {
    assert.equal(norm(text(raw)), want, raw);
  }
  // Two entities in one string, and the "+" that match.ts treats as
  // significant must survive as a literal "+" — trimPlusMismatch() reads the
  // raw character, not the normalized key, so decoding it wrong would refuse
  // the match instead of just missing it.
  assert.equal(text("AMG&reg; 4MATIC+&reg;"), "AMG® 4MATIC+®");
  assert.equal(norm(text("AMG&reg; 4MATIC+&reg;")), "AMG4MATIC");
  // AMG's plus sign also arrives as a hex numeric entity, in both cases. Here
  // the decode ADDS the "+", which is the honest reading: the car is a
  // 4MATIC+, and before the fix it could not match a 4MATIC+ row at all.
  assert.equal(text("E 53 E 4MATIC&#x2B;"), "E 53 E 4MATIC+");
  assert.equal(text("E 53 E 4MATIC&#x2b;"), "E 53 E 4MATIC+");
});

test("&reg; decodes to the character, and is not merely stripped", () => {
  // Decoding rather than deleting is the whole point: it fixes &reg; without
  // mangling &amp; or &#x2B;, which a strip would have turned into "AMP" and
  // "X2B". The card still reads the way the dealer's own page renders it.
  assert.equal(decodeEntities("4MATIC &reg;"), "4MATIC ®");
  assert.equal(decodeEntities("Sport &amp; Design"), "Sport & Design");
  assert.equal(decodeEntities("4MATIC&#174;"), "4MATIC®");
  assert.equal(decodeEntities("4MATIC&#x2B;"), "4MATIC+");
});

test("a string with no entities comes back byte-identical", () => {
  // The control. Every trim in the feed that was already clean must stay so —
  // a decoder that rewrites healthy strings would re-key the other ~132,000
  // listings, not just the 76 broken ones.
  for (const s of ["Long Range AWD", "Premium Plus 55 quattro", "GT-Line", "4MATIC", "AT&T Edition", "1 & 2"]) {
    assert.equal(decodeEntities(s), s);
    assert.equal(text(s), s);
  }
});

test("numeric entities decode in decimal and hex, either case", () => {
  assert.equal(decodeEntities("&#174;"), "®");
  assert.equal(decodeEntities("&#0174;"), "®");
  assert.equal(decodeEntities("&#xAE;"), "®");
  assert.equal(decodeEntities("&#xae;"), "®");
  assert.equal(decodeEntities("&#X2B;"), "+");
});

test("named entities decode, case-insensitively only where that is unambiguous", () => {
  assert.equal(decodeEntities("&amp;&lt;&gt;&quot;&apos;"), "&<>\"'");
  assert.equal(decodeEntities("&reg;&trade;&copy;&deg;"), "®™©°");
  assert.equal(decodeEntities("&AMP;&REG;&Trade;"), "&®™");
  // &Eacute; is É and &eacute; is é — folding case here would print the wrong
  // letter, so accented names match exactly or not at all.
  assert.equal(decodeEntities("&eacute;"), "é");
  assert.equal(decodeEntities("&Eacute;"), "&Eacute;");
});

test("an unrecognized or malformed entity is left verbatim, never guessed", () => {
  // A string that still looks like an entity is at least legible as one in the
  // data; a half-decoded guess is not.
  assert.equal(decodeEntities("&notanentity;"), "&notanentity;");
  assert.equal(decodeEntities("&reg"), "&reg"); // no semicolon
  assert.equal(decodeEntities("R & D"), "R & D");
  // Code points String.fromCodePoint would throw on, or that name nothing.
  assert.equal(decodeEntities("&#0;"), "&#0;");
  assert.equal(decodeEntities("&#xD800;"), "&#xD800;"); // lone surrogate
  assert.equal(decodeEntities("&#9999999;"), "&#9999999;"); // past U+10FFFF
});

test("an entity named after an Object prototype member resolves to nothing", () => {
  // "toString" and "valueOf" both fit the entity-name pattern, so a bare
  // NAMED_ENTITIES[name] lookup walked the prototype chain and spliced the
  // function's own source text into the string.
  for (const s of ["&toString;", "&valueOf;", "&hasOwnProperty;", "&__proto__;"]) {
    assert.equal(decodeEntities(s), s);
  }
  assert.equal(decodeEntities("Long Range &toString; AWD"), "Long Range &toString; AWD");
});

test("double-encoded text unwinds, but a literal &amp;amp; is not unwound past its meaning", () => {
  // dealercarsearch.com serves `170&amp;quot; RWD` inside an onchange
  // attribute; one pass leaves `170&quot; RWD` standing.
  assert.equal(decodeEntities("170&amp;quot; RWD"), '170" RWD');
  assert.equal(decodeEntities("&amp;amp;"), "&");
});

test("decoding runs before the placeholder test and before trimming", () => {
  // "&#45;" is the same absent-field placeholder as "-", and a field holding
  // nothing but "&nbsp;" is whitespace once decoded, not a one-character value.
  assert.equal(text("&#45;"), undefined);
  assert.equal(text("&nbsp;"), undefined);
  assert.equal(text("&nbsp;Long Range&nbsp;"), "Long Range");
});

test("a vehicle node's trim is decoded on the way through normalize()", () => {
  // The crawl lane's path end to end: schema.org node -> normalize() -> record.
  const rec = normalize(
    {
      vehicleIdentificationNumber: "4jgdm2eb3ta041728",
      vehicleConfiguration: "EQS 400 4MATIC &reg;",
      model: "EQS 400 SUV",
      brand: "Mercedes-Benz",
      color: "Twilight Blue",
    },
    { sourceUrl: "x", dealerDomain: "mercedesbenzofstevenscreek.com" },
  );
  assert.equal(rec.trim, "EQS 400 4MATIC ®");
  assert.equal(norm(rec.trim), "EQS4004MATIC");
});

test("a query string's &amp; is decoded, so the image URL keeps its parameters", () => {
  // Not a trim problem, but the same defect and the same fix. 25 image URLs in
  // the feed are stored as "…?styleid=478459&amp;Width=640&amp;Height=480&…".
  // Measured 2026-08-25: service.secureoffersites.com answers 200 either way,
  // but every parameter after the first is named "amp;Width" rather than
  // "Width", so it ignores the size and serves the full-size original — 742 KB
  // where the requested 640x480 is 20 KB. Not a broken image; a 36x one.
  // lib/sitemap.mjs hit the harder version of this on sitemap <loc> entries,
  // where the undecoded URL 404s outright.
  assert.equal(
    text("/images/GetEvoxImage?styleid=478459&amp;Width=640&amp;Height=480"),
    "/images/GetEvoxImage?styleid=478459&Width=640&Height=480",
  );
});

test("decodeEntities passes non-strings through untouched", () => {
  assert.equal(decodeEntities(undefined), undefined);
  assert.equal(decodeEntities(null), null);
  assert.equal(decodeEntities(42), 42);
});
