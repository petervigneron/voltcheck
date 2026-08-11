# Corrections to the inherited research

Errors found in `ENRICHMENT-SCHEMA.md` / `HANDOFF.md` after checking primary sources.
The originals are left untouched as the historical record; **this file wins on conflict.**

## 2026-08-09 — Model Y "same badge, 279 vs 330" claim is wrong

**The schema doc claimed:** a 2024 Model Y "Long Range AWD" is either a Fremont 2170 car
(330 mi) or an Austin 4680 car (279 mi) — same badge, plant decides. Its worked example
applied this to a 2024 VIN.

**Verified against the EPA's own API (fueleconomy.gov REST, fetched 2026-08-09):**

| Year | EPA trim name | Range |
|---|---|---|
| 2022–23 | Model Y **AWD** (the Austin 4680 car) | **279 mi** |
| 2022–23 | Model Y **Long Range AWD** | **330 mi** |
| 2024 | Model Y Long Range AWD | **310 mi** (AWD-I variant: 308) |
| 2024 | *(no 279-mile AWD variant exists)* | — |

So: (1) the 279-mile car was its **own trim** ("Model Y AWD", 2022–23), not a same-badge
variant; (2) no 279-mile car exists for MY2024; (3) the 2024 Long Range AWD is rated
**310**, not 330.

**What survives, reframed:** the trap is real but it's a *naming/mislabeling* trap, not a
hidden-variant trap. "AWD" vs "Long Range AWD" differ by one word and 51 miles, and used
listings blur them. VIN plant character gives an asymmetric test: **F (Fremont) proves
the 330-mile car; A (Austin) is ambiguous** — Austin built both — and needs the window
sticker or door-jamb EPA label. Also worth surfacing: listings quote 330 for 2024 cars
whose official rating is 310.

**Status of the mislabeling claim itself:** that dealers frequently list "Model Y AWD" as
"Long Range" is plausible and widely anecdotally reported, but not yet systematically
verified — worth a sampling pass over real listings before the copy asserts "constantly."

Product code updated accordingly (`web/lib/enrichment/data.ts` rows
`model-y-lr-awd-2022-23`, `model-y-awd-4680-2022-23`, `model-y-lr-awd-2024`; matcher
discriminator; demo listings). Caught because the owner questioned the phrasing —
third instance of owner pushback being right.
