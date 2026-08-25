# Tesla Model 3 (model years 2017–2026): Heat Pump

## Tesla draws the line at a build date, not a model year

Tesla's own words, in a NOTE in the Model 3 Owner's Manual: "Vehicles manufactured between approximately July 2017 and October 2020 do not have a heat pump." The same NOTE continues: "Vehicles manufactured afterward have a heat pump." The word "approximately" is Tesla's. The rest of each sentence points the reader at the matching low-voltage-battery procedure, which is what the NOTE is there for.[^1]

That sentence is a manufacture date. It is not a model year, and no Tesla document opened for this page maps one to the other. A Model 3 whose build date sits near October 2020 cannot be resolved from its model year alone.

## How to check one specific car

Tesla publishes a per-car check, in its own words: "to determine if your vehicle has a heat pump, touch Controls > Software > Additional Vehicle Information." The instruction appears twice in the same manual edition — on the Operating Climate Controls page and on the Cold Weather Best Practices page.[^2][^3]

## Why Tesla's component list is not the answer

Tesla's Electric Vehicle Components page lists "Heat Pump Assembly" first among the Model 3's High Voltage Components, with no year, trim or "if equipped" qualifier. It reads that way in both editions of the manual — the "2017-2023" edition and the current "2024+" edition.[^4][^5]

The 2017-2023 edition covers cars Tesla itself says do not have a heat pump. So the component list cannot be read as a per-year answer for that span, and a Model 3 built in 2018 is not established to have a heat pump by the fact that its manual lists one.

## Tesla's emergency documents contain both architectures

Tesla's Model 3 Emergency Response Guide for 2017-2023 describes the car two ways, in one document:

- Its prose names resistive heaters. Tesla's list of what the high voltage contactors connect: "the rear drive unit, the front drive unit, the air conditioning compressor, the coolant heater, the cabin postive temperature coefficient (PTC) heater, and the rear PTC heater." The misspelling of "positive" is Tesla's.[^6]
- Its High Voltage Components diagram, twelve pages later in the same guide, labels callout 2 "Heat Pump."[^7]

The 2024+ guide, covering only cars that all have a heat pump, labels the same callout position "Air Conditioning Compressor" and drops the heaters from its prose entirely.[^8][^9] Tesla's diagram labels therefore do not track whether a car has a heat pump, and none of these three documents can date the change on its own. The dated NOTE above is the only Tesla statement here that does.

## How this was checked

- Both editions of the Model 3 Owner's Manual were searched in full through the search payload Tesla's own manual site loads (`index.json`): 123 pages in the 2017-2023 edition, of which 8 contain "heat pump"; 125 pages in the current edition, of which 6 do. Control: 12 pages of the 2017-2023 edition contain "supercharg", so the search runs against real text rather than returning nothing.[^10]
- The conditional phrasing "to determine if your vehicle has a heat pump" appears on four pages of the 2017-2023 edition and on two pages of the current edition. Tesla carries the same wording into an edition covering only cars that have one, so the conditional by itself proves nothing about any model year — which is why nothing above rests on it.[^10]

## Not claimed here

Nothing about trims. Tesla's statement is by manufacture date only, and no document opened for this page distinguishes Rear-Wheel Drive, Long Range or Performance on this point.

## See it for yourself

- [Live Tesla Model 3 listings on Voltcheck](https://voltcheck.net/?make=Tesla&model=Model+3)
- [Check a VIN before you buy](https://voltcheck.net/vin)

---

## Footnotes

[^1]: Tesla, *Model 3 Owner's Manual*, "2017-2023" edition, "Replacing the Low Voltage Lead-Acid Battery" page, second NOTE. https://www.tesla.com/ownersmanual/2017_2023_model3/en_us/GUID-2588F809-41E3-43F1-84E5-6745C7C18DBE.html. Read 2026-08-25; Tesla's page carries a modified date of 2026.06.30 and is revised in place. Fetched via a real browser session; tesla.com blocks a direct plain-HTTP fetch.

[^2]: Tesla, *Model 3 Owner's Manual*, "2017-2023" edition, "Operating Climate Controls" page, "Climate Control Operating Tips." https://www.tesla.com/ownersmanual/2017_2023_model3/en_us/GUID-4F3599A1-20D9-4A49-B4A0-5261F957C096.html

[^3]: Tesla, *Model 3 Owner's Manual*, "2017-2023" edition, "Cold Weather Best Practices" page. https://www.tesla.com/ownersmanual/2017_2023_model3/en_us/GUID-F907200E-A619-4A95-A0CF-94E0D03BEBEF.html

[^4]: Tesla, *Model 3 Owner's Manual*, "2017-2023" edition, "Electric Vehicle Components" page, "High Voltage Components." https://www.tesla.com/ownersmanual/2017_2023_model3/en_us/GUID-8FA15856-1720-440F-838B-ACFBA8D7D608.html

[^5]: Tesla, *Model 3 Owner's Manual*, current "2024+" edition, same page. https://www.tesla.com/ownersmanual/model3/en_us/GUID-8FA15856-1720-440F-838B-ACFBA8D7D608.html

[^6]: Tesla, *Model 3 Emergency Response Guide* (PDF, 32 pages), covering 2017-2023, "Cable Cut," printed page 9 (PDF page 11). https://digitalassets.tesla.com/tesla-contents/image/upload/2017-2023-Model-3-Emergency-Response-Guide_en.pdf

[^7]: Same guide, "High Voltage Components" diagram, printed page 20 (PDF page 22). The page was rendered as an image and read from the image, not from extracted text.

[^8]: Tesla, *Model 3 2024+ Emergency Response Guide* (PDF, 36 pages), "High Voltage Components" diagram, printed page 22 (PDF page 24). https://digitalassets.tesla.com/tesla-contents/image/upload/2024-Model-3-Emergency-Response-Guide_en.pdf

[^9]: Same 2024+ guide, contactor prose: "those high voltage components include the rear drive unit, the front drive unit, the air conditioning compressor, and potentially the charge port."

[^10]: Counts taken 2026-08-25 from the search payloads Tesla's manual site itself loads: https://www.tesla.com/ownersmanual/2017_2023_model3/en_us/index.json and https://www.tesla.com/ownersmanual/model3/en_us/index.json. These are the full body text of every page in each edition, served by Tesla.

## Scope note

Model years 2017 through 2026, US market, and the boundary is stated the way Tesla states it: by manufacture date, approximately October 2020, not by model year. Anything finer than that — an exact changeover date, a VIN range, a model-year mapping — is not claimed, because no Tesla document opened for this page contains one.

Two editions of Tesla's Model 3 Owner's Manual exist, "2017-2023" and "2024+", and both were read this pass. Tesla revises both in place without versioning them; the pages read here carry a modified date of 2026.06.30.

The Model 3 Performance, Long Range and Rear-Wheel Drive are not broken out, because Tesla's statement does not break them out.

No forum thread, aggregator listing or press account of when the Model 3 gained its heat pump was used as a source here, and none is contradicted by name. What is above is what Tesla's own documents say.
