// The dealer DIRECTORY a Motive rooftop publishes about itself and its
// siblings — the id → public-domain mapping the crawl lane could not get.
//
// ridemotive.mjs reaches Motive's national Algolia index, and that index is
// keyed on `dealer_id` / `dealership` (a name) and carries no address and no
// domain. The platform's own `api.app.ridemotive.com/dealers/{id}` answers 401
// to our declared identity, so that door is shut. But every Motive page ships
// its store-switcher data inline, and that data is the dealer record itself:
//
//   "child_dealers":[{"id":131,"name":"Kunes Honda of Sycamore",
//     "domain":"kuneshondasycamore.com","sales_phone":"8152426850",
//     "address_1":"1875 Dekalb Ave","city":"Sycamore","state":"Illinois",
//     "zipcode":"60115", …}, …]
//
// measured 2026-08-23: kunesbuickgmc.com publishes 52 sibling domains,
// trivistacompanies.com 87, and a single-rooftop site publishes its own record
// plus a handful. So one polite fetch of a group's homepage hands back a whole
// group's rooftops WITH their addresses — no name guessing, no fuzzy identity
// matching, and nothing inferred: the mapping is the platform's own.
//
// The same object shape carries the page's OWN dealer (`"dealer":{"id":…`),
// which is what makes a fetched domain self-verifying: the site asserts the
// dealer id it serves, and that id is the key the index is partitioned on.
//
// The payload is served twice — once as JSON in the RSC flight stream with
// every quote backslash-escaped, once plain — so both forms are scanned.

// Platform-internal hosts are NOT public dealer sites: `tfg.app.ridemotive.com`
// is how the platform addresses the rooftop before it has a domain, and
// `churnedmonmouth.ridemotive.com` / `churnedkunesmobility.motivehq` are how it
// parks a dealer that left. A registry row pointing at any of them would be a
// row pointing at Motive, not at a dealer.
// `churned` is the platform's own marker for a dealer that left, and it turns
// up as a label anywhere in the host, not only under its own domains:
// `churnedmonmouth.ridemotive.com`, `adfasdfas.churned.com`,
// `churneddealeres.adachevy.com`. All three resolve to nothing.
//
// motivehq appears BOTH with and without a TLD — `churnedkunesmobility.motivehq`
// and `bmw.motivehq.com` — and anchoring on the bare form let three of the
// platform's own hosts through as "new dealers", one of them the third-biggest
// EV row in the first emitted file. Match the domain either way.
const INTERNAL_RE = /(^|\.)(ridemotive\.com|motivehq(\.com)?)$|(^|\.|-)churned/i;
const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,24}$/;

export function isPublicDealerDomain(domain) {
  const d = String(domain ?? "").toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (!d || d.length > 80) return false;
  if (!DOMAIN_RE.test(d)) return false;
  if (INTERNAL_RE.test(d)) return false;
  return true;
}

export const apex = (domain) => String(domain ?? "").toLowerCase().replace(/^www\./, "").replace(/\.$/, "");

// A dealer object always opens with these three keys in this order, in every
// payload sampled (the page's own `dealer`, and every entry of
// `child_dealers`). Anchoring on the triple rather than on the array name
// keeps one unfamiliar wrapper key from hiding a whole group.
const OPEN_RE = /\{"id":(\d{1,7}),"name":"((?:[^"\\]|\\.){0,150})","domain":"([A-Za-z0-9.\-]{1,80})"/g;

// String-aware brace matcher: an `about_paragraph` may contain a brace, and a
// naive depth count would then end the object in the middle of the group.
//
// The cap is generous because the record a site publishes about ITSELF is the
// big one — opening hours per department, theme colours, every page's meta
// description — and at 20,000 characters the matcher ran off the end of Twin
// Falls Subaru's own object and dropped the one record on that page that
// carried a public domain. When even the cap is not enough, the window is used
// as-is: the next dealer object starts after this one, so a window bounded by
// the cap cannot reach into a sibling's fields.
function objectSlice(text, start, cap = 60000) {
  let depth = 0, inStr = false;
  const end = Math.min(text.length, start + cap);
  for (let i = start; i < end; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return text.slice(start, end);
}

const field = (slice, name) => slice.match(new RegExp(`"${name}":"((?:[^"\\\\]|\\\\.){0,120})"`))?.[1];

// Full state names are what the payload carries ("Illinois"); the registry's
// location.state is the two-letter code every other lane writes.
const STATES = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY",
  louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "puerto rico": "PR",
};

export function stateCode(s) {
  const t = String(s ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return STATES[t.toLowerCase()] ?? "";
}

const unescapeJson = (s) => s.replace(/\\"/g, '"');
// Names arrive with JSON \u escapes intact ("Twin Falls Car Sales &
// Rentals"); the registry prints them.
const unescapeText = (s) =>
  String(s ?? "")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\(.)/g, "$1")
    .trim();

/** Every dealer record a Motive page publishes: its own and its siblings'.
 *
 *  Returns a Map keyed by dealer id. Records are deduped by id within a page,
 *  preferring the one that carries an address — the same dealer can appear
 *  twice in a payload (once in a nav stub, once in full).
 */
export function motiveDealerRecords(html) {
  const out = new Map();
  if (typeof html !== "string" || !html) return out;
  const texts = [html];
  if (html.includes('\\"domain\\"') || html.includes('\\"child_dealers\\"')) texts.push(unescapeJson(html));
  for (const text of texts) {
    OPEN_RE.lastIndex = 0;
    let m;
    while ((m = OPEN_RE.exec(text))) {
      const id = Number(m[1]);
      const slice = objectSlice(text, m.index);
      if (!slice) continue;
      const rec = {
        id,
        name: unescapeText(m[2]),
        domain: apex(m[3]),
        city: unescapeText(field(slice, "city")),
        state: stateCode(field(slice, "state")),
        zip: (field(slice, "zipcode") ?? "").replace(/\D/g, "").slice(0, 5),
        phone: (field(slice, "sales_phone") ?? "").replace(/\D/g, "").slice(-10),
        address: unescapeText(field(slice, "address_1")),
      };
      // Prefer the copy that names a PUBLIC domain, then the fuller one: a
      // dealer can appear twice in one payload, once addressed by its
      // platform-internal host and once by the domain shoppers use.
      const prev = out.get(id);
      const better =
        !prev ||
        (isPublicDealerDomain(rec.domain) && !isPublicDealerDomain(prev.domain)) ||
        (isPublicDealerDomain(rec.domain) === isPublicDealerDomain(prev.domain) &&
          ((!prev.zip && rec.zip) || (!prev.city && rec.city)));
      if (better) out.set(id, rec);
    }
  }
  return out;
}
