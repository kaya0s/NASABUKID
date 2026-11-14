import { z } from "zod";
import { coordinatesSchema, type Coordinates } from "./nasa-power";

export const SOIL_DEPTH = "5-15cm";
export function placeRequestUrl(location: Coordinates) {
  coordinatesSchema.parse(location);
  return `https://photon.komoot.io/reverse?${new URLSearchParams({ lat: String(location.latitude), lon: String(location.longitude), lang: "en", limit: "1" })}`;
}
export function soilRequestUrl(location: Coordinates) {
  coordinatesSchema.parse(location);
  const params = new URLSearchParams({
    lat: String(location.latitude),
    lon: String(location.longitude),
    depth: SOIL_DEPTH,
  });
  for (const property of ["phh2o", "sand", "silt", "clay"]) params.append("property", property);
  for (const value of ["mean", "Q0.05", "Q0.95"]) params.append("value", value);
  return `https://rest.isric.org/soilgrids/v2.0/properties/query?${params}`;
}
const placeSchema = z.object({
  features: z.array(
    z.object({
      properties: z.object({
        city: z.string().optional(),
        name: z.string().optional(),
        osm_value: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
      }),
    }),
  ),
});
export function parsePlace(payload: unknown) {
  const p = placeSchema.parse(payload).features[0]?.properties;
  const municipality =
    p?.city?.trim() ||
    (p?.osm_value === "city" || p?.osm_value === "town" ? p.name?.trim() : undefined);
  if (!municipality)
    throw new Error("No municipality or city name is available for this point. Enter it manually.");
  return { municipality, region: [p?.state, p?.country].filter(Boolean).join(", ") };
}
const soilSchema = z.object({
  properties: z.object({
    layers: z.array(
      z.object({
        name: z.string(),
        unit_measure: z.object({ d_factor: z.number() }).optional(),
        depths: z.array(z.object({ label: z.string(), values: z.record(z.number().nullable()) })),
      }),
    ),
  }),
});
export function parseSoil(payload: unknown) {
  const layers = soilSchema.parse(payload).properties.layers;
  function value(name: string, statistic = "mean") {
    const layer = layers.find((layer) => layer.name === name);
    if (layer?.unit_measure && layer.unit_measure.d_factor !== 10)
      throw new Error("Unexpected soil units; estimates were not applied.");
    const raw = layer?.depths.find((depth) => depth.label === SOIL_DEPTH)?.values[statistic];
    if (
      raw === undefined ||
      raw === null ||
      !Number.isFinite(raw) ||
      raw < 0 ||
      raw > (name === "phh2o" ? 140 : 1000)
    )
      return null;
    return raw / 10;
  }
  const ph = value("phh2o"),
    sand = value("sand"),
    silt = value("silt"),
    clay = value("clay");
  if ([ph, sand, silt, clay].every((value) => value === null))
    throw new Error("SoilGrids has no usable estimates for this location and depth.");
  const low = value("phh2o", "Q0.05"),
    high = value("phh2o", "Q0.95");
  return {
    ph,
    sand,
    silt,
    clay,
    phRange: low !== null && high !== null && low <= high ? [low, high] : null,
    texture:
      sand !== null && silt !== null && clay !== null
        ? `Sand ${sand.toFixed(1)}% · Silt ${silt.toFixed(1)}% · Clay ${clay.toFixed(1)}%`
        : null,
  };
}
export async function fetchPublicContext(url: string, signal: AbortSignal) {
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
  });
  if (!response.ok)
    throw new Error(
      `Public data service unavailable (${response.status}). You can enter values manually.`,
    );
  return {
    payload: (await response.json()) as unknown,
    sourceUrl: url,
    retrievedAt: new Date().toISOString(),
  };
}

export function terrainRequestUrl(location: Coordinates) {
  coordinatesSchema.parse(location);
  if (Math.abs(location.latitude) > 85 || Math.abs(location.longitude) > 179.99)
    throw new Error("Terrain sampling is unavailable at this location.");
  const north = 90 / 111195;
  const east = north / Math.cos((location.latitude * Math.PI) / 180);
  const points = [
    location,
    { ...location, latitude: location.latitude + north },
    { ...location, latitude: location.latitude - north },
    { ...location, longitude: location.longitude + east },
    { ...location, longitude: location.longitude - east },
  ];
  return `https://api.open-meteo.com/v1/elevation?${new URLSearchParams({ latitude: points.map((point) => point.latitude.toFixed(6)).join(","), longitude: points.map((point) => point.longitude.toFixed(6)).join(",") })}`;
}
export function parseTerrain(payload: unknown) {
  const { elevation } = z
    .object({ elevation: z.array(z.number().finite().min(-500).max(9000)).length(5) })
    .parse(payload);
  const slopePercent =
    Math.hypot((elevation[1]! - elevation[2]!) / 180, (elevation[3]! - elevation[4]!) / 180) * 100;
  return { elevation: elevation[0]!, slopePercent };
}
