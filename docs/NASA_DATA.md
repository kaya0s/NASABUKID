# NASA Data Used

FieldShift AI (Bukidnon Crop Compass) uses open NASA Earth science products for regional climate context and map imagery. None of these sources are field sensors, live forecasts, or verified agronomy. Crop scores and loss estimates remain demo logic in `src/lib/fieldshift-demo.ts`.

## Summary

| Product | Role in the app | Spatial scale | Access |
| --- | --- | --- | --- |
| [NASA POWER](https://power.larc.nasa.gov/) | Historical daily weather and recent climate metrics at a farm reference point | ~0.5° × 0.625° grid | Keyless REST API |
| [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/) | Optional map heatmaps (LST, soil moisture, NDVI) | Product-dependent (~250 m–9 km) | Keyless WMTS tiles |

POWER values and GIBS overlays are separate datasets. Map layers do not replace POWER numbers, and neither feeds a NASA suitability score.

---

## 1. NASA POWER (Prediction Of Worldwide Energy Resources)

**Endpoint:** `https://power.larc.nasa.gov/api/temporal/daily/point`  
**Docs:** https://power.larc.nasa.gov/docs/services/api/temporal/daily/  
**Implementation:** `src/lib/nasa-power.ts`

### Request settings

| Setting | Value |
| --- | --- |
| Community | `AG` (agroclimatology) |
| Format | JSON |
| Time standard | UTC |
| Location | Farm reference latitude/longitude (map pin or polygon bounding-box midpoint) |
| Date window | User-selected or automatic; max ~1 year per request; earliest 1981-01-01 |
| Auth | None (keyless public API) |

Requests start only when the user asks (or when planning loads the previous complete year / the map loads recent climate). Failed requests show an error; sample weather is never substituted. Responses are cached in memory for 24 hours (React Query). Timeout: 45 seconds.

### Parameters used

| Parameter | Units | Meaning in the app |
| --- | --- | --- |
| `PRECTOTCORR` | mm/day | Bias-corrected precipitation; daily rainfall charts, monthly totals, 30-day rain sum |
| `T2M` | °C | 2 m air temperature; daily/monthly temperature charts |
| `GWETTOP` | 0–1 (shown as %) | Surface soil wetness; recent map climate panel |
| `TS` | °C | Earth/skin temperature; recent map climate panel |

Elevation may appear in the POWER geometry response (`coordinates[2]`) when present; it is display-only context, not a drainage measurement.

**Fill values:** NASA missing markers (e.g. `-999`) and invalid numbers stay missing. Missing rainfall is never treated as zero dry weather.

### Where POWER appears

1. **Crop planning** — Automatic load of the previous complete calendar year; monthly rainfall and temperature charts. Optional planting-month rainfall can adjust the demo water rating only after a full year is applied. Scenario tabs never rewrite the observed charts.
2. **Recovery** — Manual historical date-range lookup around an event; daily chart, table, CSV, exact request URL, and retrieval timestamp.
3. **Farm map** — Recent ~90-day climate (with prior-year fallback if needed): soil moisture (`GWETTOP`), skin temperature (`TS`), and 30-day rainfall from `PRECTOTCORR`.

### Limits

- Regional gridded meteorology, not an exact farm measurement.
- Historical rainfall does not prove flooding or crop injury.
- Not real-time weather (Open-Meteo supplies modeled current conditions separately).

---

## 2. NASA GIBS (Global Imagery Browse Services)

**Base:** `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/...`  
**Docs:** https://nasa-gibs.github.io/gibs-api-docs/  
**Implementation:** `src/components/full-farm-map.tsx`

Optional Leaflet overlays for visual context. They are imagery only; they are not merged into POWER time series or demo scores.

| Layer (UI label) | GIBS product | Approx. resolution | What it shows |
| --- | --- | --- | --- |
| Surface Heat (LST) | `MODIS_Terra_Land_Surface_Temp_Day` | ~1 km | Cooler → hotter land surface (MODIS Terra day) |
| Soil Moisture (SMAP) | `SMAP_L4_Analyzed_Surface_Soil_Moisture` | ~9 km | Dry → wet top ~5 cm soil (SMAP L4) |
| Vegetation / NDVI | `MODIS_Terra_NDVI_8Day` | ~250 m | Sparse → dense green canopy (MODIS 8-day NDVI) |

Attribution on the map: **NASA GIBS**. Tile load failures are reported honestly for the current zoom/area.

### Limits

- Visual overlays only; NDVI has no per-plot numeric value in the app.
- POWER panel metrics and GIBS layers must not be read as the same observation.
- No NASA “match %” or crop suitability product is computed from these tiles.

---

## 3. Provenance shown in the UI

- Exact POWER request URL and retrieval timestamp beside historical records.
- Collapsed **Sources & APIs used** (footer) and farm **Sources & API details**.
- CSV download and accessible observation tables for historical daily series.
- Clear separation of POWER values vs. SMAP/MODIS display layers on the map.

---

## 4. NASA data not used

The prototype does not ingest NOAA ENSO, Landsat scene analysis, hyperspectral crop health models, or any authenticated NASA Earthdata download pipeline beyond the public POWER API and GIBS WMTS tiles listed above.

---

## Quick links

- [NASA POWER daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/)
- [NASA GIBS API docs](https://nasa-gibs.github.io/gibs-api-docs/)
- [POWER web portal](https://power.larc.nasa.gov/)
- Related project docs: [Methodology](METHODOLOGY.md), [Space Apps defense](SPACE_APPS_DEFENSE.md)
