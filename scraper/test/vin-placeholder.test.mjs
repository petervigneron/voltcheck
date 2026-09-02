import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isPlaceholderVin } from "../lib/vin-placeholder.mjs";

// The five rows this was written for, live on voltcheck.net on 2026-09-02,
// each with a /listing/ page and a sitemap entry for a car that does not
// exist. Four are ralphhonda.com's "ON ORDER" spelled with zeros for the
// letter O; the fifth is billpagehonda.com's zero-padded DMS record id on a
// car its own page says is in transit.
const LIVE_PLACEHOLDERS = [
  "0N0RDER3333333857",
  "0N0RDER3333333858",
  "0N0RDER3333333890",
  "0N0RDER3333333891",
  "0000A094137100062",
];

test("the placeholder VINs that reached the live site are matched", () => {
  for (const vin of LIVE_PLACEHOLDERS) {
    assert.equal(isPlaceholderVin(vin), true, `${vin} should be recognized as a placeholder`);
  }
  // The listing id is the lowercased VIN, and that is the form the sitemap and
  // the browse feed carry — so the check has to hold in either case.
  for (const vin of LIVE_PLACEHOLDERS) {
    assert.equal(isPlaceholderVin(vin.toLowerCase()), true, `${vin} lowercased should still match`);
  }
});

test("other spellings of the same placeholder are matched", () => {
  // A DMS that pads on the left instead of the right, and the same word
  // written with a 1 for the I.
  assert.equal(isPlaceholderVin("3333330N0RDER3858"), true);
  assert.equal(isPlaceholderVin("1NTRANS1T22222222"), true);
  assert.equal(isPlaceholderVin("C0M1NGS00N2222222"), true);
});

// THE CONTROL TEST. A filter that suppresses listings has to be shown not to
// suppress real ones, and "it looked right" is not that showing. This sample
// is 120 VINs taken at an even stride through every VIN in the live feed —
// all 24 shards of /api/index, 149,070 listings, 2026-09-02 — so it spans the
// makes, the WMIs and the serial shapes the corpus actually contains,
// including the sequential-serial cars a repeated-character rule would have
// eaten (see lib/vin-placeholder.mjs on why there is no such rule). The full
// 149,070-VIN run at the time this was written matched exactly the five rows
// above and nothing else.
const REAL_VINS = ["2C3CDBCK0SR547034", "1C4JJXP68PW555614", "7SAYGAEE0PF598999", "KNAGV4LD1H5016838", "JTMBGAHC7TY007235", "2C3CDBDK3TR167931", "1C4RJXP65RW116408", "7UUG1TJK3VA007328", "KNDCR3L18T5160059", "YV4EK3CL0T2601938", "3FMTK1R45TMA26349", "1C4RJXP69RW172285", "7SAYGDEE1PA078180", "KM8KRDDF2RU308129", "JTMBGAHB3TY601375", "WP1BN2AY6TDA55235", "1C4JJXR62PW629297", "7SAYGDEF4PF582735", "KNDC3DLC4R5175918", "JTMBGAHC4TY007130", "2C4RC1S79PR558704", "1C4RJXN63SW605320", "7SAYGDEEXTA399774", "KNDAEFS54R6038388", "YSMFD3KA1RL238218", "3FMTK1SS1NMA17773", "1C4RJYB69RC710773", "7YAKN4DA1TY071551", "KNDRJDJH8T5458229", "YV4H60PE4T1536836", "3FMTK3SU0SMA29177", "1C4RJYD62RC711910", "7YAKMDDC3TY073029", "KNDPYDDH0V7439969", "YV4H60DPXR1929223", "3FMTK3S56TMA03595", "1C4RJYB6XN8763270", "7YAKN4DA2VY073411", "KNDPYDDH7V7446174", "YV4ER3XM7R2277748", "3FMTK3R73TMA14853", "1C4RJYB6XRC712368", "7UUG1TJK5VA040931", "KNDPYDDH7V7420593", "YV4H60DL4R1846724", "3FMTK3R7XTMA06667", "1FT6W3L70RWG19114", "7YAKRDDC4TY061988", "JA4T0LA90TZ041444", "YV4H60RC4S1203739", "3GN7DNRP4TS127290", "1G1FY6EVXVF122274", "7YAMUFS36TY011874", "JA4T5UA92SZ001534", "YV4H60RM0S1075928", "3GN7DMRP5TS176332", "1G1FY6EV3VF106126", "7YAMUFS30TY006394", "JA4T0LA9XTZ049860", "YV4H60RC0T1501173", "3FMTK4SX4PMA54204", "1G1FY6EV8VF103545", "50EA1PGA4TA020321", "JA4T0MA91TZ048666", "YV4H60PG3S1371586", "3FMTK3SUXTMA20097", "1FTBW1YK9PKB56202", "7YAKN4DAXTY066235", "KNDPYDDH3T7403450", "YV4H60DL9R1758140", "3FMTK1SU4RMA21792", "1C4RJYB61P8874969", "7UUG1TJJ5VA049362", "KNDCR3L15T5159158", "YV4ED3UM1P2087864", "3FMTK1R43RMA33065", "1C4RJYB60R8959501", "7SAYGDEE5RA248382", "KNDC34LA8R5622801", "YSRPA3A41TK002894", "2C4RC1S71SR559290", "1C4RJXN61RW303728", "7SAXCBE63NF349311", "KM8KNDAF7PU209657", "JTMBDAFB7TA012415", "WP1AE2AY3TDA11205", "4JGGM2BB0RA058173", "7G2CEHED0RA001151", "KM8KNDDF6RU302412", "JTMBGAHB7VY640991", "2C4RC1S72RR102627", "1C4RJXN65RW161917", "7SAYGDEF2PF753451", "KNDCR3L16T5161789", "YV4EK3CL9T2615319", "3FMTK1S59TMA14837", "1C4RJYB64P8786224", "7UUG1TJJ3VA043219", "KNDC5DLEXR5180990", "YV4EK3ZK0T2702282", "3FMTK3R70TMA11277", "1C4RJYB66RC709919", "7UUG1TJKXVA005043", "KNDPYDDH2V7431033", "YV4EK3ZK4T2618188", "3FMTK3R49PMB04035", "1C4RJYB62P8788778", "7UUG1TJJ6VA006732", "KNDCR3L15T5150783", "VCF1UBU27PG007108", "3C4RJACK7TT214725", "1C4RJXP60SW577943", "7JDEV3VK2SG019542", "KM8KNDDF1RU294249", "JTMBGAHBXTY610381", "2C4RC1L77PR618266", "1C4JJXP6XPW525191", "7SAXCBE61PF428365", "KM8KRDDF6RU285812", "JTMBGAHB4TY613163"];

test("no real VIN from the live feed is suppressed", () => {
  const wrongly = REAL_VINS.filter((v) => isPlaceholderVin(v));
  assert.deepEqual(wrongly, [], `these are real cars and must not be dropped: ${wrongly.join(", ")}`);
  assert.ok(REAL_VINS.length >= 100, "the control sample must stay large enough to mean something");
});

test("sequential serials and repeated characters are left alone", () => {
  // The rule this filter deliberately does NOT have. Every one of these is a
  // real car in the feed; a repeated-character heuristic would have taken them.
  for (const vin of ["1C4JJXP62MW859999", "JM3KKDHA9R1111121", "JTMADAFB0TA000000", "1GYKPMRL7RZ111110", "YSMFD3KA8RL222226"]) {
    assert.equal(isPlaceholderVin(vin), false, `${vin} is a real car with a repetitive serial`);
  }
});

test("nothing is claimed about an absent VIN", () => {
  // A missing VIN is ingest.mjs's own `r.vin` check, not this one's business.
  for (const v of [undefined, null, "", "   "]) assert.equal(isPlaceholderVin(v), false);
});

test("ingest.mjs actually applies the filter", async () => {
  // The module is worthless unless the pipeline calls it, and a filter that
  // quietly stops being wired in is exactly the failure this repo keeps
  // hitting. ingest.mjs is the one place every lane lands.
  const src = await readFile(new URL("../ingest.mjs", import.meta.url), "utf-8");
  assert.match(src, /import \{ isPlaceholderVin \} from "\.\/lib\/vin-placeholder\.mjs"/);
  assert.match(src, /isPlaceholderVin\(r\.vin\)/);
});
