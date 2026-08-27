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
