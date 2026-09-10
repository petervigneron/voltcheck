// The title brand a dealer's own page states in a spec row.
//
// Owner, 2026-09-10, on rebuiltdeals.com's 2024 F-150 Lightning Flash
// 1FTVW3L73RWG01539 ($39,990): "how did this dealer slip through?" The
// rooftop had been added from the Oregon licence roll the day before, its
// three EVs were on the site within hours, and every one of its pages says
//
//     <span class="specifics-label">Title:</span>
//     <span class="specifics-value">Rebuilt</span>
//
// which no lane read: the dealer-notes lane reads dealer.com's notes widget,
// the disclosure columns read the description, and a spec row is neither. So
// this: one reader for the "Title: Rebuilt" / "Title Status: Salvage" /
// "Title Type: Branded" shape, run on every VDP page the crawl and the notes
// lane fetch, whatever the platform. Only a brand is a fact — "Title: Clean",
// "Clear", "Standard" and the rest say nothing this site prints.
//
// The value is stored as titleBrand, the same field the Carfax and
// marketplace readers fill, and reaches the two disclosure columns the same
// way (0070, 0075). "Rebuilt", "Salvage", "Lemon", "Buyback" come through as
// the dealer's own word.

const BRAND = "(rebuilt|reconstructed|salvage|salvaged|branded|lemon(?: law)?(?: buy[\\s-]?back)?|buy[\\s-]?back|flood|junk|fire|hail)";
// "Title: Rebuilt", "Title Status: Salvage", "Title Type: Branded Title",
// "Title Brand: Lemon". Bounded so the row's own words are what is read, not
// the next row's.
// A bare "Title" needs its colon (prose says "the title" all the time); a
// qualified label ("Title Status", a table header) may stand without one.
const ROW = new RegExp(`\\b(?:title\\s*:|title\\s*(?:status|type|brand|condition)\\s*:?)\\s*${BRAND}\\b(?:\\s*title)?`, "i");
const NOT_A_BRAND = /\b(?:title\s*:|title\s*(?:status|type|brand|condition)\s*:?)\s*(clean|clear|standard|normal|good|regular|n\/a|none|unknown)\b/i;

const strip = (html) =>
  String(html ?? "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(td|th|div|li|p|dd|dt|span)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ");

const pretty = (s) => s.trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** The brand a page's title spec row states, in the dealer's word; undefined when it states none or says clean. */
export function titleBrandFromPage(html) {
  const text = strip(html);
  const m = text.match(ROW);
  if (!m) return undefined;
  // A page can carry both a spec row and marketing copy; the spec row wins,
  // and a clean spec row wins over anything else.
  if (NOT_A_BRAND.test(text) && text.search(NOT_A_BRAND) < m.index) return undefined;
  return pretty(m[1]).slice(0, 60);
}
