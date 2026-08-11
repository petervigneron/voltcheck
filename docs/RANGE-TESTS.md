# Real-world range test results (instrumented, attributed)

Collected 2026-08-10. Protocols: **Edmunds** = ~60/40 city-highway loop (flatters EVs);
**InsideEVs (IE)** = steady 70 mph; **Car and Driver (C&D)** = steady 75 mph (worst case);
**Recurrent** = owner telemetry, not an instrumented test. Site convention: `testedRangeMi`
value = the steady-highway figure (70-mph preferred), all tests attributed in the note.

Access tiers: IE fetched directly (verified); C&D via translate-proxy of their own pages
(verified-proxy); Edmunds 403'd domain-wide — all Edmunds numbers are reported tier from
their own article snippets. Control tests passed before every recorded negative.

## Results (mi) — test car | IE 70 | C&D 75 | Edmunds | EPA of test car

- Model Y LR AWD (2020–21 cars): 276 | 220 | 317 | 316–326
- Model 3 LR AWD (2019/2021): 290/310 | — | 345 | 322/353. 2024 LR RWD: C&D 310. Perf: C&D 260/303
- ID.4: 2021 FE RWD 234 | 190 | 287–288 | 250. 2023 Pro S AWD Edmunds 269/255. 2024 Pro S RWD Edmunds 299/291; Pro S AWD C&D 240/263
- Leaf SL Plus 2020: 190 | — | — | 215. 40 kWh: no instrumented test (Recurrent only)
- Ariya 87 e-4ORCE (2025 Platinum+ 20"): 250 | 210 | 265 | 257. 87 FWD Empower+: C&D 240. 63 kWh: none
- bZ4X: 2023 Ltd AWD C&D 160/222 (!). 2023 Ltd FWD Edmunds 227/242 (missed EPA on their loop)
- Solterra: C&D 200 (reported only — thinnest coverage in the set)
- Lyriq RWD 2023: 330 | 270 | 319 (2024) | 312. AWD: C&D 220/307 (!)
- Niro EV 2023: — | 210 | 280 | 253. Gen-1 (2019–22): none
- EV6 GT-Line AWD 2022: 245 | — | 261 | 274. 2024 Wind RWD Edmunds 323/310
- Ioniq 5 AWD 2022: 227 (19") / 195 (20") | — | 270 | 256. 2025 XRT: C&D 200/259
- i4 M50 2022: 239 | — | 268 | 227 (beat EPA at 70). eDrive40 2025: C&D 280/279. eDrive35: none
- Prologue Elite AWD 2024: — | 240 (rep.) | 320 | 273
- Equinox EV FWD 2024: 303 | 260 (rep.) | 356 (2025) | 319
- Blazer EV RS AWD 2024: — | 200 | 320 | 279 (!). SS 2025: C&D 250/303
- Bolt EV: 2020: 226 | 220 | — | 259. 2022: 260 | — | 278 | 259. EUV 2022: 231 | 190 | — | 247
- Silverado EV RST 2024: 442 | 400 | 484 | 440. 2025 WT Max: Edmunds 539/492 (their record)
- I-PACE EV400: 195 (2022) | 190 (2019) | — | 234
- Hummer EV Pickup Ed1 2022: 343 | 290 (2023) | — | 329 GM est (beat it at 70)
- Mach-E: 2021 CA Rt1 RWD 287/305; 2021 SR AWD 226/211 (beat EPA); 2023 Prem AWD ER 285/290. C&D: never tested it (verified negative)
- Lightning: Lariat ER 270/320; Pro SR 214/230 | C&D Platinum ER 230/300 (towing ~100) | Edmunds ER 332
- EQB 350 2022: Edmunds 242/227. C&D: not tested (verified negative)
- EQE 350 2023: C&D 260/267
- EQS: 450+ IE 395/350; Edmunds 422; C&D 580 350/340, 2025 450 4Matic 400
- iX xDrive50 2022: 345 | — | 377 | 324 (beat EPA both)

## Zero instrumented coverage
Model Y AWD 4680 (2022–23), Model 3 SR+/RWD (2020–23), Leaf 40 kWh, Ariya 63 kWh,
Solterra (verified), Niro EV gen-1, i4 eDrive35, Silverado WT Standard pack.

## Patterns in the data (numbers only)
1. Protocol ordering always: Edmunds > IE 70 > C&D 75.
2. No Tesla in the set met EPA in any instrumented test.
3. German luxury (i4/iX/EQS) beat EPA even at 75 mph.
4. GM Ultium over-delivers at 70 mph but falls hard at 75 (Lyriq AWD 220/307; Blazer 200/279).
5. bZ4X/Solterra post the worst 75-mph results in the dataset (160/200).
6. Wheel size alone: Ioniq 5 AWD 227 (19") vs 195 (20"), same EPA.

Integrated into `web/lib/enrichment/` as `testedRangeMi` on 28 rows, source tier
"tested", each note naming every test. Full per-test URLs in the research transcript;
key ones embedded in row notes.
