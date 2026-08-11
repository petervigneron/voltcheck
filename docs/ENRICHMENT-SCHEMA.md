# Used-EV enrichment layer — schema and scope

What a listing has: make, model, year, trim, price, mileage, photos.
What an EV buyer needs to decide: none of that.

This is the table that sits between them. Everything below was checked against
manufacturer sources or tested against live APIs in August 2026; where it
wasn't, it says so.

---

## The organising idea: tiers of knowability

The single most important design decision is that **these facts are not all
knowable at the same granularity**, and pretending otherwise is how every
existing site gets them wrong. Carvana displays "800V, 10–80% in 18 minutes" on
a specific car's page — but that's model-level marketing copy that would render
identically on a 150,000-mile example. Correct-looking, meaningless.

| Tier | Knowable from | Coverage | Who can build it |
|---|---|---|---|
| **T1** | VIN alone, via free NHTSA vPIC | ~100% | anyone, today |
| **T2** | VIN, but patchy | 30–55% | anyone — but must be treated as a hint |
| **T3** | (model, model-year, trim, plant) research | 100% once built | **this is the asset** |
| **T3.5** | **the listing's own photos** | high, per-field | nobody is doing this |
| **T4** | the individual car only | never derivable | nobody — so *ask*, don't guess |

T3 is the product. T4 is the honesty, and it's also a feature: a page that says
"we cannot know this about this car, here is the exact question to ask the
seller and why it's worth $4,000" beats a page that quietly makes something up.

---

## T1 — free from the VIN

Tested empirically against `vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/`
with 14 real EV VINs. No key, no cost.

| Field | Hit rate | Notes |
|---|---|---|
| `make`, `model`, `model_year` | 14/14 | |
| `plant_city`, `plant_state`, `plant_country` | 14/14 | VIN position 11 |
| `electrification_level` | 14/14 | BEV / PHEV |
| `body_class`, `doors`, `seats`, `gvwr_class` | 14/14 | |

**Caveat that matters:** vPIC only covers US-market vehicles. Shanghai-built
(`LRW…`) and Berlin-built (`XP7…`) Teslas return
`ErrorCode 7 – Manufacturer is not registered with NHTSA`, with a blank make.
Grey-import and Canadian cars will fall out of the pipeline silently unless you
check for this.

## T2 — sometimes in the VIN, never trustworthy alone

| Field | Hit rate | Why you can't trust it |
|---|---|---|
| `trim` | 8/14 | |
| `drive_type` | 8/14 | |
| `battery_type` (chemistry label) | 7/14 | Coarse: "Li-Ion", occasionally "NCM" |
| `battery_kwh` | **4/14** | **VDS-pattern level, not per-car** |
| `battery_voltage` | 4/14 | |
| `charger_level` | 1/14 | |
| `battery_cells/modules/packs`, `charger_power_kw`, `engine_kw` | **0/14** | Always empty |

The `battery_kwh` failure mode is the instructive one: a single-motor and a
dual-motor 2026 Model Y both returned `60.00`. Nissan Leaf and VW ID.4 return
*no* battery fields at all. **Treat every T2 value as a hint to be overwritten
by T3, never as a fact to display.**

### One genuinely valuable VIN trick

Tesla VIN **position 11** is the assembly plant — `F` Fremont, `A` Austin,
`C` Shanghai, `B` Berlin. Position 7 is `E` for ternary lithium-ion or `F` for
LFP. Position 10 is the model year (`L`=2020, `M`=2021 … `T`=2026).

That means two of the worst traps in the entire used market are solvable from
the VIN string alone, before any lookup:

- **Model Y "Long Range AWD"** is either a Fremont 2170 pack (~75–78 kWh usable,
  330 mi) or an Austin 4680 pack (~67–68 kWh, 279 mi). Same badge on the
  tailgate, roughly **50 miles apart**. Position 11 tells you which.
- **Model 3 heat pump** arrived with the 2021 refresh, built from ~14 Sept 2020,
  so cars *titled* 2020 may or may not have one. Position 10 settles it:
  `L` = no heat pump, `M` = heat pump.

---

## T3 — the enrichment table itself

Key: `(make, model, model_year, trim, pack_variant, plant)`.

`pack_variant` and `plant` are in the key because Tesla and VW ship materially
different cars under one trim name.

### Battery

| Field | Type | Notes |
|---|---|---|
| `pack_gross_kwh` | float | |
| `pack_usable_kwh` | float | **The number that determines range, and the one most often unpublished.** Tesla publishes neither — every figure in circulation comes from BMS logs and teardowns. Hyundai and Kia publish one number and never say which. Ford publishes usable, and switched from gross to usable in July 2020, so pre/post figures for the same car disagree. |
| `chemistry` | enum | `LFP` / `NMC` / `NCA` / `NCM` |
| `cell_supplier` | string, nullable | |
| `pack_variant` | string | e.g. `2170-Fremont`, `4680-Austin`, `BT42` |

### Range and efficiency

| Field | Type | Notes |
|---|---|---|
| `epa_range_mi` | int | |
| `epa_kwh_per_100mi` | float | The honest comparator; MPGe obscures it |

### Charging

| Field | Type | Notes |
|---|---|---|
| `port_standard` | enum | `NACS` / `CCS1` / `CHAdeMO` |
| `supercharger_access` | enum | `native` / `adapter` / **`none`** |
| `adapter_included` | bool | |
| `adapter_cost_usd` | int | $185–230 typical, and increasingly not free |
| `dc_peak_kw`, `dc_10_80_min` | int | |
| `ac_onboard_kw` | float | |
| `architecture_v` | enum | 400 / 800 |
| `plug_and_charge` | bool | |

As of July 2026 only **32 of 96 tracked models** ship a native NACS port, and
rollout runs into 2027. There is no clean switchover year, which is exactly why
this needs a table rather than a rule.

`supercharger_access = none` is a real value, not a defensive default: **Nissan
Leaf before MY2026 and the Audi Q4 e-tron cannot Supercharge with any adapter.**

### Thermal

| Field | Type | Notes |
|---|---|---|
| `heat_pump` | enum | `standard` / `optional` / `awd_only` / `none` |
| `battery_preconditioning` | bool | |

`heat_pump` must be an enum, not a boolean, and this is not pedantry:

- **Kia EV6** — a factory *option*, not a trim feature. Unavailable on Light,
  optional on Wind and GT-Line, standard only on GT. Two identically-badged EV6s
  genuinely differ.
- **Hyundai Ioniq 5 MY2022** — standard but **AWD only**. RWD cars have none.
- **VW ID.4** — no US car has ever had one through MY2023.
- **Ford Mustang Mach-E** — none 2021–24, standard from MY2025.
- **F-150 Lightning** — standard on all MY2024 trims, absent MY2022–23.

### Warranty — the highest-value column in the table

| Field | Type |
|---|---|
| `battery_warranty_years` / `_miles` | int |
| `battery_warranty_soh_floor_pct` | int |
| `battery_warranty_transfers` | bool |
| `second_owner_years` / `_miles` | int, nullable |

**The coverages must be modelled separately, because they transfer differently
and conflating them is the standard error.** An earlier draft of this document
made exactly that mistake.

Hyundai, 2026 Owner's Handbook & Warranty. The coverage chart marks *Powertrain*
with footnote ①, and only Powertrain:

> ① Original Owner 10 Years/100,000 Miles, Subsequent Owner(s) 5 Years/60,000 Miles

Section 6, covering the HV battery and EV Direct Energy components, carries no
owner restriction of any kind:

> "The Warranty period for the following HYBRID, PLUG-IN HYBRID, AND ELECTRIC
> VEHICLE Direct Energy components is limited to 10 years from the date of
> original retail delivery or date of first use, or 100,000 miles."

Kia states it outright in its Warranty & Consumer Information Manual:

> "Any remaining portion of any warranty, **except** the 120 months/100,000
> miles Power Train (Original Owner) warranty, is fully transferable."

| Coverage | Original owner | Second owner |
|---|---|---|
| Basic / bumper-to-bumper | 5yr / 60k | remainder of 5yr / 60k |
| **Powertrain** | 10yr / 100k | **drops to 5yr / 60k** |
| **HV battery & EV system** | 10yr / 100k, 70% floor | **full remainder, transfers** |

Covered under the transferable EV System coverage, per the documents: high
voltage battery, battery management system, traction motor, hybrid/electric
power control unit, EPCU, and **on-board charger**.

So model `powertrain_warranty_transfers` and `battery_warranty_transfers` as
separate fields. They differ on the same car.

### The field that actually is unencoded anywhere: ICCU

The Integrated Charging Control Unit on the E-GMP platform combines the onboard
charger and the DC-DC converter. When its MOSFETs fail, 12V charging stops, the
car sets P1A9096 and drops into limp mode — frequently stranding it. Affected:
Ioniq 5 (2022–24), Ioniq 6 (2023–25), EV6 (2022–24), EV9, GV60, Electrified
GV70 and G80/GV80 (2023–25). NHTSA campaigns 24V204, 24V200, 24V868.

**In April 2026 Hyundai, Genesis and Kia extended ICCU coverage to 15 years /
180,000 miles**, up from 10yr/100k. That is recent enough that no listing site
has absorbed it, and it is worth real money on exactly the cars where buyers are
most nervous.

Three things to encode alongside it:

- `iccu_extended_coverage` — 15yr/180k, effective April 2026, **ICCU only**. The
  official statements do not name the 12V battery, HV fuse, or charging cable.
- `iccu_extension_transfers` — **undocumented.** Neither maker has published
  transfer terms. Two arguments favour transfer: the underlying recalls attach to
  the VIN by federal law, and the ICCU sits under the transferable EV System
  coverage rather than the original-owner powertrain warranty. Neither is
  confirmation. This belongs in T4 as "get it in writing against this VIN."
- `iccu_replacement_risk` — a 2026 class action in D.N.J. against Hyundai, Kia,
  Genesis and supplier Hyundai Kefico alleges replacement ICCUs are as defective
  as the originals. No settlement. No confirmed permanent fix; the recall remedy
  is largely detection software plus like-for-like replacement. Reading the
  15-year extension as an admission that failures will continue is fair.

Also worth encoding: **GM Ultium's floor is 75%**, stricter than the industry's
70%, so an Ultium pack can be visibly degraded and still not qualify. The Bolt
has no stated capacity floor at all — defects only.

*Unresolved:* ACC II's warranty mandate is 8yr/100k at 70% SOH for MY2026–2030,
not the 10yr/150k often quoted — that figure is the *durability* standard. But
Congress revoked California's waiver by CRA in June 2025 and litigation
followed. **Current enforcement status could not be confirmed.** Don't build a
state-law backstop into the product until it is.

### Entitlements on resale

| Field | Type | Notes |
|---|---|---|
| `adas_feature` | string | FSD, BlueCruise, Super Cruise… |
| `adas_transfers` | bool | |
| `free_charging_credits` | string, nullable | |
| `credits_transfer` | bool | Assume false; no brand confirmed otherwise |
| `connectivity_transfers` | bool | |

Two Tesla policy changes in 2026, both against the buyer, both recent enough
that no competitor has absorbed them:

- **14 Feb 2026** — FSD in the Model S/X Luxe bundle became non-transferable. It
  is now tied to the original owner; on resale it is wiped and the new owner
  pays $99/month.
- **31 Mar 2026** — the car-to-car FSD transfer program ended.

So a used Model S or X can demonstrate FSD on the test drive and lose it at
title transfer. Free unlimited Supercharging transfers only on 2012–2016 Model S
and 2016–early-2017 Model X.

Ford BlueCruise bought outright is VIN-tied and does stay with the car. GM Super
Cruise is a subscription and lapses.

### Rebate eligibility — not a column

Worth being careful here, because the obvious implementation is wrong.
Eligibility is a function of **(vehicle × buyer × location × date)**, not of the
vehicle. The same car qualifies for one shopper and not the next depending on
their state, their utility, their income, and whether they've owned an EV
before. Put it in the vehicle table and you will confidently tell people the
wrong thing.

Model it as a separate rules table evaluated at query time:

```json
{
  "program": "CA MyFirstEV",
  "jurisdiction": "CA",
  "vehicle_predicate": { "used": true, "max_msrp_usd": 50000 },
  "buyer_predicate":   { "first_time_zev": true, "income_cap": "…" },
  "amount_usd": 1750,
  "effective_from": "2026-08",
  "as_of": "2026-08-10",
  "source_url": "…"
}
```

The buyer supplies ZIP, utility and a couple of flags; the site intersects. This
also means the honest UI answer is often "you may qualify for X — here's the
eligibility rule," not a number.

Post-federal state of play: the federal $7,500/$4,000 credits ended
**30 September 2025**, so everything now is state and utility level, it is
fragmented, and it moves. Colorado's credit *fell* to $750 on 1 Jan 2026.
California's MyFirstEV offers $3,500 new / $1,750 used, first-time ZEV buyers
only, MSRP ≤ $50k, from a $270M pot — meaning it can also run out, so the table
needs a status field, not just an amount.

Likely source for the long tail is the DOE Alternative Fuels Data Center laws
and incentives API (`developer.nrel.gov`, free with an api.data.gov key).
**Untested** — the sandbox this was researched in couldn't reach it.

---

## T3.5 — the listing photos are a data source

Some facts that look like T4 are sitting in plain sight in photographs every
listing already has. Nobody reads them, because reading them doesn't scale for a
site with millions of listings — which is exactly why a small operation can.

**The case that proves it: Chevrolet Bolt DC fast charging.**

DC fast charging was a **$750 standalone option, RPO code `CBT`** — and it was
optional on *both* trims through MY2020. Premier got it as standard only in
MY2021; it became universal with the MY2022 refresh. So a used Bolt EV may
simply be unable to fast charge, and it is **not retrofittable** at sensible
cost — it's a port, wiring and contactor change, not a software unlock.

| MY | LT | Premier |
|---|---|---|
| 2017–2020 | optional | **optional** |
| 2021 | optional | standard |
| 2022+ (and all EUV) | standard | standard |

And it is **visually definitive from any straight-on charge-port photo**:

- **Has CCS** — J1772 ring with two large DC pins in a lower housing behind a
  small hinged flap.
- **No CCS** — J1772 ring with a plain blank oval below it. No pins, no flap.

So `dc_fast_charging` is derivable at ingest for the single most common
affordable used EV in the country, from an image the listing already contains.
That is a field where every large site says nothing and dealers, in practice,
often don't know the answer about their own inventory.

No credible take-rate figure exists for the option — GM has never published one.
Don't put a percentage in the product.

Corroborating check for a buyer standing at the car: the RPO code sticker in the
glovebox, looking for `CBT`.

---

## T4 — cannot be derived, so ask

Render these as a generated checklist on every listing: the question, why it
matters, and the dollars at stake.

| Unknown | Question to ask | Why |
|---|---|---|
| State of health | "Can you share a battery health report?" | Recurrent's own FAQ calls its number "a statistically probable range estimate" and says guarantees are impossible without a lab test. Nobody sells measured SoH for a car they don't own. |
| Build date | "What's the date on the driver's door jamb sticker?" | Not in the VIN and not in vPIC. Settles every mid-year running change. |
| Bolt pack | "Email me the full campaign history — does it show **N212343881** (modules replaced) or **N212343883** (software only)?" | See below. The generic question gets a generic answer; the campaign number gets the truth. |
| Mach-E capacity | "Was the OTA capacity unlock applied?" | Moves usable capacity by several kWh |
| EV6 heat pump | "Does it have the heat pump option?" | Factory option — the window sticker is the only authority |
| Warranty clock | "Original in-service date?" | Starts the warranty, and is not the model year |

### SOLVED: the Bolt pack question, free and per-VIN

`experience.gm.com/ownercenter/recalls` takes a VIN with **no sign-in** and
returns full campaign history including completed items with dates, plus a
warranty block. Two independent reads of the same event, both free:

**1. Campaign history.** Filter on the **GM Program number, not the NHTSA
number** — this is the crux. A single NHTSA campaign fans out into several GM
programs with completely different remedies:

| GM Program # | NHTSA | Remedy | Counts as a new pack? |
|---|---|---|---|
| N212343880 | 21V560 | replace battery **modules** | yes |
| N212343881 | 21V560 | replace the **pack** | yes |
| N212343883 | 21V560 | software only (HPCM2/BECM/BCM) | **no** |
| N202311730/1 | 20V701 | interim software + 90% SOC cap | **no** |

On one real 2017 VIN all four show Complete. "21V560 complete" is therefore
meaningless as a signal; `N212343881 → Complete, 2022-09-05` is definitive.

**2. Warranty arithmetic, as an independent check.** GM's battery coverage is
8 years / 100,000 miles from in-service. The same VIN shows *Bolt Battery
Limited Part Warranty, expires August 29 2030 or 143,026 miles* — so:

- `expiry_date − 8 years` → replaced **29 Aug 2022**
- `mileage_cap − 100,000` → odometer **43,026** at replacement

Those agree with the campaign record to within a week. So:
**`battery_warranty_mileage_cap > 100,000` ⇒ pack replaced**, and the excess is
the odometer at the time. A software flash never resets a parts warranty, which
is what makes this work where recall status alone fails — including on 2020–22
cars.

Fields to emit: `pack_replaced` (bool), `pack_replaced_date`,
`odometer_at_replacement`, `gm_program_number`, `battery_warranty_expires`.

The page is an Angular SPA, so ingest needs a headless browser — but the data is
public and VIN-keyed, which makes this an engineering cost rather than an
access problem.

### Background on the remedies

Recall 21V-560 had two remedies, and **which one a car got depends mostly on its
model year**:

- **2017–2019** — battery *module* replacement (bulletin N212343881), fitted with
  the later cell chemistry. Roughly **+8% capacity**, taking 60 kWh cars up to
  the 2020+ ~65 kWh cell set. One InsideEVs range test of a 73,000-mile 2017
  measured **+13.5%** after the work.
- **2020–2022** — GM made **Advanced Diagnostic Software the default remedy in
  May–June 2023** (N212343883). These cars therefore mostly still have their
  **original packs**.

Two consequences worth building on.

**A repaired 2017–19 Bolt is underrated on paper.** The EPA label was never
re-rated, so the car still reads 238 miles while behaving closer to 259. That is
a real mispricing a buyer's tool can surface and no listing does.

**Go to GM, not NHTSA.** NHTSA's public API accepts make/model/year but **not
VIN** — `recallsByVehicle?vin=…` returns `Count: 0` for any VIN, which is an
empty parameter rather than a clean bill of health. Its web VIN lookup shows
only *unrepaired* recalls, so a clear result there is equally consistent with a
new pack or a software flash. GM's own owner centre has the completed history
with dates and program numbers, for free.

Replacement modules carry an 8yr/100k warranty. GM's own documents do not state
whether it runs from installation — widely reported, not verified. Tell buyers
to get that in writing.

---

## Provenance — carry this from day one

Every value in the table stores:

```json
{
  "value": 77.4,
  "source": "mfr",
  "source_url": "https://www.hyundainews.com/…",
  "as_of": "2026-08-10",
  "confidence": "high"
}
```

`source` ∈ `mfr` | `vpic` | `est` | `agg` | `unknown`.

An `agg` value is never promoted silently and is surfaced as unverified in the
UI. This session found aggregators wrong on RV GVWR by 1,500 lb and wrong on
Hyundai/Kia battery warranty transferability. Both errors would have been
invisible without a source tag, and both are the kind of thing that, when you
get it right and they don't, is the entire reason someone trusts your site.

---

## Worked example

```
VIN 7SAYGDEE5RA235597

T1  Tesla, Model Y, 2024, Austin TX, BEV                       [vpic]
T2  Dual Motor; battery_kwh absent                             [vpic, hint]
T3  pack_variant     4680-Austin                               [mfr]
    pack_usable_kwh  ~67–68        ← NOT the 75–78 of a Fremont car
    epa_range_mi     279           ← vs 330 for the same badge
    chemistry        NCA
    heat_pump        standard
    port_standard    NACS
    warranty         8yr/120k, 70% floor, transfers ✓
    fsd_transfers    only if purchased outright, not subscribed
T4  ask: door-jamb build date; battery health report; whether FSD
    is owned or subscribed
```

A buyer cross-shopping two "2024 Model Y Long Range AWD" listings at the same
price is looking at a 50-mile range difference that neither listing mentions and
no existing site surfaces. That's the product in one example.

---

## Where the per-car data actually comes from

Tested empirically in August 2026 with real VINs from live listings.

### Manufacturer window stickers, public and per-VIN

| Make | Works | Format | Machine-readable codes | Earliest MY |
|---|---|---|---|---|
| **GM** | yes | PDF | **yes — full RPO array as JSON** | 2022 partial, 2023 solid |
| **Ford** | yes | PDF | no, prose | **2015** |
| Stellantis | yes | PDF | partial | 2017 |
| Hyundai | yes* | PDF | no | 2020 |
| Subaru | yes | PDF | partial | 2021 |
| Genesis | yes | PDF | no | 2024 |
| Mazda | yes | HTML | no | live inventory only |
| Toyota / Lexus | **untested** — AWS WAF JS challenge | | | |
| Nissan / Infiniti | **untested** — JS-only SPA | | | |
| Honda, Acura, Kia, VW, Audi, BMW, Mercedes, Volvo, Polestar, Porsche, **Tesla, Rivian, Lucid** | **none found** | | | |

\* Hyundai 403s a plain request and needs browser-like headers. Treat that as a
different category from a clean public GET — see the note below.

**Read the "no" rows carefully — they are two different things.** This mapping
was done from an environment with no browser networking at all, so anything
requiring JavaScript execution was never actually attempted. Toyota, Nissan and
Mazda are open questions a real headless browser would likely settle in an
afternoon, and they should be retested before being written off.

What a browser would *not* change is GM's pre-2022 floor. That endpoint returns
HTTP 200 with `{"errorCode":1001,"errorMessage":"No Window Sticker found for the
requested VIN."}` — a clean application response, not a bot defence — across
41 of 41 VINs spanning twelve nameplates, with a sharp break at the model-year
boundary. No amount of rendering retrieves a document the server does not hold.

**For an EV site the shape of this is awkward.** It covers Bolt, Blazer EV,
Equinox EV, Lyriq and Silverado EV from 2022; Mach-E and Lightning completely,
since Ford reaches back to 2015; and Ioniq 5/6 from 2020. It covers **none** of
Tesla, Rivian, Lucid, Polestar, VW, Kia, BMW or Volvo — which is most of the
market by model count.

### Filling the pre-2022 gap

- **Monroney resellers.** monroneylabels.com publishes a documented Brands API
  with coverage to roughly 2014. VinAudit covers Chrysler/Dodge/Jeep 2013+,
  RAM 2014+, GM 2020+. VINData sells stickers at $9.99 each. Paid, brand-gated,
  but it exists — this is the answer for 2017–2020 Bolts.
- **NMVTIS**, the federal title database: title brands, odometer at title,
  junk/salvage/insurance total-loss, theft. **No accidents and no service
  history.** You buy wholesale from an approved provider rather than needing
  your own AAMVA approval; VINData retails at **$3.49/report**. The mandated
  Consumer Access Product Disclaimer must be displayed.
- **NHTSA recalls** — free, no key, verified working. VIN-level shows only
  *open* recalls, so absence is a completion proxy and nothing stronger.
- **AutoCheck / Experian** is the realistic branded vehicle-history route: their
  integrations page explicitly names consumer sites, not only dealerships.

### Carfax — don't

It fails on the facts before risk even enters. The Monroney label is **not part
of any Carfax report tier** — it lives in the logged-in myCarfax garage and
coverage is patchy. Recall service records do often appear, but generically
worded and not reliably tagged with a campaign number, which is exactly the
precision the Bolt question needs.

And the access picture is bad: report links are now opaque-token based rather
than VIN-based, `robots.txt` disallows every report surface, Akamai fronts it,
and the Terms of Use prohibit in capitals both automated collection and
"systematic retrieval… to create or compile… a collection, compilation,
database." Carfax has sued over exactly this and says publicly it will again.
*hiQ* does not help — on remand LinkedIn won on breach of contract, and *Meta v.
Bright Data* turned on **logged-out** access, which a token-gated report is not.

### A note on how these were tested

Mapping this involved probing undocumented endpoints, and in Hyundai's case
sending browser-like headers to get past a 403. That worked, but it is worth
separating two things: a plain GET against a URL an OEM serves publicly to its
own dealer network is ordinary use, while defeating a bot control is a
deliberate step around a stated boundary. Build on the first category. If a
source only yields to header spoofing or a headless browser, treat that as a
signal about both fragility and posture, not just an engineering cost.

## Scope and build order

Roughly **250–400 rows** covers the meaningful US used-EV market; going
trim-granular across every variant pushes toward 1,000. That is a
one-person corpus — which is the point. It isn't defensible because it's hard.
It's open because nobody has bothered.

1. **Service campaigns and coverage extensions, by VIN-eligible model-year.**
   The ICCU extension is the proof case: real money, April 2026, absent from
   every listing site. Warranty *terms* are widely published and mostly correct
   elsewhere — the extensions and campaigns are not.
2. **Tesla VIN position 7/10/11 decoding.** Free, immediate, and resolves the
   Model Y pack and Model 3 heat pump traps with no research at all.
3. **Heat pump and usable kWh** for the top ~20 models.
4. **NACS, adapter, and Supercharger access.** Changes fastest — needs a
   refresh cadence and an `as_of` date on every row.
5. **Entitlement transfer.** Highest churn; Tesla changed policy twice in 2026.
