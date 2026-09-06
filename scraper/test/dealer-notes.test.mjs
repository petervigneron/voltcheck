import test from "node:test";
import assert from "node:assert/strict";
import { extractDealerNotes } from "../lib/dealer-notes.mjs";

// The widget as dealer.com serves it, verbatim in shape from
// gunthermotorcompany.com 2026-08-27. The class list carries per-page state
// ("BLANK"), which is why the match is on data-widget-name.
const vdp = (inner) => `
<div class="row"><div id="dealernotes1-app-root" class="ddc-content ws-dealernotes BLANK"
     data-widget-name="ws-dealernotes" data-widget-id="dealernotes1" data-reactroot="">
  <h3 class="widget-heading h2">Dealer Notes</h3><div class="content">${inner}</div>
</div></div>`;

test("reads the dealer's notes out of the widget", () => {
  const html = vdp("Thunder 2023 Polestar 2 Long Range Dual Motor AWD 13 Speakers, Alloy wheels.");
  assert.equal(
    extractDealerNotes(html),
    "Thunder 2023 Polestar 2 Long Range Dual Motor AWD 13 Speakers, Alloy wheels.",
  );
});

test("a disclosure in the notes survives intact", () => {
  // The whole point of the lane: this sentence is what buyback_disclosed reads.
  const notes = extractDealerNotes(
    vdp("<p>ORIGINAL MSRP $88,224.</p><p>PART OF FORDS REACQUIRED VEHICLE BRANDED PROGRAM.</p>"),
  );
  assert.match(notes, /reacquired vehicle branded program/i);
  // Block boundaries become spaces, so the two paragraphs do not fuse into
  // "$88,224.PART" — which would break a sentence-bounded pattern.
  assert.match(notes, /\$88,224\. PART OF/);
});

test("entities are decoded, markup is not carried into the payload", () => {
  const notes = extractDealerNotes(vdp('20&quot; wheels &amp; a <strong>heated</strong> wheel<br>Nice.'));
  assert.equal(notes, '20" wheels & a heated wheel Nice.');
});

test("no widget, or an empty one, is undefined and not an empty string", () => {
  // An empty description would claim the dealer wrote nothing, and
  // payload_public (migration 0042) keys its NULL on the field being absent.
  assert.equal(extractDealerNotes("<html><body>no notes here</body></html>"), undefined);
  assert.equal(extractDealerNotes(vdp("   ")), undefined);
  assert.equal(extractDealerNotes(""), undefined);
  assert.equal(extractDealerNotes(undefined), undefined);
});

test("the page's schema.org description is never mistaken for the notes", () => {
  // dealer.com puts template copy in JSON-LD — the same sentence on every car.
  // Storing it would print a machine's words under the dealer's name.
  const html = `<script type="application/ld+json">{"@type":"Vehicle",
    "description":"Is this 2023 Polestar 2 your perfect car? Contact Gunther Motor Company to see this one."}
    </script><body>no dealer notes widget on this page</body>`;
  assert.equal(extractDealerNotes(html), undefined);
});

test("notes are capped at the same 2,000 chars normalize.mjs applies", () => {
  assert.equal(extractDealerNotes(vdp("x".repeat(5000))).length, 2000);
});

// ── 2026-09-06: the three ways 1FT6W1EV6PWG56603 stayed invisible ───────────
import { needsDealerNotes, capKeepingDisclosures } from "../lib/dealer-notes.mjs";
import { isTemplateDescription, dealerWords } from "../lib/normalize.mjs";

const truck = {
  vin: "1FT6W1EV6PWG56603",
  sourceUrl: "https://www.aaronfordofpoway.com/used/Ford/2023-Ford-F-150-Lightning-3ff77bb2ac183ebb689d7c6d24fa75cf.htm",
  dealerDomain: "aaronfordofpoway.com",
};

test("a raw crawl record has no condition field; the VDP path says it is used", () => {
  // out/listings.json records carry no `condition` key — it is derived at
  // ingest. Testing l.condition selected 0 cars on every nightly Aug 27–Sep 5.
  assert.equal(needsDealerNotes(truck, { platform: "dealer.com" }), true);
  assert.equal(
    needsDealerNotes({ ...truck, sourceUrl: truck.sourceUrl.replace("/used/", "/new/") }, { platform: "dealer.com" }),
    false,
  );
  // Only dealer.com pages carry the widget this lane reads.
  assert.equal(needsDealerNotes(truck, { platform: "dealeron" }), false);
  assert.equal(needsDealerNotes(truck, { platform: undefined }), false);
});

test("dealer.com's template sentence is not a description and does not stop the fetch", () => {
  const template =
    "Is this 2023 Ford F-150 Lightning your perfect car? Contact Aaron Ford of Poway to see this Avalanche XLT Truck available for $40085";
  assert.equal(isTemplateDescription(template), true);
  assert.equal(dealerWords(template), undefined);
  assert.equal(needsDealerNotes({ ...truck, description: template }, { platform: "dealer.com" }), true);
  // A person's words are kept and the page is not fetched.
  const real = "PART OF FORDS REACQUIRED VEHICLE BRANDED PROGRAM.";
  assert.equal(isTemplateDescription(real), false);
  assert.equal(dealerWords(real), real);
  assert.equal(needsDealerNotes({ ...truck, description: real }, { platform: "dealer.com" }), false);
  assert.equal(dealerWords(""), undefined);
  assert.equal(dealerWords("   "), undefined);
});

test("a fresh cache entry skips the car; a stale one does not", () => {
  const opts = { platform: "dealer.com", refreshCutoff: "2026-08-07", retryCutoff: "2026-08-23" };
  assert.equal(needsDealerNotes(truck, { ...opts, cached: { notes: "x", checkedAt: "2026-08-27" } }), false);
  assert.equal(needsDealerNotes(truck, { ...opts, cached: { notes: "x", checkedAt: "2026-08-01" } }), true);
  assert.equal(needsDealerNotes(truck, { ...opts, cached: { checkedAt: "2026-08-27" } }), false);
  assert.equal(needsDealerNotes(truck, { ...opts, cached: { checkedAt: "2026-08-20" } }), true);
});

test("a disclosure written after 2,000 characters of feature prose survives the cap", () => {
  // The Poway truck's notes: price pledge, options, five paragraphs, and the
  // disclosure last, at character ~3,400. slice(0, 2000) dropped it.
  const filler = Array.from({ length: 30 }, (_, i) => `Feature paragraph ${i} describes the truck's capability in some detail. `).join("");
  assert.ok(filler.length > 2000);
  const notes = extractDealerNotes(
    vdp(`${filler}This is a Lemon Law Buyback vehicle. No hidden fees. This vehicle was repurchased by the manufacturer and is offered at a discounted price.`),
  );
  assert.match(notes, /lemon law buyback/i);
  assert.match(notes, /repurchased by the manufacturer/i);
  // Everything else past the cap is what gets cut.
  assert.doesNotMatch(notes, /No hidden fees/);
  assert.ok(notes.length <= 3000, `length ${notes.length}`);
  // The head is cut at a sentence end, not mid-word.
  assert.match(notes.slice(0, 2000), /detail\. This is a Lemon|detail\. Feature/);
});

test("the cap still holds where nothing past it is a disclosure", () => {
  const filler = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about the seats. `).join("");
  const capped = capKeepingDisclosures(filler);
  assert.ok(capped.length <= 2000 && capped.length > 1900, `length ${capped.length}`);
  assert.equal(capKeepingDisclosures("short note."), "short note.");
});
