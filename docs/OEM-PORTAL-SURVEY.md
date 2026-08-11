# OEM owner-portal survey — completed campaign history per VIN

Question: which automakers besides GM expose per-VIN **completed** recall/campaign history
publicly? (Open-only lookups are nearly worthless for us — GM's owner centre is the benchmark.)

Researched 2026-08-09 by web research from a sandboxed fetcher. **Evidence tiers per the
project rule:** verified (fetched and read the page/source), reported (secondary source),
open (couldn't load — sandbox was bot-blocked by several automotive CDNs; a control fetch
confirmed the blocks were environmental, so nothing below is a "no" merely because a fetch
failed).

## The headline

- **Mercedes-Benz — verified GM-class.** `mbusa.com/en/recall`, no login. The page's config
  JSON defines result tabs "Safety Recalls", **"Completed Recalls"** (`closedRecalls`),
  "Other Open Campaigns", **"Other Completed Campaigns"**; data back to Jan 1990;
  `hideClosedRecallCampaignsFlag: false`. VIN submit sits behind reCAPTCHA.
- **Hyundai — near-verified.** `autoservice.hyundaiusa.com/campaignhome`, plain
  server-rendered ASP.NET form, history claimed "as far back as 08/20/1986", results
  reportedly grouped Open/Closed. Submit carries reCAPTCHA + antiforgery token.
- **VW / Audi — partial.** `vw.com` / `web.audiusa.com/recall` widget covers "campaigns with
  customer notifications made during the last 15 years" — history, not just open — but
  whether it shows per-VIN *completion status* is unconfirmed.
- **Toyota — open question.** SPA widget over `api.temp.recall.toyota.com` (browser-gated
  JSON API); page wording ambiguous on completed items.
- **Ford, Kia — undetermined** from the sandbox; minutes in a real browser settles each.

## Verified or reported open-only (not useful for history)

Nissan (verified; JSON endpoint exists but open-recalls-only), BMW (verified; completed
items drop out of results), Lucid (verified), Subaru (verified via their KB), Rivian
(verified; no per-VIN lookup at all — static list), Tesla (reported), Stellantis/Mopar
(reported), Volvo (open; tool titled "Open Recall Status"), Polestar (likely open-only;
tiny recall universe anyway).

## Full table

| OEM | Portal | Sign-in | Completed history? | Tech | Tier |
|---|---|---|---|---|---|
| GM | experience.gm.com/ownercenter/recalls | No | Yes, with dates + warranty block | Angular SPA | baseline |
| Mercedes | mbusa.com/en/recall | No (reCAPTCHA) | **Yes** — completed recalls & campaigns, to 1990 | AEM + JS, JSON configs | verified |
| Hyundai | autoservice.hyundaiusa.com/campaignhome | No (reCAPTCHA) | Likely yes — Open/Closed grouping, to 1986 | Plain ASP.NET form | verified portal / reported grouping |
| VW | vw.com …/recalls.html | No | Partial — 15-yr campaign history; per-VIN completion unconfirmed | JS widget | verified wording |
| Audi | web.audiusa.com/recall/ | No | Same tool as VW | JS widget | reported |
| Toyota | toyota.com/recall | No | Unconfirmed | SPA; api.temp.recall.toyota.com | verified page; open on crux |
| Ford | ford.com/support/recalls | No | Likely open-only in public tool; owner-account view may differ | likely SPA | reported |
| Kia | owners.kia.com/us/en/recalls.html | Unclear | Unknown | JS shell | open |
| Nissan | nissanusa.com/recalls-vin.html | No | No — open-only | AEM + JSON XHR | verified |
| BMW | my.bmwusa.com/safety-and-emission-recalls | No | No — open-only, ~30-day lag | form page | verified |
| Volvo | recalls-us.volvocars.biz | ? | Likely no ("Open Recall Status") | ? | open |
| Polestar | polestar.com/us/support/recall-information/ | No | Likely open-only | server-rendered form | verified portal |
| Rivian | rivian.com/support/recall-information | n/a | No per-VIN lookup at all | static page | verified |
| Tesla | service.tesla.com/vin-recall-search | No | Reported open-only | SPA | reported |
| Lucid | lucidmotors.com/recalls | No | No — "active" recalls only | form page | verified |
| Subaru | subaru.com/recalls.html | No | No — outstanding items only | AEM/JS | verified |
| Stellantis | recalls.mopar.com | No | Reported open-only | ? | reported |

## Follow-up priority (real-browser, manual VIN entry)

1. Mercedes — confirm tabs with a real VIN; capture the XHR endpoint.
2. Hyundai — confirm Open/Closed grouping with a real VIN.
3. VW/Audi — does the 15-yr history carry per-VIN completion status?
4. Toyota — do remedied campaigns appear? Sniff the API request shape.
5. Ford, Kia — quick determinations.

## Posture note (applies before building ingest on any of these)

Mercedes and Hyundai both gate VIN submission behind reCAPTCHA. Per the project's own rule
(schema doc, "A note on how these were tested"): a source that only yields past a bot control
is a signal about fragility and posture, not just an engineering cost — and CAPTCHA-defeating
automation is off the table entirely. Manual verification with real VINs is fine; scaled
ingest from these two would need a different footing (partnership, licensed feed, or user-
initiated lookups from their own browser).

Raw captured HTML (session scratchpad, temporary): toyota.html, nissan.html, mbusa.html,
rivian.html, hyundai_form.html.
