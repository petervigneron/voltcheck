// Does a rooftop advertise that it sells manufacturer buybacks?
//
// The detector only. buyback-dealers.mjs does the fetching and the cache;
// this is split out so it can be tested without running a 5,000-domain sweep
// (importing that script starts one — the same reason lib/recheck-price.mjs
// and lib/ford-sticker-trim.mjs exist).
//
// ── What this is FOR, and what it must never be used for ───────────────────
//
// A TARGETING list, not a claim about any car. Nothing here ever sets
// buyback_disclosed, and no listing changes because its dealer matches. The
// site's rule is that a buyback is the SELLER'S OWN STATEMENT ABOUT THAT CAR
// (migration 0024) — a dealer who runs a buyback programme still sells
// ordinary trade-ins alongside it, and flagging their whole lot would be
// exactly the "matching the wrong thing" the house rule forbids.
//
// What it is for: deciding where to spend the per-VIN VDP fetches that read
// each car's own dealer notes. 24,144 used/CPO cars on dealer lots carry no
// description at all, so they cannot be checked; this says which lots first.
//
// ── Measured before building (2026-08-27) ──────────────────────────────────
//
// SPECIFIC but not SENSITIVE, and the split is the point:
//   sneedford.com          4 link hits   (the pile — found)
//   highlineautosales.com  0             (sells lemon-law cars, does not
//   carvision.com          0              advertise it; both already caught
//                                         per-listing, their lanes carry
//                                         descriptions)
//   suntrupfordwest.com, aaronfordofpoway.com, kingsautomall.com,
//   lhmauto.com, dickhannah.com, zeigler.com        0 — six controls, clean
//
// So it finds dealers who BUILD A SECTION around buybacks and misses dealers
// who merely stock a few. That is the right trade for a prioritiser: a false
// positive costs a few wasted VDP fetches, a false negative costs nothing the
// per-VIN pass will not eventually reach anyway.

// A dealer can add a buyback programme, so a negative is re-asked; a positive
// is a standing fact about the business and is kept.
export const RECHECK_DAYS = 60;

// A link whose href or anchor text names the programme. This is the signal
// that separated the pile from six controls.
const LINK_MARKER = /buy[\s-]?back|lemon[\s-]?law|reacquired/i;

// Programme-level prose, for a rooftop that describes it without linking it.
// Every alternative names a PROGRAMME or a manufacturer act — never the bare
// phrase "lemon law", for the fine-print reason in the header.
const BODY_MARKER =
  /(manufacturer|factory)\s+(buy[\s-]?back|repurchase)s?\s*(program|programme|vehicles?)?|lemon[\s-]?law\s+(program|programme|buy[\s-]?back)|reacquired\s+vehicles?/i;

// Two other things dealers call a "buy back", neither of them a manufacturer
// repurchase. Found in the first 1,400 rooftops of the 2026-08-27 sweep:
//   hertzcarsales.com  /hertz-buy-back-guarantee.htm   a return policy — buy
//       the car, bring it back within N days
//   larrygreenchevrolet.com  /lease-buyback.htm        a lease buyout — the
//       customer purchasing the car they already lease
// Both are offers TO the shopper, not a description of the lot's stock, so
// they are excluded rather than left to waste per-VIN fetches.
const NOT_A_REPURCHASE = /guarantee|lease/i;

// The shape that means the opposite of what it matches.
const DENIAL = /\b(not|never|no|don'?t|do not)\b[^.]{0,40}\b(sell|offer|carry|stock)\b[^.]{0,40}(buy[\s-]?back|lemon)/i;

const strip = (html) =>
  html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");

/** Returns {hit, evidence[]} for one page's HTML. Exported for the tests. */
export function readBuybackSignals(html) {
  const clean = strip(String(html ?? ""));
  const text = clean.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  if (DENIAL.test(text)) return { hit: false, evidence: [], denied: true };

  const evidence = [];
  for (const m of clean.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = m[1];
    const label = m[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!LINK_MARKER.test(href) && !LINK_MARKER.test(label)) continue;
    if (NOT_A_REPURCHASE.test(href) || NOT_A_REPURCHASE.test(label)) continue;
    if (evidence.some((e) => e.href === href)) continue;
    evidence.push({ where: "link", href, text: label.slice(0, 80) });
    if (evidence.length >= 4) break;
  }
  const body = text.match(BODY_MARKER);
  if (body && !NOT_A_REPURCHASE.test(body[0])) evidence.push({ where: "text", text: body[0].slice(0, 80) });
  return { hit: evidence.length > 0, evidence };
}
