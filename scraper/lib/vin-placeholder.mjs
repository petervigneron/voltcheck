// Is this "VIN" a dealer DMS's placeholder for a car that has no VIN yet?
//
// A car that has not been built, or has been built and not yet arrived, still
// occupies a row in the dealer's inventory system — and that row needs
// something in the VIN column. Two live examples, both Honda Prologues, both
// found in the 2026-09-02 sitemap sample:
//
//   ralphhonda.com     0N0RDER3333333857 / …858 / …890 / …891
//                      "ON ORDER" with the letter O written as a zero (O is
//                      not a legal VIN character), right-padded with 3s.
//   billpagehonda.com  0000A094137100062
//                      The DMS's own record id, left-padded with zeros. The
//                      dealer's page says it plainly: "Some vehicles may be
//                      in transit to the dealership."
//
// They reached the site because every VIN check in this repo is a shape test —
// /^[A-HJ-NPR-Z0-9]{17}$/ — and both strings pass it: 17 characters, no I, no
// O, no Q. So each got a /listing/ page, a sitemap entry and a price. The site
// told a shopper a specific car exists at a specific dealer for $44,125, and
// there is no such car. That is the claim rule in CLAUDE.md, and it is not a
// render-time problem: filtering at the page would leave the row in the
// database, in the browse feed and in the sitemap.
//
// TWO RULES, both control-tested against every VIN in the live feed — all 24
// shards of /api/index, 149,070 listings, 2026-09-02. Between them they match
// 5 rows, and all 5 are the placeholders above. Zero real cars.
//
// 1. THE FIRST CHARACTER IS A ZERO. This is structural, not a heuristic. The
//    first VIN character is the geographic region (ISO 3780): 1-5 North
//    America, 6-7 Oceania, 8-9 South America, A-C Africa, J-R Asia, S-Z
//    Europe. Zero is not assigned to anyone, so no VIN starts with one. The
//    live corpus agrees — the first-character histogram over 149,070 VINs has
//    exactly five entries under "0", and they are these five rows.
//
// 2. A PLACEHOLDER WORD SPELLED WITH DIGIT LOOKALIKES. O, I and Q are illegal
//    in a VIN precisely because they read as 0, 1 and 5-ish, which is why a
//    DMS writing "ON ORDER" into a VIN-shaped field produces "0N0RDER" — and
//    why the word survives a charset check that would have rejected the
//    honest spelling. Undo the substitution, then look for the word.
//
// WHAT IS DELIBERATELY NOT HERE. No repeated-character rule: 394 of 24,778
// sampled VINs (1.59%) carry four or more repeats and nearly all are ordinary
// sequential serials — jm3kkdha9r1111121, jtmadafb0ta000000, 1c4jjxp62mw859999
// are real cars. No check-digit rule either, though it would catch all five:
// 27 of the 149,070 fail ISO 3779's position-9 digit and most of the other 22
// look like real cars a dealer mistyped, and dropping a real car to catch a
// fake one is the wrong side of the trade here. And no short tokens — SOLD,
// DEMO, NOVIN, TBD read as four or five characters inside a seventeen-
// character string, and "absent from 149,070 VINs" is not evidence that a
// four-character substring is safe. Every token below is seven characters or
// more.
//
// The abstain direction: a placeholder this misses stays published (loud, in
// ingest.mjs's log, once someone looks), and a real car is never dropped.

// Digit-for-letter substitutions a DMS makes when it writes a word into a
// field that rejects O, I and Q. Only these three: 2/Z, 8/B and 6/G are all
// legal VIN characters, and substituting them would widen the match with no
// case behind it.
const LOOKALIKES = { 0: "O", 1: "I", 5: "S" };

// Seven characters or more, each an inventory-status phrase a dealer system
// would write where a VIN goes. Matched anywhere in the string, because the
// padding can sit on either side of the word.
const PLACEHOLDER_WORDS = [
  "ONORDER", "ORDERED", "FACTORYORDER", "INPRODUCTION",
  "INTRANSIT", "INCOMINGUNIT", "COMINGSOON", "ARRIVINGSOON",
  "NOTAVAILABLE", "NOTASSIGNED", "TOBEASSIGNED", "PLACEHOLDER",
  "AWAITINGVIN", "VINPENDING", "PENDINGVIN", "UNKNOWNVIN", "NOVINYET",
];

export function isPlaceholderVin(vin) {
  const v = String(vin ?? "").trim().toUpperCase();
  if (!v) return false;
  if (v[0] === "0") return true;
  const spelled = v.replace(/[015]/g, (d) => LOOKALIKES[d]);
  return PLACEHOLDER_WORDS.some((w) => spelled.includes(w));
}
