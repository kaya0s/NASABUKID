import { z } from "zod";
import { coordinatesSchema, fetchRecentModisNdvi, type Coordinates } from "./nasa-power";

export const SOIL_DEPTH = "5-15cm";
export function placeRequestUrl(location: Coordinates) {
  coordinatesSchema.parse(location);
  return `https://photon.komoot.io/reverse?${new URLSearchParams({ lat: String(location.latitude), lon: String(location.longitude), lang: "en", limit: "1" })}`;
}
export function nominatimPlaceRequestUrl(location: Coordinates) {
  coordinatesSchema.parse(location);
  return `https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({
    format: "jsonv2",
    lat: String(location.latitude),
    lon: String(location.longitude),
    zoom: "18",
    addressdetails: "1",
    "accept-language": "en",
  })}`;
}
export function joinAddressParts(parts: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of parts) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result.join(", ");
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
        street: z.string().optional(),
        locality: z.string().optional(),
        district: z.string().optional(),
        suburb: z.string().optional(),
        county: z.string().optional(),
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
  const namedPoint =
    p?.name && p.osm_value !== "city" && p.osm_value !== "town" ? p.name.trim() : undefined;
  const fullAddress = joinAddressParts([
    namedPoint,
    p?.street,
    p?.locality,
    p?.district,
    p?.suburb,
    municipality,
    p?.county,
    p?.state,
  ]);
  return {
    municipality,
    region: [p?.state, p?.country].filter(Boolean).join(", "),
    fullAddress: fullAddress || municipality,
  };
}
const nominatimPlaceSchema = z.object({
  address: z
    .object({
      house_number: z.string().optional(),
      road: z.string().optional(),
      quarter: z.string().optional(),
      neighbourhood: z.string().optional(),
      hamlet: z.string().optional(),
      isolated_dwelling: z.string().optional(),
      village: z.string().optional(),
      suburb: z.string().optional(),
      city_district: z.string().optional(),
      town: z.string().optional(),
      city: z.string().optional(),
      municipality: z.string().optional(),
      county: z.string().optional(),
      province: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
});
export function parseNominatimPlace(payload: unknown) {
  const addr = nominatimPlaceSchema.parse(payload).address;
  if (!addr) throw new Error("No detailed address returned.");
  const municipality = addr.city?.trim() || addr.town?.trim() || addr.municipality?.trim();
  const province =
    addr.province?.trim() ||
    (addr.state && !addr.state.toLowerCase().includes("region") ? addr.state.trim() : undefined) ||
    addr.county?.trim() ||
    addr.state?.trim();
  const purokOrSitio =
    addr.quarter?.trim() ||
    addr.neighbourhood?.trim() ||
    addr.hamlet?.trim() ||
    addr.isolated_dwelling?.trim() ||
    addr.road?.trim();
  const barangay = addr.village?.trim() || addr.suburb?.trim() || addr.city_district?.trim();
  const fullAddress = joinAddressParts([
    purokOrSitio,
    barangay,
    municipality,
    province,
  ]);
  if (!fullAddress) throw new Error("No detailed address returned.");
  return {
    municipality: municipality || barangay || province || fullAddress,
    region: joinAddressParts([province, addr.country]),
    fullAddress,
  };
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

export type LandUseTier = "pass" | "soft_confirm" | "hard_block";

export interface LandUseCheckResult {
  tier: LandUseTier;
  message: string | null;
  matchedTag?: string;
}

const HARD_BLOCK_LANDUSE = new Set([
  "residential",
  "commercial",
  "industrial",
  "retail",
  "cemetery",
  "construction",
  "quarry",
  "recreation_ground",
  "railway",
  "military",
  "garages",
  "village_green",
  "park",
  "forest",
  "brownfield",
  "landfill",
  "harbour",
  "port",
  "basin",
  "reservoir",
  "education",
  "institutional",
  "religious",
]);

const HARD_BLOCK_NATURAL = new Set([
  "water",
  "bay",
  "strait",
  "wetland",
  "beach",
  "sand",
  "bare_rock",
  "cliff",
  "rock",
  "shingle",
  "glacier",
  "mud",
  "wood",
  "forest",
]);

const HARD_BLOCK_HIGHWAY = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "residential",
  "service",
  "pedestrian",
  "living_street",
]);

const FARM_PASS_LANDUSE = new Set([
  "farmland",
  "orchard",
  "plantation",
  "vineyard",
  "meadow",
  "plant_nursery",
  "farmyard",
  "allotments",
  "greenhouse_horticulture",
]);

export function overpassLandUseQuery(
  location: Coordinates,
  radiusMeters = 60,
  polygonPoints?: Coordinates[],
): string {
  coordinatesSchema.parse(location);
  const lat = location.latitude.toFixed(6);
  const lng = location.longitude.toFixed(6);
  const filter = (scope: string) =>
    [
      `nwr${scope}["landuse"]`,
      `nwr${scope}["natural"~"^(water|bay|strait|wetland|beach|sand|bare_rock|cliff|rock|shingle|glacier|mud|wood|forest)$"]`,
      `nwr${scope}["waterway"]`,
      `nwr${scope}["building"]`,
      `nwr${scope}["amenity"]`,
      `nwr${scope}["leisure"]`,
      `nwr${scope}["shop"]`,
      `nwr${scope}["aeroway"]`,
      `nwr${scope}["railway"]`,
      `nwr${scope}["man_made"]`,
      `nwr${scope}["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|service|pedestrian|living_street)$"]`,
    ].join(";");
  if (polygonPoints && polygonPoints.length >= 3) {
    const pad = 0.00015;
    const south = (Math.min(...polygonPoints.map((p) => p.latitude)) - pad).toFixed(6);
    const north = (Math.max(...polygonPoints.map((p) => p.latitude)) + pad).toFixed(6);
    const west = (Math.min(...polygonPoints.map((p) => p.longitude)) - pad).toFixed(6);
    const east = (Math.max(...polygonPoints.map((p) => p.longitude)) + pad).toFixed(6);
    const bbox = `${south},${west},${north},${east}`;
    return `[out:json][timeout:6];(is_in(${lat},${lng});${filter(`(${bbox})`)};);out tags 60;`;
  }
  return `[out:json][timeout:6];(is_in(${lat},${lng});${filter(`(around:${radiusMeters},${lat},${lng})`)};);out tags 50;`;
}

export function classifyOverpassLandUse(payload: unknown): LandUseCheckResult {
  const parsed = z
    .object({
      elements: z
        .array(
          z.object({
            tags: z.record(z.string(), z.string()).optional(),
          }),
        )
        .default([]),
    })
    .safeParse(payload);

  if (!parsed.success) {
    return {
      tier: "soft_confirm",
      message: "Unmapped rural parcel — verify crop boundary before saving.",
    };
  }

  let farmTag: string | undefined;
  let roadTag: string | undefined;

  for (const el of parsed.data.elements) {
    const tags = el.tags ?? {};
    const landuse = tags["landuse"]?.toLowerCase();
    const natural = tags["natural"]?.toLowerCase();
    const waterway = tags["waterway"]?.toLowerCase();
    const building = tags["building"]?.toLowerCase();
    const water = tags["water"]?.toLowerCase();
    const place = tags["place"]?.toLowerCase();
    const amenity = tags["amenity"]?.toLowerCase();
    const leisure = tags["leisure"]?.toLowerCase();
    const shop = tags["shop"]?.toLowerCase();
    const aeroway = tags["aeroway"]?.toLowerCase();
    const railway = tags["railway"]?.toLowerCase();
    const manMade = tags["man_made"]?.toLowerCase();
    const highway = tags["highway"]?.toLowerCase();

    if (
      (building && building !== "no") ||
      (natural && HARD_BLOCK_NATURAL.has(natural)) ||
      Boolean(water) ||
      place === "sea" ||
      place === "ocean" ||
      Boolean(waterway) ||
      (landuse && HARD_BLOCK_LANDUSE.has(landuse)) ||
      Boolean(amenity) ||
      Boolean(shop) ||
      Boolean(aeroway) ||
      Boolean(railway) ||
      Boolean(manMade) ||
      (leisure && leisure !== "nature_reserve")
    ) {
      const matched = building && building !== "no"
        ? `building=${building}`
        : natural && HARD_BLOCK_NATURAL.has(natural)
          ? `natural=${natural}`
          : water
            ? `water=${water}`
            : place === "sea" || place === "ocean"
              ? `place=${place}`
              : waterway
                ? `waterway=${waterway}`
                : landuse && HARD_BLOCK_LANDUSE.has(landuse)
                  ? `landuse=${landuse}`
                  : amenity
                    ? `amenity=${amenity}`
                    : shop
                      ? `shop=${shop}`
                      : aeroway
                        ? `aeroway=${aeroway}`
                        : railway
                          ? `railway=${railway}`
                          : manMade
                            ? `man_made=${manMade}`
                            : `leisure=${leisure}`;
      return {
        tier: "hard_block",
        message: "Non-arable area detected (urban structure or water body). Please select a farm plot.",
        matchedTag: matched,
      };
    }

    if (highway && HARD_BLOCK_HIGHWAY.has(highway) && !roadTag) {
      roadTag = `highway=${highway}`;
    }

    if (landuse && FARM_PASS_LANDUSE.has(landuse) && !farmTag) {
      farmTag = `landuse=${landuse}`;
    }
  }

  if (farmTag) {
    return {
      tier: "pass",
      message: null,
      matchedTag: farmTag,
    };
  }

  if (roadTag) {
    return {
      tier: "hard_block",
      message: "Non-arable area detected (urban structure or water body). Please select a farm plot.",
      matchedTag: roadTag,
    };
  }

  return {
    tier: "soft_confirm",
    message: "Unmapped rural parcel — verify crop boundary before saving.",
  };
}

const PHOTON_BLOCK_KEYS = new Set([
  "building",
  "amenity",
  "shop",
  "leisure",
  "aeroway",
  "railway",
  "man_made",
  "waterway",
]);

const PHOTON_BLOCK_VALUES = new Set([
  "residential",
  "commercial",
  "industrial",
  "retail",
  "water",
  "river",
  "lake",
  "sea",
  "ocean",
  "park",
  "school",
  "hospital",
  "parking",
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "service",
]);

export interface FarmSignalInputs {
  elevationM: number | null;
  soilAvailable: boolean | null;
  peakNdvi: number | null;
  photonOsmKey?: string | undefined;
  photonOsmValue?: string | undefined;
}

export function classifyFarmSignals(signals: FarmSignalInputs): LandUseCheckResult {
  const { elevationM, soilAvailable, peakNdvi, photonOsmKey, photonOsmValue } = signals;

  if (elevationM !== null && elevationM <= 0) {
    return {
      tier: "hard_block",
      message: "Non-arable area detected (water body or sea-level terrain). Please select a farm plot.",
      matchedTag: "elevation<=0m",
    };
  }

  const osmKey = photonOsmKey?.toLowerCase();
  const osmValue = photonOsmValue?.toLowerCase();
  if (
    (osmKey && PHOTON_BLOCK_KEYS.has(osmKey)) ||
    (osmValue && PHOTON_BLOCK_VALUES.has(osmValue))
  ) {
    return {
      tier: "hard_block",
      message: "Non-arable area detected (urban structure or water body). Please select a farm plot.",
      matchedTag: `${osmKey ?? "osm"}=${osmValue ?? "unknown"}`,
    };
  }

  if (soilAvailable === false) {
    return {
      tier: "hard_block",
      message: "Non-arable area detected (no arable soil profile at this location). Please select a farm plot.",
      matchedTag: "soilgrids=no_soil",
    };
  }

  if (peakNdvi !== null && peakNdvi <= 0.12) {
    return {
      tier: "hard_block",
      message: "Non-arable area detected (water body or built-up surface with minimal vegetation). Please select a farm plot.",
      matchedTag: `modis_peak_ndvi=${peakNdvi.toFixed(2)}`,
    };
  }

  if (peakNdvi !== null && peakNdvi < 0.25) {
    return {
      tier: "soft_confirm",
      message: "Low 6-month vegetation signal (MODIS NDVI) — verify this boundary covers an active or fallow crop field.",
      matchedTag: `modis_peak_ndvi=${peakNdvi.toFixed(2)}`,
    };
  }

  if (peakNdvi !== null || soilAvailable === true) {
    return {
      tier: "pass",
      message: null,
      ...(peakNdvi !== null ? { matchedTag: `modis_peak_ndvi=${peakNdvi.toFixed(2)}` } : {}),
    };
  }

  return {
    tier: "soft_confirm",
    message: "Unmapped rural parcel — verify crop boundary before saving.",
  };
}

export async function checkFarmLandUse(
  location: Coordinates,
  signal?: AbortSignal,
  _polygonPoints?: Coordinates[],
): Promise<LandUseCheckResult> {
  const timeout = AbortSignal.timeout(9000);
  const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const [elevOutcome, soilOutcome, ndviOutcome, placeOutcome] = await Promise.allSettled([
    fetch(terrainRequestUrl(location), { signal: combinedSignal }),
    fetch(soilRequestUrl(location), { signal: combinedSignal }),
    fetchRecentModisNdvi(location, combinedSignal),
    fetch(placeRequestUrl(location), { signal: combinedSignal }),
  ]);

  let elevationM: number | null = null;
  if (elevOutcome.status === "fulfilled" && elevOutcome.value.ok) {
    try {
      const elevJson = (await elevOutcome.value.json()) as unknown;
      elevationM = parseTerrain(elevJson).elevation;
    } catch {
      elevationM = null;
    }
  }

  let soilAvailable: boolean | null = null;
  if (soilOutcome.status === "fulfilled" && soilOutcome.value.ok) {
    try {
      const soilJson = (await soilOutcome.value.json()) as unknown;
      parseSoil(soilJson);
      soilAvailable = true;
    } catch {
      soilAvailable = false;
    }
  }

  const peakNdvi =
    ndviOutcome.status === "fulfilled" && ndviOutcome.value
      ? ndviOutcome.value.peakNdvi
      : null;

  let photonOsmKey: string | undefined;
  let photonOsmValue: string | undefined;
  if (placeOutcome.status === "fulfilled" && placeOutcome.value.ok) {
    try {
      const placeJson = (await placeOutcome.value.json()) as {
        features?: Array<{
          properties?: { osm_key?: string; osm_value?: string };
        }>;
      };
      const props = placeJson.features?.[0]?.properties;
      photonOsmKey = props?.osm_key;
      photonOsmValue = props?.osm_value;
    } catch {
      // Ignore reverse-geocode parse failure
    }
  }

  return classifyFarmSignals({
    elevationM,
    soilAvailable,
    peakNdvi,
    photonOsmKey,
    photonOsmValue,
  });
}
