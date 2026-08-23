// The identity gate for license-roll resolution: given a roll row and a page
// we fetched at a guessed domain, does the PAGE ITSELF assert that it belongs
// to this licensee? Matching nothing is honest; matching the wrong thing is
// not, so nothing here infers — every rule needs the roll's own datum printed
// on the page.
//
// Kept in its own module because each rule is here for a specific false or
// missed match, and those cases belong in a test file rather than in a
// comment nobody re-runs.
import { squash } from "./dealer-names.mjs";

// HTML entities have to go before squash() sees them, or their letters end up
// IN the text: "Parks&nbsp;Motors" squashes to "parksnbspmotors", which the
// licensed name "parksmotors" is not a substring of. A dealer whose theme
// puts a non-breaking space between the words of its own name was invisible
// to the name rule.
const ENTITIES = { amp: "&", nbsp: " ", quot: '"', apos: "'", lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"', ndash: "-", mdash: "-", hellip: " " };
const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? " ");

export function pageEvidence(body) {
  const text = decode(body.slice(0, 500_000));
  const stripped = text.replace(/<[^>]+>/g, " ");
  return {
    // Phone numbers arrive split by their own punctuation — "(253) 472-7483"
    // — so the phone rule has to look in every digit on the page run
    // together. The zip rule must NOT: see zipOnPage.
    digits: text.replace(/\D+/g, ""),
    digitRuns: new Set((text.match(/\d+/g) ?? [])),
    squashed: squash(stripped).replace(/ /g, ""),
  };
}

// A zip has to be printed AS a zip, not found inside the page's digits run
// together. Searching the concatenated digit string for five digits matches
// any five-digit window of any phone number, price, product code or
// timestamp on the page, and that is not a hypothetical: it put Land'n Sea
// Inc, a Manhattan apparel manufacturer, under LAND N SEA CO of Marysville
// WA 98270, and Three Rivers Marine of Crystal River FLORIDA under the
// same-named licensee in Woodinville WA. Both cleared "name + zip" on 2026-08-23
// against pages that never print those zips at all. So the zip must be its own
// run of digits, or the first five of a ZIP+4.
function zipOnPage(zip, evidence) {
  if (evidence.digitRuns.has(zip)) return true;
  for (const run of evidence.digitRuns) if (run.length === 9 && run.startsWith(zip)) return true;
  return false;
}

// Returns the name of the rule that cleared, or null. Rules, strongest first:
//
//  phone       — the roll's 10-digit phone, digit-exact on the page.
//  name+phone9 — Washington publishes 262 of its 2,064 licences with the last
//                digit of the phone missing ("(425) 500-770" is the state's
//                own string), which disabled the phone rule on one row in
//                eight. Nine digits is area code plus six: evidence, but not
//                enough alone, so the licensed name must appear as well.
//  name+zip    — the licensed name and the roll's zip. Preferred over city:
//                a 2026-08-20 hand-check found hudsoncollision.com matched
//                "Hudson Collision Center" + "Hudson" to a same-named shop in
//                Hudson, OHIO. City names repeat constantly; zips do not.
//  name+city   — only when the roll row carries no zip at all.
export function identityRule(dealer, evidence) {
  const { digits, squashed } = evidence;
  const name = squash(dealer.name ?? "").replace(/ /g, "");
  const nameOnPage = name.length >= 8 && squashed.includes(name);
  const phone = dealer.phone ?? "";
  if (phone.length === 10 && digits.includes(phone)) return "phone";
  if (phone.length === 9 && digits.includes(phone) && nameOnPage) return "name+phone9";
  if (!nameOnPage) return null;
  if (dealer.zip) return zipOnPage(dealer.zip, evidence) ? "name+zip" : null;
  const city = squash(dealer.city ?? "").replace(/ /g, "");
  return city && squashed.includes(city) ? "name+city" : null;
}
