# FieldShift AI — Bukidnon Crop Compass

A NASA Space Apps decision-support prototype for crop planning and recovery in Bukidnon.

## Implemented

- Leaflet 1.9.4 map with OpenStreetMap tiles: draw a simple farm polygon (up to 200 corners), undo corners, finish, redraw, or clear it. Spherical horizontal area automatically fills hectares and flows into recovery estimates. Boundaries persist in browser storage; the boundary bounding-box midpoint supplies the regional NASA reference location. Clearing an outline retains its last area for manual editing. Invalid or self-crossing outlines are rejected.
- Outside boundary mode, click to select a farm reference or enter latitude/longitude. Coordinates and farm profile save in browser storage when available.
- Keyless NASA POWER daily rainfall (`PRECTOTCORR`, mm/day) and temperature (`T2M`, °C) requests by coordinates and historical date range, using UTC. Fetching starts only when requested.
- Crop planning automatically loads actual NASA monthly rainfall and temperature charts for the previous complete year. Choose a different historical year or refresh the request. Scenario tabs affect only demo scores, never the observed charts. Recovery retains its manual date-range lookup.
- Daily rainfall chart, accessible observation table, CSV download, exact source URL, retrieval timestamp, and missing-data reporting. Missing observations never become zero rainfall.
- In-memory historical request caching for 24 hours through React Query. Requests time out after 45 seconds; failed requests show an error without substituting sample data.
- Three illustrative crop sequences. Demo scores respond to reported pH, drainage, and irrigation. A complete historical calendar year can optionally supply planting-month rainfall to the demo water rating. Changing location or scenario clears the applied historical context.
- Recovery weather lookup around the entered event date, editable expected yield and price, and gross revenue-at-risk calculation. Recovery planting date and drainage update the shared farm profile and planner.
- Photo preview and preset advisor responses remain clearly labeled demonstrations.

## Scientific limits

Scoring, scenario curves, thresholds, and adjustments remain pure typed demo logic in `src/lib/fieldshift-demo.ts`. They are **not verified agronomy, live forecasts, success probabilities, yield predictions, or a soil-water model**. Historical rainfall context does not validate the ratings. The illustrative seasonal scenario examples are not NOAA classifications or historical composites.

NASA POWER is regional gridded data (meteorological resolution approximately 0.5° × 0.625°), not an exact farm measurement. Historical weather does not establish the cause of crop injury or prove flooding. Financial estimates are gross revenue at risk using entered assumptions, excluding costs and insurance.

NOAA ENSO ingestion, verified local crop rules, calendar-aware rotation constraints, validated loss ranges, and a Python agronomy backend are not implemented. The Field Advisor uses Gemini to explain demo inputs; it does not analyze photos or provide verified agricultural advice.

## Run locally

```sh
npm install
npm run dev
```

Set `GEMINI_API_KEY` in the Git-ignored `.env` file before using the Field Advisor locally. The server reads it at startup; restart `npm run dev` after changing it. A local Cloudflare Worker preview reads `.output/server/.dev.vars`; link that ignored file to `../../.env` when using Wrangler.

```sh
npm test
npx tsc --noEmit
npm run build
```

No API keys are required for mapping or historical weather. Internet access is required for NASA POWER, OpenStreetMap tiles, and the pinned Leaflet CDN assets. Leaflet assets use integrity checks. Manual coordinate entry remains available if the map fails. Area is approximate, not a cadastral survey; polygons support local farms within a one-degree span. Photon reverse geocoding (OpenStreetMap data) identifies the nearest mapped municipality/city; results need local confirmation. ISRIC SoilGrids supplies 250 m model predictions for pH in water and texture fractions at 5–15 cm depth, with pH quantiles when available. Both lookups start after the user selects a point or finishes a boundary, are debounced for 1.2 seconds, and cached in memory for seven days. They run independently and continue across page navigation. Empty profile fields fill automatically; manual corrections are preserved. Changing farm location clears previous city/soil values. No point circle is rendered. Public endpoints may be unavailable, throttled, or CORS-blocked; failures leave values unknown with manual input available. Scale the Photon demo endpoint to a hosted/private provider before heavy usage. Requests send the farm reference coordinates to Photon, ISRIC, and NASA as applicable; farm polygons are not uploaded. Sources, exact request URLs, prediction depth, retrieval date, and uncertainty are displayed in the farm source panel. Texture fractions are not a verified soil taxonomic type.

NASA documentation: https://power.larc.nasa.gov/docs/services/api/temporal/daily/

OpenStreetMap tile policy: https://operations.osmfoundation.org/policies/tiles/

This project is connected to [Lovable](https://lovable.dev/projects/9730bab0-4b69-47e4-a512-17a1a16a2994). Keep published Git history intact and follow `AGENTS.md` for generated files, database changes, secrets, and AI gateway requirements.

Public farm context sources: https://github.com/komoot/photon (OpenStreetMap contributors, ODbL) and https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_01.html (ISRIC SoilGrids, CC BY 4.0).


## Irrigation, drainage and compact sources

Irrigation and drainage start as Unknown and remain editable. No irrigation-detection API is connected. Unknown irrigation earns no demo irrigation bonus. A confirmed operational method can be entered by the farmer.

Open-Meteo's keyless non-commercial elevation endpoint samples Copernicus GLO-90 at the farm reference and four neighbours approximately 90 m away. A central-difference calculation gives an approximate terrain gradient, not a measured field slope. Requests use the same independent, debounced, seven-day in-memory query caching as the other context lookups. Failures do not substitute flat terrain.

`suggestDrainage` in `src/lib/fieldshift-demo.ts` uses unvalidated demo rules: clay ≥40% with gradient <2% flags potentially slow drainage; sand ≥65%, clay ≤15%, and gradient 2–15% flags potentially faster drainage. Otherwise it suggests no category. Missing data also yields no suggestion. Actual drainage depends on soil structure, groundwater, ditches and compaction, which these APIs do not measure. The suggestion never changes the field or scoring until the farmer explicitly confirms it. Manual overrides remain available; moving to another farm resets irrigation and drainage to Unknown.

The app footer has a collapsed “Sources & APIs used” control. Farm context has a collapsed “Sources & API details” control with exact URLs, timestamps, grid/depth information, uncertainty, and the screening rules. Map attribution remains visible. Terrain source: Open-Meteo / Copernicus DEM, https://open-meteo.com/en/docs/elevation-api . Free API access is intended for non-commercial use; check provider terms before commercial deployment.


## Published evidence beside rotation cards

Each option includes a short research rationale and expandable findings/references. The curated reference summaries in `src/lib/crop-research.ts` distinguish FAO technical guidance, a Philippine corn–mungbean field experiment (Gatan & Gatan, 2019), a different cereal–mungbean management study (Dinesh et al., 2024), and controlled sweetpotato waterlogging experiments (Yang et al., 2025). Reference water needs retain their seasonal units; trial yields retain their cultivar, location, treatment and comparator context, including nonsignificant results. Experimental yield losses are not inserted into this farm's loss calculator.

None of these references validates the full three-crop sequences for Bukidnon or calibrates the demo weights/ratings. The display explicitly says the ordering remains a demo comparison. Sweetpotato cards flag the need for drainage verification when reported drainage is not Good. This is evidence for discussing candidate crops and management, not proof of the best rotation or a new agronomic scoring model.
