# Used-EV site — handoff to a desktop session

Paste this into a new conversation started **from the desktop app**, and attach
`ENRICHMENT-SCHEMA.md` and `probe.js`.

A note on how to read this. The previous thread began with a handoff document
that presented a chain of my own speculation as settled fact, and it cost hours
before the owner caught it. So: everything below is marked **verified** (checked
against a primary source or a live call), **n=1** (observed once, needs
replication), or **open**. Do not promote anything up a tier without checking.

---

## What the project is

A used-EV shopping site, in the spirit of visor.vin. **It is not a data-moat
play** — an earlier session spent a long time constructing one and the owner
correctly rejected it. The thesis, in his words, is that visor.vin is
(1) consumer-oriented, (2) profitable, and (3) nicer to use and more
comprehensive than the legacy sites — and that a one-person operation doesn't
need to displace Autotrader to be worth building.

Corollary he was explicit about: **do not propose paid per-VIN data.** Ten
dollars a lookup can't sit under a five-dollar-a-week product, and removing that
toll is the point of the site.

The owner knows this market well. When he pushes back on a fact, he has
been right every time so far.

---

## Do this first, now that you have a browser

1. **Confirm the Bolt baseline.** Run 5–10 Bolt VINs through
   `experience.gm.com/ownercenter/recalls`, including at least one you believe
   has an *original* pack. The rule below predicts an untouched car reads
   exactly 100,000 miles on the battery warranty line. Confirming that turns an
   n=1 inference into something shippable.
2. **Test whether the pattern generalises.** GM's owner centre exposes completed
   campaign history publicly with no sign-in. Do Ford, Hyundai, Kia, Toyota and
   the rest have equivalent owner portals that do the same? **This is worth more
   than anything else on the list** — if it generalises, per-VIN service history
   is free across the market and the enrichment layer gets much stronger.
3. **Run `probe.js`** against 40 VINs spread across makes and model years. It
   writes `out/coverage.md`, a make × source × year hit matrix. Untested — expect
   to fix a selector on the GM page.

---

## Verified

**GM owner centre — `experience.gm.com/ownercenter/recalls`.** Public, no
sign-in, VIN only. Returns full campaign history *including completed items with
dates*, plus a warranty block. Angular SPA, so it needs a browser.

**The discriminator is the GM Program number, not the NHTSA number.** One 2017
Bolt VIN showed three different remedies all under NHTSA 21V560:

| GM Program # | Remedy | New pack? |
|---|---|---|
| N212343880 | replace modules | yes |
| N212343881 | replace pack | yes |
| N212343883 | software only | **no** |

"21V560 complete" is therefore meaningless on its own. This is the precision an
earlier research pass wrongly claimed required a dealer printout.

**Hyundai / Kia warranty structure.** Powertrain 10yr/100k is original-owner-only
and drops to 5yr/60k for a second owner. **The HV battery and EV system
10yr/100k transfers in full.** Confirmed in Hyundai's 2026 Owner's Handbook —
the footnote restricting to original owner hangs off the *Powertrain* row only,
and §6 covering EV Direct Energy components carries no owner restriction — and in
Kia's manual: "Any remaining portion of any warranty, except the 120
months/100,000 miles Power Train (Original Owner) warranty, is fully
transferable." Most aggregators state this wrong.

**ICCU.** Hyundai, Genesis and Kia extended ICCU coverage to **15 years /
180,000 miles in April 2026**, up from 10/100. Affects Ioniq 5 2022–24, Ioniq 6,
EV6, EV9, GV60, Electrified GV70 and G80. Four months old, absent from every
listing site. Whether the extension transfers is **undocumented**.

**Window sticker endpoints.** GM `cws.gm.com/vs-cws/vehshop/v2/vehicle/windowsticker?vin=`
returns a PDF whose first line of extracted text is a JSON array of every RPO
code — MY2023 solid, 2022 partial, **0 for 41 on MY2021 and older** (clean
`errorCode 1001`, an availability limit, not a block). Ford
`windowsticker.forddirect.com/windowsticker.pdf?vin=` reaches back to **MY2015**
but is prose only. Stellantis 2017+, Hyundai 2020+ (needs browser headers),
Subaru 2021+. **No endpoint found for Tesla, Rivian, Lucid, Polestar, VW, Kia,
BMW or Volvo** — most of the EV market by model count.

**Bolt DC fast charging** was RPO `CBT`, a $750 option, optional on *both* trims
through MY2020, standard on Premier in 2021, universal from 2022. Visible in any
straight-on charge-port photo: CCS cars show two DC pins behind a hinged flap,
non-CCS cars a plain blank. Not retrofittable. **`CBT` is not a general
fast-charge flag** — 2024 Blazer EV and Equinox EV have DCFC without it.

**vPIC** (`vpic.nhtsa.dot.gov`, free, no key): make/model/year/plant 14/14 on
test VINs; battery kWh only 4/14 and at pattern level, not per-car; no build
date at all; US-market vehicles only.

**Market.** New EV share fell from a record 10.5% to 5.8% after the federal
credit ended 30 Sep 2025 and has sat flat three quarters. Used EVs did 378,140
units in 2025 (+35%), June 2026 +20% YoY, and now sell at a **$3,382 premium**
over comparable gas cars. ~500k lease returns land in 2026, up to 1M in 2027.
The growth is entirely on the used side.

---

## n=1 — replicate before shipping

**Battery warranty arithmetic as a replacement fingerprint.** GM battery
coverage is 8yr/100,000mi from in-service. One 2017 Bolt showed *expires August
29 2030 or 143,026 miles*, giving:

- `expiry − 8 years` → replaced 29 Aug 2022
- `mileage_cap − 100,000` → odometer 43,026 at replacement

The campaign record independently said the pack was replaced 2022-09-05. Seven
days apart. Proposed rule: **`battery_warranty_mileage_cap > 100,000` ⇒ pack
replaced.** A software flash never resets a parts warranty, which is what makes
this work where recall status alone can't.

Use it as a **cross-check**, not the retrieval path — if you're loading the page
anyway, read the campaign date directly. Two independent derivations agreeing is
how you catch a parser breaking silently at scale.

---

## Open

- Does the GM owner centre yield to automation, and is there a JSON XHR behind it?
- Do other OEMs expose completed campaign history the same way? (the big one)
- Toyota, Nissan and Mazda window stickers — never tested, no browser
- Whether Tesla/Rivian/VW/Kia have portals that simply weren't found
- **No consumer-subscription precedent exists in EV shopping.** Monetisation is
  the real risk, not sourcing. EV-only classifieds have a graveyard — EV Universe
  became a newsletter; Find My Electric survives with 1,102 listings and no
  battery data at all.

---

## What the last session got wrong

Worth knowing, because these were expensive:

- **Claimed the Hyundai/Kia battery warranty doesn't transfer.** Conflated it
  with the powertrain warranty. The owner caught it.
- **Claimed completed recall history needs a dealer printout.** It's public.
- **Reported sandbox failures as facts about the world, three times** — no
  browser networking, blocked NHTSA VIN endpoints, GM's model-year floor all got
  reported as "can't be done." Run a control test against a known-good URL before
  ever reporting a negative.
- **Went breadth-first**, sweeping fifteen makes before getting one right end to
  end. Finish one make, then template.
- **Let subagents summarise primary documents on load-bearing facts.** Both bad
  calls above came from that. Where the answer moves money, read the PDF.
