# Kia EV6 (2022–2026 model years verified): Charging

## Battery packs

| Model year | Packs, by trim |
|---|---|
| 2022 | 58.0 kWh / 522.7V on Light; 77.4 kWh / 697V on Wind and GT-Line[^1] |
| 2023 | 77.4 kWh / 697V on Wind, GT-Line and GT[^2] |
| 2024 | 58.0 kWh / 522.7V on the base trim; 77.4 kWh / 697V on Light Long Range, Wind, GT-Line and GT[^3] |
| 2025 | 63.0 kWh / 523V on the base trim; 84.0 kWh / 697V on Light Long Range, Wind, GT-Line and GT[^4] |
| 2026 | 63.0 kWh / 523V on Light; 84.0 kWh / 697V on Light Long Range, Wind and GT-Line[^5] |

- The word "Light" is not a reliable key. It heads the 58.0 kWh column in one 2024 Kia document and the 63.0 kWh column in one 2025 Kia document, so match a listing on its model year and pack, not on the word.[^3][^4]

## DC fast charging

| Model year | Trim and pack | Max DC input | 50 kW EVSE, max 125A | 350 kW EVSE, max 200A |
|---|---|---|---|---|
| 2022 | Light, 58.0 kWh | 180 kW[^1] | 63 min[^1] | 18 min[^1] |
| 2022 | Wind and GT-Line, 77.4 kWh | 240 kW[^1] | 73 min[^1] | 18 min[^1] |
| 2023 | Wind, GT-Line and GT, 77.4 kWh | 240 kW[^2] | 73 min[^2] | 18 min[^2] |
| 2024 | base trim, 58.0 kWh | 180 kW[^3] | 63 min[^3] | 18 min[^3] |
| 2024 | Light Long Range, Wind, GT-Line and GT, 77.4 kWh | 240 kW[^3] | 73 min[^3] | 18 min[^3] |

### 2025 and 2026

| Model year | Trim and pack | Max DC input | 50 kW EVSE | 150 kW EVSE | 350 kW EVSE |
|---|---|---|---|---|---|
| 2025 | base trim, 63.0 kWh | 180 kW[^4] | 61 min[^4] | 24 min[^4] | 20 min[^4] |
| 2025 | Light Long Range, Wind and GT-Line, 84.0 kWh | 240 kW[^4] | 81 min[^4] | 29 min[^4] | 20 min[^4] |
| 2025 | GT, 84.0 kWh | 240 kW[^4] | 81 min[^4] | 29 min[^4] | 18 min[^4] |
| 2026 | Light, 63.0 kWh | 180 kW[^5] | 61 min[^5] | 24 min[^5] | 20 min[^5] |
| 2026 | Light Long Range, Wind and GT-Line, 84.0 kWh | 240 kW[^5] | 81 min[^5] | 29 min[^5] | 20 min[^5] |

- State-of-charge window: none is attached to any of the times above in any of Kia's five specification sheets[^1][^2][^3][^4][^5]. Kia's 2025 Vehicle Feature Tips separately gives 10% to 80% in about 18 minutes on a DC fast charger[^6].
- Kia's two 2025 documents disagree on that time: about 18 min[^6] / 20 min at 350 kW for four of the five 2025 trims, 18 min only for GT[^4].

## Home charging (Level 2)

| Model year | Pack | Onboard charger | 11 kW EVSE, 240V / 48A | In-cable control box, 120V / 12A |
|---|---|---|---|---|
| 2022–2024 | 58.0 kWh | 10.9 kW[^1][^3] | 5 h 50 min[^1][^3] | 51 h 5 min[^1][^3] |
| 2022–2024 | 77.4 kWh | 10.9 kW[^1][^2][^3] | 7 h 10 min[^1][^2][^3] | 68 h[^1][^2][^3] |
| 2025–2026 | 63.0 kWh | 10.9 kW[^4][^5] | 5 h 40 min[^4][^5] | 54 h 5 min[^4][^5] |
| 2025–2026 | 84.0 kWh | 10.9 kW[^4][^5] | 7 h 20 min[^4][^5] | 72 h[^4][^5] |

- The onboard charger is 10.9 kW on every trim in every model year 2022 through 2026.[^1][^2][^3][^4][^5]
- Kia's 2025 Vehicle Feature Tips gives a different measurement for Level 2: about 9 hours for a full charge on a 240-volt charger. The specification-sheet times above state no state-of-charge window, so the two are not the same figure.[^6]

## Connector and adapters

| Model year | Charge port |
|---|---|
| 2022–2024 | CCS1. Kia dates the native NACS port to model year 2025[^7] and puts the 2024 and earlier EV6 in the group that needs an adapter to reach one[^8] |
| 2025 | Native NACS, standard. Kia's 2025 owner's manual documents a CCS1 adapter, if equipped, which is what a NACS-port car needs[^7][^9] |

- Kia sells three adapters: NACS to CCS1, which lets an existing CCS1 Kia DC fast charge on NACS; CCS1 to NACS, which lets a NACS-equipped Kia charge on existing CCS DC chargers; and J1772 to NACS, which lets a NACS-equipped Kia AC-charge on existing Level 2 chargers.[^8]
- Buyers who took delivery of a 2024 EV6 from September 4, 2024 onward received an adapter free of charge; earlier buyers may purchase one from an authorized Kia dealer.[^8]
- Charge port door location, 2025: rear, left side, standard on every trim.[^4]

## Preconditioning

| Item | Answer, 2025 EV6 |
|---|---|
| Feature | Battery conditioning mode, marked if equipped[^9] |
| What it does | Helps maintain charging performance at room-temperature levels when the high-voltage battery is hot or cold[^9] |
| Control | A switch on the infotainment screen shows its status and turns it on and off[^9] |
| Navigation | Setting a DC charging station as a waypoint or destination optimizes battery temperature en route, which can reduce charging time[^9] |
| Remote start | Can be activated from the smartphone app while parked; ends when the battery reaches the right range or after 30 minutes[^9] |
| Cost | Uses battery energy to optimize temperature, which may reduce driving range[^9] |
| Limits | May need sufficient time to work, and may not work to secure range if the charge is low[^9] |

## See it for yourself

- [Live Kia EV6 listings on Voltcheck](https://voltcheck.net/?make=Kia&model=EV6)
- [Check a VIN before you buy](https://voltcheck.net/vin)

---

## Footnotes

[^1]: Kia, *2022 Kia EV6 Specifications* (spreadsheet, kiamedia.com document ID 18315), "High-Voltage Battery Pack," "Charging," and "Battery Charge" tables. https://www.kiamedia.com/us/en/download/18315/file/xlsx

[^2]: Kia, *2023 Kia EV6 Specifications* (spreadsheet, kiamedia.com document ID 19161), same three tables. https://www.kiamedia.com/us/en/download/19161/file/xlsx

[^3]: Kia, *2024 Kia EV6 Specifications* (spreadsheet). The document kiamedia's 2024 EV6 page links today is ID 21354, base trim column headed "Light": https://www.kiamedia.com/us/en/download/specifications/xlsx/21354. A second 2024 EV6 specification document, ID 20962, heads that column "Light Short Range": https://www.kiamedia.com/us/en/download/20962/file/xlsx. Every charging figure is identical in the two.

[^4]: Kia, *2025 Kia EV6 Specifications* (spreadsheet). The document kiamedia's 2025 EV6 page links today is ID 22993, base trim column headed "Light Standard Range": https://www.kiamedia.com/us/en/download/specifications/xlsx/22993. A second 2025 EV6 specification document, ID 23181, heads that column "Light": https://www.kiamedia.com/us/en/download/23181/file/xlsx. Every charging figure is identical in the two. Charge port door location from *2025 Kia EV6 Features & Options* (ID 23182), row "Rear (left) charge port door": https://www.kiamedia.com/us/en/download/23182/file/xlsx

[^5]: Kia, *2026 Kia EV6 Specifications* (spreadsheet, kiamedia.com document ID 24329), same three tables. https://www.kiamedia.com/us/en/download/24329/file/xlsx

[^6]: Kia, *2025 Kia EV6 Vehicle Feature Tips* (PDF), "Charging Your Electric Vehicle," Level 2 and Level 3 paragraphs. https://owners.kia.com/content/dam/kia/us/owners/pdf/2025/2025-Kia-EV6-Vehicle-Feature-Tips.pdf

[^7]: Kia America press release, "KIA EV6, EV9 AND NIRO OWNERS GAIN ACCESS TO OVER 21,500 TESLA SUPERCHARGERS," Apr. 24, 2025 (ID 23210). https://www.kiamedia.com/us/en/media/pressreleases/23210/kia-ev6-ev9-and-niro-owners-gain-access-to-over-21500-tesla-superchargers

[^8]: Kia America press release, "KIA AMERICA TO OFFER NORTH AMERICAN CHARGING STANDARD (NACS) IN EARLY 2025," Sept. 24, 2024 (ID 22573). https://www.kiamedia.com/us/en/media/pressreleases/22573/kia-america-to-offer-north-american-charging-standard-nacs-adapters-in-early-2025

[^9]: Kia, *2025 EV6 Owner's Manual* (PDF, 593 pages; mirror), pp. 1-15 to 1-16 for battery conditioning mode, p. 1-30 for the CCS1 adapter. https://cdn.dealereprocess.org/cdn/servicemanuals/kia/2025-ev6.pdf


## Scope note

Model years 2022 through 2026 are verified against Kia's own US specification spreadsheets, where each figure is tied to a named trim column in the file itself. Preconditioning is verified against the 2025 owner's manual only and should not be read as applying to any other model year. The 2026 EV6's charge-port type is not claimed: no Kia document opened for this sheet states it.
