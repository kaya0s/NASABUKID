# External Data Sources Used

Inventory of **live APIs and datasets wired into FieldShift / NASABUKID today**. Reference papers are listed separately; they are not ingested as APIs. Demo crop scores remain local logic in `src/lib/fieldshift-demo.ts` and are not produced by these services.

---

## NASA / NASA-related

| Source | Endpoint / product | Parameters / layers | Role in the app | Auth | Code |
| --- | --- | --- | --- | --- | --- |
| **NASA POWER** | `https://power.larc.nasa.gov/api/temporal/daily/point` | `PRECTOTCORR`, `T2M`, `GWETTOP`, `TS` (community `AG`, UTC) | Historical daily climate; ~90-day map telemetry; planning/recovery charts | Keyless | `src/lib/nasa-power.ts` |
| **NASA GIBS** | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/...` | `MODIS_Terra_Land_Surface_Temp_Day`; `SMAP_L4_Analyzed_Surface_Soil_Moisture`; `MODIS_Terra_NDVI_8Day` | Optional map heatmap overlays | Keyless | `src/components/full-farm-map.tsx` |
| **MODIS ORNL DAAC** | `https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset` | Band `250m_16_days_NDVI` (~6 months) | NDVI time series / greenness sparkline / crop-detection input | Keyless | `src/lib/nasa-power.ts` |

### Notes

- POWER is regional gridded meteorology (~0.5° × 0.625°), not a field sensor.
- GIBS imagery is visual only; it is not merged into POWER time series or demo scores.
- Map drawer may wait on recent POWER (~90 days) and MODIS NDVI before showing rotation cards; scoring itself does not require an LLM.

### NASA docs

- [POWER daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/)
- [GIBS API docs](https://nasa-gibs.github.io/gibs-api-docs/)
- [ORNL MODIS/VIIRS subset tools](https://modis.ornl.gov/data/modis_webservice.html)

### Not connected (NASA / climate)

NOAA ENSO ingestion, Landsat scene analysis, authenticated Earthdata download pipelines, and POWER monthly/climatology endpoints are **not** used.

---

## Other live APIs / datasets

| Source | Endpoint | Role in the app | Auth | Code |
| --- | --- | --- | --- | --- |
| **Open-Meteo forecast** | `https://api.open-meteo.com/v1/forecast` | Modeled current conditions (overview weather) | Keyless | `src/components/overview-weather.tsx` |
| **Open-Meteo elevation** | `https://api.open-meteo.com/v1/elevation` | Elevation samples and approximate terrain gradient (Copernicus GLO-90) | Keyless (non-commercial terms) | `src/lib/farm-context.ts` |
| **ISRIC SoilGrids** | `https://rest.isric.org/soilgrids/v2.0/properties/query` | Predicted pH (`phh2o`) and sand/silt/clay at 5–15 cm | Keyless | `src/lib/farm-context.ts` |
| **Photon** | `https://photon.komoot.io/reverse`, `/api` | Municipality / place reverse geocode and search (OpenStreetMap data) | Keyless | `src/lib/farm-context.ts`, `src/components/full-farm-map.tsx` |
| **OpenStreetMap tiles** | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Base map tiles | Keyless | `src/components/farm-map.tsx`, `src/components/full-farm-map.tsx` |
| **Google hybrid tiles** | `https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}` | Optional hybrid basemap | Keyless tiles | `src/components/full-farm-map.tsx` |
| **Wikipedia API** | `https://en.wikipedia.org/w/api.php` | Nearby place page thumbnails | Keyless | `src/components/full-farm-map.tsx` |
| **Wikimedia Commons API** | `https://commons.wikimedia.org/w/api.php` | Nearby image fallback | Keyless | `src/components/full-farm-map.tsx` |
| **Mapillary** | `https://graph.mapillary.com/images` | Street-level photo near coordinates (via `/api/streetview`) | `MAPILLARY_ACCESS_TOKEN` (optional) | `src/server.ts` |
| **KartaView** | `https://api.kartaview.org/2.0/photo/` | Street-level photo fallback | Keyless | `src/server.ts` |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` | Optional Field Advisor chat explanations | `GEMINI_API_KEY` (server-only) | `src/server.ts` |

Open-Meteo current weather is separate from historical NASA POWER records.

---

## Libraries / CDN (not farm datasets)

| Asset | URL | Role |
| --- | --- | --- |
| Leaflet 1.9.4 CSS/JS | `https://unpkg.com/leaflet@1.9.4/dist/...` | Map rendering |

---

## Reference literature (static cites, not live APIs)

Curated in `src/lib/crop-research.ts` for evidence cards only. They do **not** calibrate demo scores.

| Citation | URL |
| --- | --- |
| FAO Irrigation Water Management, Training Manual No. 3 | https://www.fao.org/4/S2022E/s2022e07.htm |
| Gatan & Gatan (2019) · Philippine corn–mungbean trial | https://rmrj.usjr.edu.ph/rmrj/index.php/RMRJ/article/download/760/201 |
| Dinesh et al. (2024) · cereal–mungbean residue study | https://www.frontiersin.org/journals/sustainable-food-systems/articles/10.3389/fsufs.2024.1259607/full |
| Yang et al. (2025) · sweetpotato waterlogging | https://zwxb.chinacrops.org/EN/10.3724/SP.J.1006.2025.44116 |

---

## Credentials

| Variable | Service | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | Google Gemini advisor | Required for chat; keep server-side (no `VITE_` prefix) |
| `MAPILLARY_ACCESS_TOKEN` | Mapillary street photos | Optional; without it, KartaView / Wikipedia / Commons may still supply imagery |

Mapping, POWER, GIBS, SoilGrids, Photon, and Open-Meteo need no API keys. Internet access is required.

---

## Related docs

- [NASA data used](NASA_DATA.md) — POWER/GIBS detail and limits
- [Methodology](METHODOLOGY.md) — demo scoring vs. evidence separation
- In-app footer: **Sources & APIs used** (`src/components/api-sources.tsx`)
