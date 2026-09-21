// Strings that PostgREST will refuse.
//
// JavaScript strings are UTF-16, and String.prototype.slice cuts by code
// unit. Cut a description in the middle of an emoji and the string ends in
// half a character; JSON.stringify writes that half as "\ud83d", which Node
// considers a legal string and PostgREST's parser considers invalid JSON —
// and it rejects the WHOLE request: HTTP 400 PGRST102 "Empty or invalid
// json", the same words for a lone surrogate as for an empty body.
//
// That was every rolling-crawl and browser-crawl failure from 2026-09-19 to
// 09-21: one chunk a run, a dealer whose emoji-laden boilerplate landed on
// the 2,000-character cut for every car on the lot, ~1,700 rows of other
// dealers' cars in the same chunk neither updated nor delisted. Measured
// against the live project on 2026-09-21 (sync-probe.mjs): a lone high or
// low surrogate escape answers PGRST102 through the edge function and
// straight to PostgREST alike; a \u0000 escape, a real emoji and fifty 3 MB
// well-formed bodies all parse. The transport was never the problem.
//
// Two layers, because the cut sites are many and new ones will be written:
//   cut()               — a code-unit slice that never ends in half a
//                         character, for every `.slice(0, N)` on text.
//   repairWellFormed()  — the last line of defence at the sync boundary:
//                         every string in every row, whatever produced it,
//                         made well-formed (U+FFFD for the stray half) and
//                         NAMED in the log, so the dealer behind the next
//                         one is one grep away instead of a day's diagnosis.

/** `s.slice(0, n)` that never ends on a lone high surrogate. */
export function cut(s, n) {
  if (typeof s !== "string") return s;
  if (s.length <= n) return s;
  const out = s.slice(0, n);
  const last = out.charCodeAt(out.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? out.slice(0, -1) : out;
}

/**
 * Make every string in `rows` well-formed, in place. Returns one entry per
 * repaired string: { vin, domain, field, before } — `before` is the JSON
 * escape of the offending text's tail, for the log.
 */
export function repairWellFormed(rows) {
  const repaired = [];
  const walk = (value, row, path) => {
    if (typeof value === "string") {
      if (value.isWellFormed()) return value;
      const at = [...value].findIndex((c) => { const u = c.charCodeAt(0); return u >= 0xd800 && u <= 0xdfff && c.length === 1; });
      repaired.push({
        vin: row?.vin, domain: row?.domain ?? row?.dealerDomain, field: path,
        before: JSON.stringify(value.slice(Math.max(0, at - 12), at + 1)),
      });
      return value.toWellFormed();
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) value[i] = walk(value[i], row, `${path}[${i}]`);
      return value;
    }
    if (value && typeof value === "object") {
      for (const k of Object.keys(value)) value[k] = walk(value[k], row, path ? `${path}.${k}` : k);
      return value;
    }
    return value;
  };
  for (const row of rows) walk(row, row, "");
  return repaired;
}
