# US-market EV warranty terms & transferability, by make

Researched 2026-08-10 by background research agents; compiled from primary-source captures
(OEM warranty booklets fetched and text-extracted). Tiers: **verified** = operative
sentence read in the OEM's own document (quotes verbatim); **reported** = secondary
source; **open** = document identified but not read. Control fetches passed before any
negative was recorded. Hyundai/Kia were researched earlier — see ENRICHMENT-SCHEMA.md.

**Headline across makes researched so far: no make shows a Hyundai/Kia-style
original-owner restriction on BATTERY coverage.** The only explicit original-owner
restriction found anywhere is Honda/Acura's — on the rust-perforation warranty.

## Verified rows ready for the database

| Make | Battery coverage | SOH floor | Transfers | Tier notes |
|---|---|---|---|---|
| VW (ID.4/ID.Buzz) | 8 yr / 100k | 70% net capacity, repairs "to a level of at least 70%" | Yes — "automatically transferred without cost" (booklet-level; battery section carries no restriction) | verified, VW EV Warranty booklet 25VWELEWMUSEN |
| Nissan Leaf | defects 8 yr / 100k (all years incl. 2011); capacity: 2014-era 5 yr/60k, 2018+ 8 yr/100k | **"below nine segments" on the in-car gauge — Nissan states no %; do NOT print a percentage** | Yes — "original and subsequent owner(s)"; voided only if sold AND registered abroad within 6 months of first delivery | verified, 2011/2014/2018 booklets |
| Toyota bZ4X/bZ | 8 yr / 100k (battery + transaxle + inverter) | 70% ("Below 70% of original capacity"; ≤30% loss "considered normal") | **Yes — verified**: "Warranty coverage is automatically transferred at no cost to subsequent vehicle owners" (identical in MY23 and MY26 guides) | verified, MY2023 + MY2026 guides read in full |
| Subaru Solterra | 8 yr / 100k (battery + electric drive units) | 70% retention | **Yes — verified**: "Every owner of the vehicle during the warranty period shall be entitled to the benefits of these warranties" | verified, MY2023 BEV booklet (Subaru issues a separate BEV booklet; MY24–26 unverified but reported same) |
| BMW i-cars | 8 yr / 100k (defects, all years) | **Varies by year — see deep-dive**: i3 70% (verified); **MY2022 i4/iX NO capacity floor at all** (verified absence); MY2026 BEVs 70% SoH (verified); MY23–25 unresolved; CPO backfill 75% SoH for MY22–25 certified cars delivered after 2026-03-01 (verified) | Yes — "the first retail purchaser, and each subsequent purchaser" | verified across MY2014/2022/2026 booklets |
| Mercedes EQ | **EQB + CLA EV: 8 yr/100k; EQE/EQS incl. SUVs: 10 yr/155k — verified** | Floors stated in **amp-hours per pack** (e.g. EQE 204 Ah, EQS 192 Ah), not a %; only the eSprinter booklet states 70% explicitly | **Yes — verified**: "to the original and each subsequent owner"; battery coverage conditioned on completed scheduled maintenance | verified, MY25/MY26 EQ + MY24 eSprinter booklets |
| Honda Prologue | 8 yr / 100k HV battery | **75% — verified in Honda's own separate BEV Warranty Basebook** (WL-26690; Honda gives the warranty, not GM). NVLW 3/36. **No separate EV powertrain warranty exists** — dealer claims of one conflict with the booklet | Yes — coverage runs to "the owner or lessee," no original-owner restriction (rust warranty is the sole original-owner-only coverage) | verified, 2025 Honda BEV basebook read in full; Acura ZDX booklet still unlocated (ZDX floor presumed 75%, reported) |
| Jaguar I-PACE | 8 yr / 100k battery; NVLW 5 yr / 60k (no separate powertrain) | **70% — verified**: "shall perform to at least 70% of as-new capacity" | **Yes — verified**: "in favor of the original purchaser and each subsequent owner"; EliteCare (incl. 5yr/60k free maintenance) "fully transferable to subsequent owners" | verified, Passport to Service JJM 18 11 99 192. **Recall chain resolved: MY2019 final remedy is REPURCHASE (H536); MY2020–21 under 26V-067 run a 90% charge cap, final remedy "under development" (Feb 2026)** |

## Reported-only (do not publish as verified)

- **GM (all)**: Bolt-era floor is a hedged "capacity loss greater than 40% may be covered"
  (ambiguous by design); Ultium-era 75% floor corroborated by secondary sources quoting
  current Chevy warranty docs ("below 75% of its original value… as determined by a
  certified dealer") — **the GM booklet itself was not read; the 75% claim in our
  ENRICHMENT-SCHEMA also remains unverified**. Transfer language: not established.
- ~~Ford~~ **Ford — now verified** (deep-dive, MY2021–25 guides all read): battery + EV
  components 8yr/100k, **70% floor** ("less than 70 percent of… beginning of life
  capacity… is considered excessive"; 65% for E-Transit cutaway/chassis-cab).
  **Transfers**: "If you bought a previously owned…electric vehicle, you are eligible
  for any remaining warranty coverages" (every MY guide). Campaign corrections:
  the Lightning battery recall is **23V-168** (not 23V-114, which is Lordstown);
  Mach-E HVBJB family: 22V-412 software → **23V-687 free hardware replacement of the
  HVBJB on 34,762 2021–22 extended-range cars at a 100% estimated defect rate** →
  25V-130 stragglers. A used 2021–22 Mach-E ER's campaign status = whether it has the
  new contactor hardware. BlueCruise: plans VIN-specific and **non-transferable**
  (verified Ford FAQ); one-time purchases reportedly stay with the VIN for a used
  buyer (reported only). Connected services: "available… for a minimum period of
  seven years from your vehicle's new-vehicle warranty start date" — a 2021 car's
  connectivity may expire ~2028 (verified).
- **Nissan Ariya**: booklet unread (nissanusa.com 403s all PDFs); reported 8/100
  defect+capacity, transferable. Note the Nissan researcher caught a text-extraction
  proxy FABRICATING warranty text for a nonexistent URL and discarded that channel —
  never trust r.jina.ai-style extraction without a fabrication control.
- ~~Jaguar~~ — resolved, see verified row above. Remaining Jaguar open: whether an
  approved NACS adapter ever shipped.
- **Acura ZDX booklet**: still unlocated (Honda's BEV basebook found; Acura analog 404s).

## Perks/entitlements on resale

Only one answered: VW's 2021 ID.4 3-year Electrify America unlimited-DC plan is
**non-transferable** (reported). All other makes' charging credits, ADAS subscriptions,
connectivity trials: open.

## VW deep-dive (late-arriving full report — supersedes the VW row above)

All verified against the MY2025 "USA Warranty and Maintenance — Electric models" booklet
(25VWELEWMUSEN, fetched from ownersliterature.vw.com) unless tiered otherwise:

- **Battery 8yr/100k, 70% net-capacity floor, transfers** — verified; battery sits inside
  the HV System Limited Warranty whose clause reads "automatically transferred without
  cost." Repairs restore to ≥70%, not to as-new. NOTE: VW EVs have **no separate
  powertrain warranty** — the HV System warranty is 4yr/50k, same as bumper-to-bumper;
  only the battery gets 8/100.
- **Two verified used-buyer landmines:** (1) commercial use (taxi/delivery/rideshare)
  voids the HV System warranty **permanently — "If a commercial vehicle is sold to a
  subsequent retail owner, this warranty still does not apply."** A rental/rideshare
  history kills the warranty for the next buyer. (2) Export voids US warranties.
- **ID.4 battery recalls (verified via NHTSA): 25V-836, 26V-028 (misaligned cell
  electrodes, fire risk → battery MODULE REPLACEMENT; interim 80% charge limit + no DC
  fast charging) and 26V-030 (overheating → software + replacement as needed).** This is
  Bolt-recall-class material for ID.4 listings: a used ID.4's campaign status determines
  whether it has new modules, and the interim state gimps charging. Also door-handle
  recall 24V-651 (2021–24, doors can open while driving) and service campaigns with
  expiry dates (97HB software, expires 2028-09-28; 97H1, expires 2029-04-30).
- **Charging credits don't transfer — verified for MY2024** from Electrify America's own
  disclosure ("may not be sold, loaned, or otherwise distributed… may not transfer");
  MY2021–22 3-year unlimited plan non-transferable (reported). Car-Net clock runs from
  first sale; Wi-Fi hotspot may be terminated on ownership transfer (TOS §3.4).
- Open: MY2021–24 booklet PDFs (terms believed identical, reported only); ID.Buzz EA
  plan disclosure; MY2026 plans.

## BMW / Mercedes deep-dive (late-arriving full report — supersedes rows above where they conflict)

Structural insight, verified on both sides: **battery warranties transfer in full; every
original-owner restriction lives in the perks layer** (charging credits, subscriptions).

BMW specifics:
- Capacity-floor timeline: i3 always had 70% (verified); **MY2022 i4/iX had NO capacity
  floor — defects only** (verified absence, full booklet read); MY2026 BEVs have a 70%
  SoH floor with "restore to at least 70%" remedy (verified); MY2023–25 booklets
  unobtainable → first year of the floor is open. **BMW Certified MY22–25 EVs delivered
  after 2026-03-01 get an 8yr/100k, 75%-SoH CPO battery coverage** (verified) — a used
  2022 i4 bought as CPO after that date has strictly better battery coverage than it had
  new. That's a purchase-channel fact worth surfacing on i4/iX listings.
- Battery recalls with module/pack replacement: 22V-541 (2022–23 iX/i4, full battery
  replacement), 24V-135 (2024 i4 weld seams), 25V-470 (2022–25, module replacement).
- **MY2025–26 SoH display service action: on-screen battery SoH sticks at 100%
  regardless of actual aging** until the campaign is performed (NHTSA TSB
  MC-11024714-0001) — directly undermines "the car says 100% SoH" as a selling point.
- EA charging bundle: first-owner-only, VIN-locked (verified from EA's disclosure).
  ConnectedDrive included services stay with the car; paid terms ride out their term with
  the vehicle but can't move car-to-car (verified from BMW's terms).

Mercedes specifics:
- **10yr/155k applies to the whole EQE/EQS family including SUVs** (verified); EQB, CLA
  EV, G580: 8/100. Floors are per-pack amp-hour numbers in the booklet, not "70%".
- Battery Coverage is **conditioned on completed scheduled maintenance** (verified) — a
  skipped-service history can void it; worth an ask-the-seller item on EQ listings.
- EQB battery-fire recall **26V-073** (2022–24, Farasis cells): free battery replacement,
  interim 80% charge cap — Bolt-class campaign-status check for used EQBs.
- Drive Pilot is account-paired per owner (no transfer, by mechanics); EA benefit
  non-transferable (reported).

## Priority follow-ups

1. Read the actual GM booklet (Ultium 75% + Bolt 40%-loss hedge + transfer terms) — our
   Bolt warranty rows currently lean on this.
2. Read the located Ford Warranty Guide PDF.
3. Capture Toyota/Subaru transfer sentences (terms verified, transfer open).
4. Resolve Honda's ambiguous "10 yr/150k" HV-battery line (likely CARB states).
5. Jaguar end to end; Nissan Ariya booklet; Mercedes numeric pages; per-make campaign
   extensions (only Hyundai/Kia ICCU is done).
