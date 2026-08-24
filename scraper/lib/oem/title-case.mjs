// Un-shout a name a feed serves in all caps. One copy, shared by the lanes
// that were written after it existed.
//
// Four lanes already carry their own inline version (gm.mjs's
// titleCaseIfShouty, genesis.mjs, genesis-cpo.mjs, honda-cpo.mjs, acura-cpo
// .mjs). Those are working code and are deliberately left alone — the same
// call grid.mjs made about hyundai.mjs's inline covering grid. What is NOT
// left alone is adding two more copies for the two lanes landing now, because
// they would drift the moment one of them is corrected — and this one already
// needed a correction the older copies do not have:
//
//   /\b([a-z])/g capitalises the letter after an apostrophe, so
//   "DOUG'S LYNNWOOD MAZDA" comes out "Doug'S Lynnwood Mazda". Mazda's
//   national roster has several of those. The word boundary has to exclude a
//   preceding letter OR apostrophe, which is what the pattern below does.
//
// Mixed-case input passes through untouched: a feed that already capitalises
// its names knows better than this function does.
const ACRONYMS = /\b(Llc|Inc|Ii|Iii|Iv|Gmc|Bmw|Kia|Usa|Ny|La)\b/g;

export function titleCaseIfShouty(s) {
  if (!s || typeof s !== "string" || s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/(^|[^a-z'])([a-z])/g, (_, before, letter) => before + letter.toUpperCase())
    .replace(ACRONYMS, (m) => m.toUpperCase());
}
