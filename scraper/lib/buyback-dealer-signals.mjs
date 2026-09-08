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
// A programme URL inside a SCRIPT. victoryfordkc.com (Team Velocity, found
// 2026-09-07 by the owner opening a Lightning whose Carfax says
// "Buyback/Lemon") keeps its "Manufacturer Buyback" menu item in a Vue
// config object — `subMenuLink: "https://www.victoryfordkc.com/manufacturerbuyback"`
// — that the page renders into a nav at load. strip() removes scripts first,
// so the anchor scan above never saw it and the sweep recorded a clean
// negative on 08-27. This reads the raw HTML for a URL path that names the
// programme (buyback / reacquired / lemon-law as a path segment), which is
// as deliberate as a link: nobody routes /manufacturerbuyback by accident.
// The same two exclusions apply (a buy-back guarantee, a lease buyback).
// Verified 2026-09-07: hits victoryfordkc.com, clean on lhmauto.com,
// dickhannah.com, zeigler.com, hertzcarsales.com, larrygreenchevrolet.com.
const PROGRAMME_PATH = /["'](?:https?:\/\/[^"'\s]*)?\/[a-z0-9_-]*(?:buy-?back|reacquired|lemon-?law)[a-z0-9_-]*\/?["']/gi;

// ── Branded-title lots ─────────────────────────────────────────────────────
//
// The same idea for the other disclosure: a dealer whose homepage says its
// inventory is branded-title stock. parklinemotors.com (2026-09-08): "Every
// car in our inventory is handpicked and expertly rebuilt", "Quality
// Inspected branded title cars in Salt Lake City". This produces CANDIDATES
// for registry/branded-title-dealers.json, which is curated by hand, because
// the claim covers a whole lot — a dealer with a "What is a branded title?"
// FAQ page is worth a look, not a flag. Denials ("we never sell branded
// title vehicles", "clean title only") are excluded outright.
const BRANDED_LOT =
  /(every|all( of)?)( our| the)? (car|vehicle|unit)s? (in our inventory |on our lot |we sell )?(is|are|has been|have been)( carefully| expertly| professionally)? (rebuilt|restored|branded)|(branded|rebuilt|salvage)[ -]title (cars|vehicles|inventory|trucks|suvs|dealer|dealership|specialists?|experts?|expertise|lot)|(specializ(e|ing) in|dealer of|home of) (branded|rebuilt|salvage)[ -]title/i;
const BRANDED_DENIAL =
  /\b(not|never|no|don'?t|do not)\b[^.]{0,40}\b(sell|offer|carry|stock)\b[^.]{0,40}(branded|rebuilt|salvage)|clean[ -]title (only|guarantee|vehicles only)|no (branded|rebuilt|salvage)[ -]titles?\b/i;
/** Returns {hit, evidence[]} — a rooftop that presents itself as a branded-title lot. */
export function readBrandedTitleSignals(html) {
  const text = strip(String(html ?? "")).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  if (BRANDED_DENIAL.test(text)) return { hit: false, evidence: [], denied: true };
  const evidence = [];
  for (const m of text.matchAll(new RegExp(BRANDED_LOT.source, "gi"))) {
    const at = Math.max(0, m.index - 40);
    const quote = text.slice(at, m.index + m[0].length + 40).trim();
    if (evidence.some((e) => e.text === quote)) continue;
    evidence.push({ where: "text", text: quote.slice(0, 160) });
    if (evidence.length >= 3) break;
  }
  return { hit: evidence.length > 0, evidence };
}

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
  if (evidence.length === 0) {
    for (const m of String(html ?? "").matchAll(PROGRAMME_PATH)) {
      const href = m[0].slice(1, -1);
      if (NOT_A_REPURCHASE.test(href)) continue;
      if (evidence.some((e) => e.href === href)) continue;
      evidence.push({ where: "script", href, text: "" });
      if (evidence.length >= 4) break;
    }
  }
  const body = text.match(BODY_MARKER);
  if (body && !NOT_A_REPURCHASE.test(body[0])) evidence.push({ where: "text", text: body[0].slice(0, 80) });
  return { hit: evidence.length > 0, evidence };
}
