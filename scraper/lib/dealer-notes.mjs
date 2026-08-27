// The dealer's own notes, read off a VDP that its inventory API would not
// give us.
//
// ── Why a per-VIN page fetch is worth it here ──────────────────────────────
//
// dealer.com's ws-inv-data record — the endpoint that carries ~half our crawl
// — has no free-text field at all. Probed across three rooftops 2026-08-27:
// `attributes` is engine/transmission/stockNumber, plus an equipment list and
// an AutoCheck badge link. The same prose detector finds 124 free-text fields
// on a DealerOn card and 0 there, so the negative is real, not a broken test.
//
// That matters because migration 0024's buyback_disclosed is computed from
// payload->>'description'. With no description, 24,144 used/CPO cars on dealer
// lots cannot be checked for a disclosed manufacturer buyback at all — the
// class of car that, priced under its clean-title cohort, produces the false
// bargain the comps guardrails exist to prevent.
//
// The notes ARE on the VDP, server-rendered, no JavaScript needed: dealer.com
// ships a `ws-dealernotes` widget headed "Dealer Notes". So the fact is
// reachable; it just costs one page per car, once.
//
// ── What is deliberately NOT read ──────────────────────────────────────────
//
// A dealer.com VDP also carries a schema.org description, and it is template
// copy, not the seller's words: "Is this 2023 Polestar 2 your perfect car?
// Contact Gunther Motor Company to see this Thunder Long Range Dual Motor
// Hatchback available for $..." (96-144 chars, same sentence on every car).
// Storing that as `description` would put a machine's sentence on the detail
// page under the dealer's name, and would give trim-suspect.mjs a vocabulary
// built from marketing boilerplate. The widget is the dealer's; the JSON-LD
// summary is dealer.com's. Only the widget is read.
//
// Notes are often an equipment list rather than prose ("Thunder 2023 Polestar
// 2 Long Range Dual Motor AWD 1-Speed Automatic Electric Motor 13 Speakers,
// Alloy wheels, ..."). That is still what the dealer's own page prints under
// "Dealer Notes", so it is honest to carry it — and it is exactly where a
// disclosure appears when there is one.

import { decodeEntities } from "./normalize.mjs";

// The widget, then the first .content block inside it. Matched on
// data-widget-name rather than the class list because the class carries
// per-page state ("ws-dealernotes BLANK") that varies.
const NOTES_WIDGET =
  /data-widget-name="ws-dealernotes"[^>]*>([\s\S]{0,20000}?)<\/div>\s*<\/div>/i;
const CONTENT_BLOCK = /<div[^>]*class="[^"]*\bcontent\b[^"]*"[^>]*>([\s\S]*)/i;

// Same ceiling normalize.mjs applies, so a note stored through either door is
// the same length.
const MAX = 2000;

/**
 * The dealer's notes from a VDP, or undefined.
 *
 * Returns undefined rather than "" for an empty widget: an empty description
 * in the payload would claim the dealer wrote nothing, and payload_public
 * (migration 0042) keys its NULL on the field's absence.
 */
export function extractDealerNotes(html) {
  const widget = String(html ?? "").match(NOTES_WIDGET);
  if (!widget) return undefined;
  const inner = widget[1].match(CONTENT_BLOCK);
  const raw = inner ? inner[1] : widget[1];
  const text = decodeEntities(
    raw
      // Block boundaries become spaces so two paragraphs don't fuse into one
      // word ("...programme.COMES WITH...").
      .replace(/<\/(p|div|li|br|h\d)>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, MAX) : undefined;
}
