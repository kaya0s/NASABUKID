# Next-crop screening

The map drawer and standalone planner use the same component and pure typed comparison in `src/lib/fieldshift-demo.ts`. This is illustrative screening of global reference requirements, not locally validated agronomy or a forecast.

The farmer confirms location, current/previous crops and a future planting date. Soil pH automatically loads from the shared SoilGrids lookup for the confirmed farm point (water pH, 5–15 cm, raw values divided by the provider scale factor of 10). The REST lookup is limited to five seconds; unavailable/missing pH falls back to an official ISRIC WMS GeoJSON point query with explicit `pH*10` validation. No texture or uncertainty interval is inferred from that pH-only response. Its source link, loading/error state and manual refresh are visible in the planner. Manual corrections are preserved; moving the farm clears previous point-derived fields. Failed or missing pH stays unknown.

Soil pH, texture, drainage, irrigation and mapped elevation/slope contribute conditions and constraints; missing information stays unknown. Crop identity is never inferred from satellite greenness or elevation.

## Historical baseline

NASA POWER monthly PRECTOTCORR and T2M for the last ten complete calendar years, cached in the current browser session for 24 hours. Rainfall rates are converted using actual calendar-month day counts. Monthly and annual totals are not confused, annual summary entries are ignored, and missing-value metadata is respected. At least eight complete rainfall years and eight usable years for each growing-period month are required.

Annual rainfall is compared only with annual reference ranges. Monthly means are checked through the maximum growing period listed by ECOCROP, crossing December when necessary. This broad window is deliberately conservative: it is not the duration of a selected local cultivar, nor an establishment-water model. Monthly means cannot establish daily heat, flooding or drought extremes. Annual climate limits may exclude locally viable seasonal or irrigated crops; irrigation is never assumed to remove that conflict.

Source: https://power.larc.nasa.gov/docs/services/api/temporal/monthly/

## Crop references

FAO ECOCROP tables, consulted 2026-11-15. Numeric temperature, annual rainfall, pH, altitude and crop-cycle values are recorded in `src/lib/crop-requirements.ts` with their source IDs.

| Crop | FAO taxon | Source |
| --- | --- | --- |
| Pineapple | Ananas comosus | https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=402 |
| Banana | Musa acuminata | https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=7848 |
| Sugar Cane | Saccharum officinarum | https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1884 |
| Corn | Zea mays | https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=2175 |
| Rice | Oryza sativa | https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1574 |
| Mungbean | Vigna radiata | https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=2150 |
| Sweet potato | Ipomoea batatas | https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1265 |
| Cassava | Manihot esculenta | https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1420 |

Supplementary drainage guidance is linked in the result and requirement module. Rice uses the wet-rice reference and always requires confirmation of water control and variety; poor drainage is not proof of suitability. Banana uses a broad Musa acuminata reference, not a verified local cultivar. Pineapple, banana, sugarcane and cassava carry long-term land-commitment cautions.

## Ordering and limitations

Known conflicts with published broad limits are withheld. Remaining crops are ordered by fewer unresolved conditions, more matches to optimal ranges, then changes from recent crops/crop families. Ties retain catalog order. There is no confidence percentage, income estimate or success probability. This ordering is a demo policy, not a research-validated ranking. The 15% slope caution is an existing demo precaution, not a published suitability boundary.

The result shows at most three options and the withheld crops with reasons. No match or insufficient data produces an explicit request for more information. Changes invalidate the result; the advisor receives the same current result and date, never old sample scores. A local technician must review soil depth/fertility, cultivar, pests, water availability and planting/harvest logistics before field use.
