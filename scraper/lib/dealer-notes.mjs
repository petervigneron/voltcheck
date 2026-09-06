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

import { decodeEntities, dealerWords } from "./normalize.mjs";
import { publishedCondition } from "./condition.mjs";

// The widget, then the first .content block inside it. Matched on
// data-widget-name rather than the class list because the class carries
// per-page state ("ws-dealernotes BLANK") that varies.
const NOTES_WIDGET =
  /data-widget-name="ws-dealernotes"[^>]*>([\s\S]{0,20000}?)<\/div>\s*<\/div>/i;
const CONTENT_BLOCK = /<div[^>]*class="[^"]*\bcontent\b[^"]*"[^>]*>([\s\S]*)/i;

// Same ceiling normalize.mjs applies, so a note stored through either door is
// the same length.
const MAX = 2000;
// ...except that the cap must not be allowed to cut the one sentence the lane
// exists to read. Dealers put the disclosure LAST: aaronfordofpoway.com's
// 2023 Lightning 1FT6W1EV6PWG56603 (2026-09-06) opens with a price pledge,
// lists fifteen options, walks through five paragraphs of feature prose, and
// only then says "This is a Lemon Law Buyback vehicle ... This vehicle was
// repurchased by the manufacturer" — at character ~3,400. A straight
// slice(0, 2000) stored the prose and dropped the disclosure, and 152 of the
// 537 notes in the cache (28%) had hit the cap the same way. So past the cap,
// sentences that use disclosure vocabulary are kept and everything else is
// what gets cut. The net here is deliberately broad — it decides only what
// is STORED; the narrow, audited patterns that set buyback_disclosed live in
// the migrations. Bounded so a note cannot grow without limit.
const DISCLOSURE_WORDS = /\b(buy[\s-]?back|lemon[\s-]?law|reac?quired|repurchased?|branded title)\b/i;
const MAX_KEPT_PAST_CAP = 1000;
const SENTENCES = /[^.!?]+(?:[.!?]+|$)/g;
export function capKeepingDisclosures(text) {
  if (text.length <= MAX) return text;
  const sentences = text.match(SENTENCES) ?? [text];
  let head = "";
  for (const sentence of sentences) {
    if (head.length + sentence.length > MAX) break;
    head += sentence;
  }
  // One run-on block with no sentence ends (an equipment list): cut it where
  // the old rule did.
  if (!head) head = text.slice(0, MAX);
  const kept = [];
  let budget = MAX_KEPT_PAST_CAP;
  for (const sentence of text.slice(head.length).match(SENTENCES) ?? []) {
    if (!DISCLOSURE_WORDS.test(sentence)) continue;
    const t = sentence.trim();
    if (t.length > budget) break;
    kept.push(t);
    budget -= t.length + 1;
  }
  return kept.length ? `${head.trim()} ${kept.join(" ")}` : head.trim();
}

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
  return text ? capKeepingDisclosures(text) : undefined;
}

// ── Which cars the lane reads ──────────────────────────────────────────────
//
// A per-VIN VDP on the seller's own site. An OEM lane's sourceUrl is a maker
// search page and never contains the VIN, which is the cheap way to tell them
// apart without re-deriving each lane's identity here.
const isVdp = (l) =>
  typeof l.sourceUrl === "string" &&
  /^https?:\/\//i.test(l.sourceUrl) &&
  (l.sourceUrl.toUpperCase().includes(String(l.vin ?? "").toUpperCase()) || /\.htm[l]?$/i.test(l.sourceUrl));

/**
 * Whether vdp-notes.mjs should fetch this record's VDP.
 *
 * THE CONDITION IS DERIVED, NOT READ. A raw out/listings.json record carries
 * no `condition` key at all — the published condition comes out of
 * lib/condition.mjs at ingest, mostly from the VDP path (/used/, /certified/).
 * The first cut of this lane tested `l.condition` and so rejected every car
 * as neither used nor certified: every nightly from 2026-08-27 to 09-05 logged
 * "vdp-notes: 0 used/CPO cars with no notes on file, doing 0 this run" and
 * nobody read the line. gm-warranty.mjs survived the same file because it
 * only skips `=== "new"`. The owner found the result on 09-06 by opening a
 * $40,085 Lightning whose dealer notes say "Lemon Law Buyback".
 *
 * A description that is dealer.com's template sentence counts as no
 * description (lib/normalize.mjs dealerWords); a real one from the car's own
 * feed record is kept and the VDP is not fetched.
 *
 * `cached` is the registry entry for this VIN, if any; `refreshCutoff` and
 * `retryCutoff` are YYYY-MM-DD strings — an entry checked on or after the
 * relevant cutoff is fresh enough to skip.
 */
export function needsDealerNotes(l, { platform, cached, refreshCutoff = "", retryCutoff = "" } = {}) {
  const cond = publishedCondition(l);
  if (cond !== "used" && cond !== "certified") return false;
  if (dealerWords(l.description)) return false;
  const vin = String(l.vin ?? "").toUpperCase();
  if (vin.length !== 17 || !isVdp(l)) return false;
  // ws-dealernotes is dealer.com's widget; no other platform's page is read
  // (see vdp-notes.mjs on the DealerOn measurement).
  if (platform !== "dealer.com") return false;
  if (cached) {
    const cutoff = cached.notes ? refreshCutoff : retryCutoff;
    if (String(cached.checkedAt ?? "") >= cutoff) return false;
  }
  return true;
}
