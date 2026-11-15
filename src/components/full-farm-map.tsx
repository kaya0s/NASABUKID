import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, ArrowRight, BadgeCheck, Check, ChevronDown, CloudRain, Droplets, ExternalLink, FileDown, Globe, GripHorizontal, Layers, Loader2, Locate, MapPin, Navigation, Pencil, RotateCcw, Search, ShieldAlert, ShieldCheck, Sprout, Sun, ThermometerSun, Trash2, Waves, Wind, X, ZoomIn, ZoomOut } from "lucide-react";
import bukidnonFields from "@/assets/bukidnon-fields.jpg";
import { Button } from "@/components/ui/button";
import { NextCropPlanner, type PlannerResult } from "@/components/next-crop-planner";
import { PrintReport } from "@/components/print-report";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  loadLeaflet,
  type CircleInstance,
  type Leaflet,
  type MapInstance,
  type MarkerInstance,
  type TileLayerInstance,
} from "@/components/farm-map";
import { measureFarmBoundary } from "@/lib/farm-boundary";
import { checkFarmLandUse, type LandUseCheckResult } from "@/lib/farm-context";
import { RECOVERY_STEPS } from "@/lib/advisor";
import { calculateEstimatedLoss, type RecoveryHazard } from "@/lib/fieldshift-demo";
import {
  fetchRecentModisNdvi,
  summarizeWeather,
  type Coordinates,
  type HistoricalWeather,
  type ModisNdviSeries,
} from "@/lib/nasa-power";

type MapStyle = "satellite" | "street";
type HeatmapLayer = "none" | "lst" | "soil_moisture" | "ndvi";
type AdvisoryMode = "rotation" | "recovery";
type HazardType = RecoveryHazard;
const ENABLE_FARM_LOT_VERIFICATION = false;
const SHOW_COMPACT_RECOVERY_UI = false;
const ENABLE_RECOVERY_MODAL = false;

const RECOVERY_HAZARDS: Record<
  HazardType,
  { icon: typeof Waves; summary: string; replantNote: string }
> = {
  Flooding: {
    icon: Waves,
    summary: "Check standing water, root rot risk, and field drainage channels before replanting.",
    replantNote: "Mungbean or sweet potato can help utilize leftover soil moisture once water recedes.",
  },
  Drought: {
    icon: Sun,
    summary: "Track soil dryness, irrigation access, and heat stress across affected sections.",
    replantNote: "Drought-tolerant mungbean or cassava fits lower-moisture recovery windows.",
  },
  Typhoon: {
    icon: Wind,
    summary: "Inspect wind lodging and snapped stems only when field access is safe.",
    replantNote: "Short-cycle mungbean (60–65 days) supports quick turnover after storm cleanup.",
  },
  Heat: {
    icon: ThermometerSun,
    summary: "Monitor topsoil heat, leaf scorch, and midday wilting on exposed slopes.",
    replantNote: "Cover crops or heat-tolerant varieties help protect exposed topsoil.",
  },
  "Human-caused": {
    icon: ShieldAlert,
    summary: "Record what happened and document visible damage from a safe location.",
    replantNote: "Seek a local assessment before treating the field or deciding to replant.",
  },
};

const PHP_FORMATTER = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function getEastEdge(center: { lat: number; lng: number }, radiusMeters: number): [number, number] {
  const dLng = radiusMeters / (111320 * Math.cos((center.lat * Math.PI) / 180));
  return [center.lat, center.lng + dLng];
}

const HEATMAP_LAYERS: Record<
  Exclude<HeatmapLayer, "none">,
  {
    label: string;
    short: string;
    detail: string;
    url: string;
    maxNativeZoom: number;
    scaleLabel: string;
    gradient: string;
  }
> = {
  lst: {
    label: "Surface Heat (LST)",
    short: "Heat",
    detail: "MODIS Terra Day · ~1 km",
    url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_Land_Surface_Temp_Day/default/default/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png",
    maxNativeZoom: 7,
    scaleLabel: "Cooler -> Hotter land surface (NASA MODIS)",
    gradient: "linear-gradient(90deg, #3b82f6, #22c55e, #eab308, #ef4444)",
  },
  soil_moisture: {
    label: "Soil Moisture (SMAP)",
    short: "Moisture",
    detail: "NASA SMAP L4 · ~9 km",
    url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/SMAP_L4_Analyzed_Surface_Soil_Moisture/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png",
    maxNativeZoom: 6,
    scaleLabel: "Dry -> Wet top 5 cm soil (NASA SMAP)",
    gradient: "linear-gradient(90deg, #d97706, #eab308, #22c55e, #0284c7)",
  },
  ndvi: {
    label: "Vegetation / NDVI",
    short: "NDVI",
    detail: "MODIS 8-Day · ~250 m",
    url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png",
    maxNativeZoom: 9,
    scaleLabel: "Sparse -> Dense green canopy (NASA MODIS)",
    gradient: "linear-gradient(90deg, #a16207, #eab308, #4ade80, #15803d)",
  },
};

type LandmarkInfo = {
  title: string;
  subtitle: string;
  accuracyMeters: number | null;
  source: "gps" | "pin";
  photoUrl?: string | undefined;
  photoLabel?: string | undefined;
};

type SearchResult = {
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
};

const OLC_ALPHABET = "23456789CFGHJMPQRVWX";

function decodePlusCode(
  input: string,
  refLat: number,
  refLon: number,
): { latitude: number; longitude: number; code: string } | null {
  const token = input.trim().toUpperCase().split(/[,\s]+/)[0] ?? "";
  if (!/^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}$/.test(token)) {
    return null;
  }
  const [beforePlus, afterPlus] = token.split("+");
  if (!beforePlus || !afterPlus) return null;

  let fullBefore = beforePlus;
  if (beforePlus.length === 4) {
    const latVal = Math.min(89.999, Math.max(-90, refLat)) + 90;
    const lonVal = Math.min(179.999, Math.max(-180, refLon)) + 180;
    const p1Lat = Math.floor(latVal / 20);
    const p1Lon = Math.floor(lonVal / 20);
    const p2Lat = Math.floor(latVal % 20);
    const p2Lon = Math.floor(lonVal % 20);
    fullBefore = `${OLC_ALPHABET[p1Lat]}${OLC_ALPHABET[p1Lon]}${OLC_ALPHABET[p2Lat]}${OLC_ALPHABET[p2Lon]}${beforePlus}`;
  }
  if (fullBefore.length !== 8) return null;

  const fullCode = `${fullBefore}${afterPlus}`;
  const res = [20, 1, 0.05, 0.0025, 0.000125];
  let lat = -90;
  let lon = -180;
  for (let i = 0; i < 5; i++) {
    const latChar = OLC_ALPHABET.indexOf(fullCode[i * 2]!);
    const lonChar = OLC_ALPHABET.indexOf(fullCode[i * 2 + 1]!);
    if (latChar < 0 || lonChar < 0) return null;
    lat += latChar * res[i]!;
    lon += lonChar * res[i]!;
  }
  let latHeight = res[4]!;
  let lonWidth = res[4]!;
  if (fullCode.length === 11) {
    const extra = OLC_ALPHABET.indexOf(fullCode[10]!);
    if (extra < 0) return null;
    latHeight /= 5;
    lonWidth /= 4;
    lat += Math.floor(extra / 4) * latHeight;
    lon += (extra % 4) * lonWidth;
  }
  return {
    latitude: Number((lat + latHeight / 2).toFixed(7)),
    longitude: Number((lon + lonWidth / 2).toFixed(7)),
    code: `${fullBefore}+${afterPlus}`,
  };
}

async function searchLocations(
  query: string,
  nearLat: number,
  nearLon: number,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const plusMatch = decodePlusCode(trimmed, nearLat, nearLon);
  if (plusMatch) {
    return [
      {
        title: `Plus Code ${plusMatch.code}`,
        subtitle: `Jump to ${plusMatch.latitude.toFixed(5)}°, ${plusMatch.longitude.toFixed(5)}°`,
        latitude: plusMatch.latitude,
        longitude: plusMatch.longitude,
      },
    ];
  }

  // Match direct coordinates: e.g. "8.32629, 124.97766" or "8.32629 124.97766"
  const coordMatch = trimmed.match(/^([-+]?\d{1,2}(?:\.\d+)?)[,\s]+([-+]?\d{1,3}(?:\.\d+)?)$/);
  if (coordMatch && coordMatch[1] && coordMatch[2]) {
    const lat = parseFloat(coordMatch[1]);
    const lon = parseFloat(coordMatch[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return [
        {
          title: `Coordinates (${lat.toFixed(5)}°, ${lon.toFixed(5)}°)`,
          subtitle: "Jump directly to coordinates",
          latitude: lat,
          longitude: lon,
        },
      ];
    }
  }

  const url = `https://photon.komoot.io/api/?${new URLSearchParams({
    q: trimmed,
    lat: String(nearLat),
    lon: String(nearLon),
    limit: "5",
  })}`;

  const res = await fetch(url, signal ? { signal } : undefined);
  if (!res.ok) throw new Error("Search failed");
  const data = (await res.json()) as {
    features?: Array<{
      geometry: { coordinates: [number, number] };
      properties?: {
        name?: string;
        street?: string;
        district?: string;
        city?: string;
        county?: string;
        state?: string;
        country?: string;
      };
    }>;
  };

  const results: SearchResult[] = [];
  for (const feature of data.features || []) {
    const p = feature.properties || {};
    const [lon, lat] = feature.geometry.coordinates;
    const title = p.name || p.street || p.district || p.city || "Found location";
    const parts = [p.district, p.city || p.county, p.state, p.country].filter(
      (v) => v && v !== title,
    );
    results.push({
      title,
      subtitle: parts.length ? parts.join(", ") : `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`,
      latitude: lat,
      longitude: lon,
    });
  }
  return results;
}

async function lookupLandmark(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<{ title: string; subtitle: string }> {
  const url = `https://photon.komoot.io/reverse?${new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    lang: "en",
    limit: "1",
  })}`;
  const res = await fetch(url, signal ? { signal } : undefined);
  if (!res.ok) throw new Error("Lookup failed");
  const data = (await res.json()) as {
    features?: Array<{
      properties?: {
        name?: string;
        street?: string;
        district?: string;
        city?: string;
        county?: string;
        state?: string;
        country?: string;
      };
    }>;
  };
  const p = data.features?.[0]?.properties;
  if (!p) return { title: "Bukidnon Farmland", subtitle: `${lat.toFixed(4)}°, ${lon.toFixed(4)}°` };
  const title = p.name || p.street || p.district || p.city || "Detected Field";
  const parts = [p.city || p.county, p.state, p.country].filter((v) => v && v !== title);
  return {
    title,
    subtitle: parts.length ? parts.join(", ") : `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`,
  };
}

function createBaseLayer(L: Leaflet, style: MapStyle, onTileError: () => void): TileLayerInstance {
  if (style === "satellite") {
    return L.tileLayer("https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
      subdomains: ["0", "1", "2", "3"],
      maxNativeZoom: 20,
      maxZoom: 21,
      keepBuffer: 6,
      updateWhenZooming: false,
      updateWhenIdle: true,
      attribution: "Map data &copy; Google",
    }).on("tileerror", onTileError);
  }
  return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxNativeZoom: 19,
    maxZoom: 21,
    keepBuffer: 6,
    updateWhenZooming: false,
    updateWhenIdle: true,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).on("tileerror", onTileError);
}

function createHeatmapLayer(
  L: Leaflet,
  heatmap: Exclude<HeatmapLayer, "none">,
  onTileError: () => void,
): TileLayerInstance {
  const cfg = HEATMAP_LAYERS[heatmap];
  return L.tileLayer(cfg.url, {
    maxNativeZoom: cfg.maxNativeZoom,
    maxZoom: 21,
    opacity: 0.68,
    zIndex: 4,
    keepBuffer: 4,
    updateWhenZooming: false,
    updateWhenIdle: true,
    attribution: "NASA GIBS",
  }).on("tileerror", onTileError);
}

function isRepresentativePhoto(fileNameOrUrl: string): boolean {
  const lower = fileNameOrUrl.toLowerCase();
  if (lower.endsWith(".svg")) return false;
  return !/(flag_of_|seal_of_|coat_of_arms|locator_map|ph_locator|_map\.|blank_map)/.test(lower);
}

async function lookupLocationPhoto(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<{ url: string; label: string } | null> {
  try {
    const svRes = await fetch(
      `/api/streetview?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
      signal ? { signal } : undefined,
    );
    if (svRes.ok && svRes.headers.get("content-type")?.startsWith("image/")) {
      const blob = await svRes.blob();
      return { url: URL.createObjectURL(blob), label: "Street-level view nearby" };
    }
  } catch {
    if (signal?.aborted) return null;
  }

  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${lat}|${lon}&ggsradius=10000&ggslimit=8&prop=pageimages&pithumbsize=640&format=json&origin=*`;
    const res = await fetch(wikiUrl, signal ? { signal } : undefined);
    if (res.ok) {
      const data = (await res.json()) as {
        query?: {
          pages?: Record<
            string,
            { index?: number; title?: string; pageimage?: string; thumbnail?: { source?: string } }
          >;
        };
      };
      const pages = Object.values(data.query?.pages ?? {}).sort(
        (a, b) => (a.index ?? 99) - (b.index ?? 99),
      );
      for (const page of pages) {
        const src = page.thumbnail?.source;
        const name = page.pageimage || src || "";
        if (src && isRepresentativePhoto(name)) {
          return { url: src, label: page.title || "Nearby landmark" };
        }
      }
    }

    const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch&ggsnamespace=6&ggscoord=${lat}|${lon}&ggsradius=10000&ggslimit=6&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json&origin=*`;
    const cRes = await fetch(commonsUrl, signal ? { signal } : undefined);
    if (cRes.ok) {
      const cData = (await cRes.json()) as {
        query?: {
          pages?: Record<
            string,
            {
              index?: number;
              title?: string;
              imageinfo?: Array<{ thumburl?: string; url?: string }>;
            }
          >;
        };
      };
      const cPages = Object.values(cData.query?.pages ?? {}).sort(
        (a, b) => (a.index ?? 99) - (b.index ?? 99),
      );
      for (const page of cPages) {
        const src = page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url;
        const name = page.title || src || "";
        if (src && isRepresentativePhoto(name)) {
          return {
            url: src,
            label: (page.title || "Nearby area photo")
              .replace(/^File:/, "")
              .replace(/\.[^.]+$/, ""),
          };
        }
      }
    }
  } catch {
    // Fallback handled by caller
  }
  return null;
}

export type FarmProfileData = {
  place: string;
  area: string;
  crop: string;
  previous: string;
  ph: string;
  soil: string;
  irrigation: string;
  drainage: string;
  planted: string;
};

export function FullFarmMap({
  location,
  onChange,
  boundary,
  onBoundary,
  areaLabel,
  farm,
  onUpdateFarm,
  onPlannerResult,
  advisorOpen = false,
  advisorContent,
  onAskAdvisor,
  locationConfirmed = false,
  onContinue,
  onBrandClick,
  advisoryMode = "rotation",
  onAdvisoryModeChange,
  hazard = "Flooding",
  onHazardChange,
  affected = 65,
  onAffectedChange,
  yieldLoss = 35,
  onYieldLossChange,
  price = "17",
  onPriceChange,
  expectedYield = "4200",
  onExpectedYieldChange,
  damageDate = "2026-10-29",
  onDamageDateChange,
  legacyRecoveryContent,
  cardRecoveryContent,
  onOpenRecovery,
  historical = null,
  climateLoading = false,
  terrain = null,
  recoveryDetails,
}: {
  location: Coordinates;
  onChange: (point: Coordinates) => void;
  boundary: Coordinates[];
  onBoundary: (points: Coordinates[]) => void;
  areaLabel: string;
  farm: FarmProfileData;
  onUpdateFarm: (key: keyof FarmProfileData, value: string) => void;
  onPlannerResult?: (value: PlannerResult | null) => void;
  advisorOpen?: boolean;
  advisorContent?: ReactNode;
  onAskAdvisor?: () => void;
  locationConfirmed?: boolean;
  onContinue?: () => void;
  onBrandClick?: () => void;
  advisoryMode?: AdvisoryMode;
  onAdvisoryModeChange?: (mode: AdvisoryMode) => void;
  hazard?: HazardType;
  onHazardChange?: (hazard: HazardType) => void;
  affected?: number;
  onAffectedChange?: (value: number) => void;
  yieldLoss?: number;
  onYieldLossChange?: (value: number) => void;
  price?: string;
  onPriceChange?: (value: string) => void;
  expectedYield?: string;
  onExpectedYieldChange?: (value: string) => void;
  damageDate?: string;
  onDamageDateChange?: (value: string) => void;
  legacyRecoveryContent?: ReactNode;
  cardRecoveryContent?: ReactNode;
  onOpenRecovery?: () => void;
  historical?: HistoricalWeather | null;
  climateLoading?: boolean;
  terrain?: { elevation: number; slopePercent: number } | null;
  cropOptions?: readonly string[];
  previousCropOptions?: readonly string[];
  recoveryDetails?: {
    actualPlantingDate?: string;
    growthStage?: string;
    durationHours?: string;
    observations?: string;
  };
}) {
  const [mapStyle, setMapStyle] = useState<MapStyle>("satellite");
  const [heatmap, setHeatmap] = useState<HeatmapLayer>("none");
  const [layersOpen, setLayersOpen] = useState(false);
  const layersMenuRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<Coordinates[]>([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [landUseCheck, setLandUseCheck] = useState<LandUseCheckResult | null>(null);
  const [checkingLandUse, setCheckingLandUse] = useState(false);
  const [landUseBlockedMessage, setLandUseBlockedMessage] = useState("");
  const [landmark, setLandmark] = useState<LandmarkInfo | null>(null);
  const [landmarkLoading, setLandmarkLoading] = useState(false);
  const [radiusMeters, setRadiusMeters] = useState(100);
  const radiusRef = useRef(radiusMeters);
  radiusRef.current = radiusMeters;
  const [profileOpen, setProfileOpen] = useState(() => advisoryMode === "recovery");
  const [farmCardOpen, setFarmCardOpen] = useState(() => boundary.length >= 3);
  const [drawerTab, setDrawerTab] = useState<"rotation" | "recovery">(
    !ENABLE_RECOVERY_MODAL && advisoryMode === "recovery" ? "recovery" : "rotation",
  );
  const [printPlan, setPrintPlan] = useState<PlannerResult | null>(null);
  const [exportMode, setExportMode] = useState(false);
  const leftPanelRef = useRef<HTMLElement | null>(null);
  const rightPanelRef = useRef<HTMLElement | null>(null);
  const addressRef = useRef<HTMLTextAreaElement | null>(null);
  const [recoveryModalOpen, setRecoveryModalOpen] = useState(
    ENABLE_RECOVERY_MODAL && advisoryMode === "recovery",
  );
  const [localHazard, setLocalHazard] = useState<HazardType>(hazard);
  const [localAffected, setLocalAffected] = useState(affected);
  const [localYieldLoss, setLocalYieldLoss] = useState(yieldLoss);
  const [localPrice, setLocalPrice] = useState(price);
  const [localExpectedYield, setLocalExpectedYield] = useState(expectedYield);
  const [localDamageDate, setLocalDamageDate] = useState(damageDate);

  const activeHazard = onHazardChange ? hazard : localHazard;
  const setActiveHazard = onHazardChange ?? setLocalHazard;
  const activeAffected = onAffectedChange ? affected : localAffected;
  const setActiveAffected = onAffectedChange ?? setLocalAffected;
  const activeYieldLoss = onYieldLossChange ? yieldLoss : localYieldLoss;
  const setActiveYieldLoss = onYieldLossChange ?? setLocalYieldLoss;
  const activePrice = onPriceChange ? price : localPrice;
  const setActivePrice = onPriceChange ?? setLocalPrice;
  const activeExpectedYield = onExpectedYieldChange ? expectedYield : localExpectedYield;
  const setActiveExpectedYield = onExpectedYieldChange ?? setLocalExpectedYield;
  const activeDamageDate = onDamageDateChange ? damageDate : localDamageDate;
  const setActiveDamageDate = onDamageDateChange ?? setLocalDamageDate;

  useEffect(() => {
    if (advisoryMode === "recovery") {
      if (ENABLE_RECOVERY_MODAL) {
        setRecoveryModalOpen(true);
      } else {
        setDrawerTab("recovery");
      }
    } else {
      setRecoveryModalOpen(false);
      setDrawerTab("rotation");
    }
  }, [advisoryMode]);

  useEffect(() => {
    if (!recoveryModalOpen) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setRecoveryModalOpen(false);
        onAdvisoryModeChange?.("rotation");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [recoveryModalOpen, onAdvisoryModeChange]);
  const [modisNdvi, setModisNdvi] = useState<ModisNdviSeries | null>(null);
  const [ndviLoading, setNdviLoading] = useState(false);

  const climateSummary = historical ? summarizeWeather(historical.days) : null;
  const moisture = historical?.soilMoisturePercent ?? null;
  const surfaceTemp = historical?.surfaceTempC ?? climateSummary?.temperature ?? null;
  const rain30 = historical?.recent30dRainfallMm ?? climateSummary?.rainfall ?? null;

  // Stable identity: NextCropPlanner emits its result from an effect keyed on this callback.
  const handlePlannerResult = useCallback(
    (value: PlannerResult | null) => {
      setPrintPlan(value);
      onPlannerResult?.(value);
    },
    [onPlannerResult],
  );

  const printArea = Number(farm.area);
  const printYield = Number(activeExpectedYield);
  const printPrice = Number(activePrice);
  const printLoss =
    Number.isFinite(printArea) &&
    printArea >= 0 &&
    Number.isFinite(printYield) &&
    printYield >= 0 &&
    Number.isFinite(printPrice) &&
    printPrice >= 0
      ? calculateEstimatedLoss({
          areaHectares: printArea,
          affectedFraction: activeAffected / 100,
          expectedYieldKgPerHectare: printYield,
          yieldLossFraction: activeYieldLoss / 100,
          pricePerKg: printPrice,
        })
      : null;

  // Export waits one paint so the printable report exists before the print dialog snapshots it.
  useEffect(() => {
    if (!exportMode) return undefined;
    const originalTitle = document.title;
    document.title = "NASABUKID - Crop Rotation & Disaster Recovery Report";
    const timer = window.setTimeout(() => {
      window.print();
      document.title = originalTitle;
      setExportMode(false);
    }, 60);
    return () => {
      window.clearTimeout(timer);
      document.title = originalTitle;
    };
  }, [exportMode]);

  useEffect(() => {
    const controller = new AbortController();
    setNdviLoading(true);
    void fetchRecentModisNdvi(location, controller.signal).then((series) => {
      if (controller.signal.aborted) return;
      setModisNdvi(series);
      setNdviLoading(false);
    });
    return () => controller.abort();
  }, [location.latitude, location.longitude]);

  const hasValidBoundary = boundary.length >= 3;
  const landUseAllowed = !checkingLandUse && landUseCheck?.tier !== "hard_block";
  const leftCardVisible = !drawing && hasValidBoundary && farmCardOpen && landUseAllowed;
  const rightCardVisible = !drawing && profileOpen && landUseAllowed;
  const leftCardVisibleRef = useRef(leftCardVisible);
  const rightCardVisibleRef = useRef(rightCardVisible);
  leftCardVisibleRef.current = leftCardVisible;
  rightCardVisibleRef.current = rightCardVisible;
  const prevHasBoundaryRef = useRef(hasValidBoundary);

  useEffect(() => {
    if (hasValidBoundary && !prevHasBoundaryRef.current) {
      setFarmCardOpen(true);
    } else if (!hasValidBoundary) {
      setFarmCardOpen(false);
    }
    prevHasBoundaryRef.current = hasValidBoundary;
  }, [hasValidBoundary]);

  useEffect(() => {
    const el = addressRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [farm.place, leftCardVisible]);

  const [modalOffset, setModalOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    initX: number;
    initY: number;
  } | null>(null);

  // Location search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    const timer = setTimeout(() => {
      searchLocations(searchQuery, location.latitude, location.longitude, controller.signal)
        .then((items) => {
          if (!controller.signal.aborted) {
            setSearchResults(items);
            setSearching(false);
            setSearchOpen(true);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSearching(false);
          }
        });
    }, 280);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, location.latitude, location.longitude]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function getMapClearPadding(hasLeftCard: boolean, hasRightCard: boolean) {
    const containerW = containerRef.current?.clientWidth ?? 0;
    const isDesktop = containerW >= 768;
    if (!isDesktop) {
      return {
        paddingTopLeft: [24, 72] as [number, number],
        paddingBottomRight: [24, hasRightCard || hasLeftCard ? 280 : 110] as [number, number],
      };
    }
    const fallbackLeftW = Math.min(Math.max(containerW * 0.24, 300), 370);
    const fallbackRightW = Math.min(Math.max(containerW * 0.32 - 9, 390), 560);
    const leftCardW = hasLeftCard ? leftPanelRef.current?.offsetWidth || fallbackLeftW : 0;
    const rightCardW = hasRightCard ? rightPanelRef.current?.offsetWidth || fallbackRightW : 0;
    // Card edge inset (14px) + breathing room (34px) so the full selected boundary never collides with either card.
    const leftPad = hasLeftCard ? leftCardW + 48 : 36;
    const rightPad = hasRightCard ? rightCardW + 48 : 48;
    return {
      paddingTopLeft: [Math.round(leftPad), 92] as [number, number],
      paddingBottomRight: [Math.round(rightPad), 76] as [number, number],
    };
  }

  function framePointInClearArea(map: MapInstance, lat: number, lon: number, maxZoom = 18) {
    const delta = 0.0009;
    map.fitBounds(
      [
        [lat - delta, lon - delta],
        [lat + delta, lon + delta],
      ],
      {
        ...getMapClearPadding(leftCardVisibleRef.current, rightCardVisibleRef.current),
        maxZoom,
        animate: true,
      },
    );
  }

  function handleSelectLocation(result: SearchResult) {
    const next = { latitude: result.latitude, longitude: result.longitude };
    onChange(next);
    setSearchOpen(false);
    setSearchQuery(result.title);
    accuracyCircleRef.current?.setRadius(0);
    accuracyCircleRef.current?.setLatLng([next.latitude, next.longitude]);

    const map = mapRef.current;
    if (map) {
      framePointInClearArea(map, next.latitude, next.longitude, 16);
    }

    showLandmarkFor(next.latitude, next.longitude, "pin", null);
  }

  const handleModalDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: modalOffset.x,
      initY: modalOffset.y,
    };
    setIsDragging(true);
  };

  const handleModalDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    setModalOffset({
      x: dragStartRef.current.initX + dx,
      y: dragStartRef.current.initY + dy,
    });
  };

  const handleModalDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer capture may already be released when the drag ends.
    }
    dragStartRef.current = null;
    setIsDragging(false);
  };

  const drawingRef = useRef(false);
  drawingRef.current = drawing;
  const savedBoundary = useRef(boundary);
  savedBoundary.current = boundary;
  const visiblePoints = useRef(boundary);
  visiblePoints.current = drawing ? draft : boundary;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const locationRef = useRef(location);
  locationRef.current = location;
  const mapStyleRef = useRef(mapStyle);
  mapStyleRef.current = mapStyle;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const leafletRef = useRef<Leaflet | null>(null);
  const activeLayerRef = useRef<TileLayerInstance | null>(null);
  const heatmapLayerRef = useRef<TileLayerInstance | null>(null);
  const polygonRef = useRef<{
    setLatLngs: (points: [number, number][]) => void;
    setStyle?: (options: object) => void;
  } | null>(null);
  const markerRef = useRef<MarkerInstance | null>(null);
  const edgeMarkerRef = useRef<MarkerInstance | null>(null);
  const accuracyCircleRef = useRef<CircleInstance | null>(null);
  const lookupAbortRef = useRef<AbortController | null>(null);

  function showLandmarkFor(
    lat: number,
    lng: number,
    source: "gps" | "pin",
    accuracyMeters: number | null,
  ) {
    lookupAbortRef.current?.abort();
    const controller = new AbortController();
    lookupAbortRef.current = controller;

    setLandmarkLoading(true);
    setLandmark({
      title: source === "gps" ? "Finding nearby landmark…" : "Pinned location",
      subtitle: `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`,
      accuracyMeters,
      source,
    });

    Promise.all([
      lookupLandmark(lat, lng, controller.signal),
      lookupLocationPhoto(lat, lng, controller.signal),
    ])
      .then(([info, photo]) => {
        if (!controller.signal.aborted) {
          setLandmark({
            title: info.title,
            subtitle: info.subtitle,
            accuracyMeters,
            source,
            photoUrl: photo?.url,
            photoLabel: photo?.label,
          });
          setLandmarkLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLandmarkLoading(false);
        }
      });
  }

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    loadLeaflet()
      .then((L) => {
        if (disposed || !containerRef.current) return;
        leafletRef.current = L;
        const point: [number, number] = [
          locationRef.current.latitude,
          locationRef.current.longitude,
        ];
        const instance = L.map(containerRef.current, {
          scrollWheelZoom: true,
          zoomControl: false,
          preferCanvas: false,
          fadeAnimation: true,
          zoomAnimation: true,
        }).setView(point, 14);
        mapRef.current = instance;

        activeLayerRef.current = createBaseLayer(L, mapStyleRef.current, () => {
          if (!disposed) setError("Some map tiles could not load.");
        }).addTo(instance);

        polygonRef.current = L.polygon(
          visiblePoints.current.map((p) => [p.latitude, p.longitude]),
          {
            className: "full-map-plot-polygon",
            color: "#4ade80",
            weight: 3,
            fillColor: "#22c55e",
            fillOpacity: 0.3,
            lineJoin: "round",
            interactive: false,
          },
        ).addTo(instance);

        if (L.circle) {
          accuracyCircleRef.current = L.circle(point, {
            radius: radiusRef.current,
            color: "#22c55e",
            weight: 1.5,
            fillColor: "#4ade80",
            fillOpacity: 0.14,
            interactive: false,
          }).addTo(instance);
        }

        if (L.marker && L.divIcon) {
          const pinIcon = L.divIcon({
            className: "full-map-location-icon-wrap",
            html: `<div class="full-map-location-pin" aria-hidden="true"><span class="full-map-location-pulse"></span><span class="full-map-location-shadow"></span><span class="full-map-location-teardrop"><span class="full-map-location-core"></span></span></div>`,
            iconSize: [40, 48],
            iconAnchor: [20, 40],
          });
          const centerMarker = L.marker(point, {
            icon: pinIcon,
            interactive: true,
            draggable: true,
            zIndexOffset: 1000,
          }).addTo(instance);

          centerMarker.on?.("drag", () => {
            const latlng = centerMarker.getLatLng?.();
            if (!latlng) return;
            accuracyCircleRef.current?.setLatLng([latlng.lat, latlng.lng]);
            edgeMarkerRef.current?.setLatLng(getEastEdge(latlng, radiusRef.current));
          });

          centerMarker.on?.("dragend", () => {
            const latlng = centerMarker.getLatLng?.();
            if (!latlng) return;
            const moved = {
              latitude: Number(latlng.lat.toFixed(7)),
              longitude: Number(latlng.lng.toFixed(7)),
            };
            changeRef.current(moved);
            showLandmarkFor(moved.latitude, moved.longitude, "pin", radiusRef.current);
          });

          markerRef.current = centerMarker;

          const edgeIcon = L.divIcon({
            className: "radius-handle-pin-wrap",
            html: `<div class="radius-handle-pin" title="Drag to resize radius"></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          });
          const edgeMarker = L.marker(
            getEastEdge({ lat: point[0], lng: point[1] }, radiusRef.current),
            {
              icon: edgeIcon,
              interactive: true,
              draggable: true,
              zIndexOffset: 900,
            },
          ).addTo(instance);

          edgeMarker.on?.("drag", () => {
            const edgeLatLng = edgeMarker.getLatLng?.();
            const centerLatLng = centerMarker.getLatLng?.() ?? {
              lat: locationRef.current.latitude,
              lng: locationRef.current.longitude,
            };
            if (!edgeLatLng) return;
            const nextRadius = Math.max(
              15,
              Math.min(2000, Math.round(distanceMeters(centerLatLng, edgeLatLng))),
            );
            accuracyCircleRef.current?.setRadius(nextRadius);
            setRadiusMeters(nextRadius);
          });

          edgeMarkerRef.current = edgeMarker;
        } else if (L.circleMarker) {
          markerRef.current = L.circleMarker(point, {
            radius: 8,
            color: "#ffffff",
            weight: 2.5,
            fillColor: "#16a34a",
            fillOpacity: 1,
          }).addTo(instance);
        }

        if (visiblePoints.current.length >= 3) {
          instance.fitBounds(
            visiblePoints.current.map((p) => [p.latitude, p.longitude]),
            {
              ...getMapClearPadding(leftCardVisibleRef.current, rightCardVisibleRef.current),
              maxZoom: 19,
            },
          );
        }

        instance.on("click", (event) => {
          const clicked = {
            latitude: Number(event.latlng.lat.toFixed(7)),
            longitude: Number(event.latlng.lng.toFixed(7)),
          };
          if (drawingRef.current) {
            setDraft((points) => (points.length < 200 ? [...points, clicked] : points));
          } else if (!savedBoundary.current.length) {
            setError("");
            setLandUseBlockedMessage("");
            accuracyCircleRef.current?.setLatLng([clicked.latitude, clicked.longitude]);
            accuracyCircleRef.current?.setRadius(radiusRef.current);
            edgeMarkerRef.current?.setLatLng(
              getEastEdge({ lat: clicked.latitude, lng: clicked.longitude }, radiusRef.current),
            );
            changeRef.current(clicked);
            framePointInClearArea(instance, clicked.latitude, clicked.longitude, 16);
            showLandmarkFor(clicked.latitude, clicked.longitude, "pin", radiusRef.current);
          }
        });

        requestAnimationFrame(() => {
          if (!disposed) instance.invalidateSize(false);
        });
        if (typeof ResizeObserver !== "undefined" && containerRef.current) {
          resizeObserver = new ResizeObserver(() => {
            if (disposed) return;
            instance.invalidateSize(false);
            if (!drawingRef.current && savedBoundary.current.length >= 3) {
              instance.fitBounds(
                savedBoundary.current.map((p) => [p.latitude, p.longitude]),
                {
                  ...getMapClearPadding(leftCardVisibleRef.current, rightCardVisibleRef.current),
                  maxZoom: 19,
                  animate: false,
                },
              );
            }
          });
          resizeObserver.observe(containerRef.current);
        }

        setLoading(false);
      })
      .catch((reason) => {
        if (!disposed) {
          setLoading(false);
          setError(reason instanceof Error ? reason.message : "Map unavailable.");
        }
      });

    return () => {
      disposed = true;
      lookupAbortRef.current?.abort();
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      polygonRef.current = null;
      markerRef.current = null;
      accuracyCircleRef.current = null;
      activeLayerRef.current = null;
      heatmapLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    if (activeLayerRef.current) {
      map.removeLayer(activeLayerRef.current);
    }
    setError("");
    activeLayerRef.current = createBaseLayer(L, mapStyle, () => {
      setError("Some map tiles could not load.");
    }).addTo(map);
  }, [mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    if (heatmapLayerRef.current) {
      map.removeLayer(heatmapLayerRef.current);
      heatmapLayerRef.current = null;
    }
    if (heatmap !== "none") {
      heatmapLayerRef.current = createHeatmapLayer(L, heatmap, () => {
        setError("Some NASA heatmap tiles could not load at this zoom/area.");
      }).addTo(map);
    }

    const polygonStyles: Record<HeatmapLayer, { color: string; fillColor: string; fillOpacity: number; weight: number }> = {
      none: { color: "#4ade80", fillColor: "#22c55e", fillOpacity: 0.3, weight: 3 },
      soil_moisture: { color: "#38bdf8", fillColor: "#0284c7", fillOpacity: 0.42, weight: 3 },
      ndvi: { color: "#a3e635", fillColor: "#16a34a", fillOpacity: 0.42, weight: 3 },
      lst: { color: "#f59e0b", fillColor: "#ea580c", fillOpacity: 0.38, weight: 3 },
    };
    polygonRef.current?.setStyle?.(polygonStyles[heatmap]);
  }, [heatmap]);

  useEffect(() => {
    if (!layersOpen) return;
    function handleOutside(event: MouseEvent) {
      if (layersMenuRef.current && !layersMenuRef.current.contains(event.target as Node)) {
        setLayersOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setLayersOpen(false);
    }
    window.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleKey);
    };
  }, [layersOpen]);

  useEffect(() => {
    const point: [number, number] = [location.latitude, location.longitude];
    markerRef.current?.setLatLng(point);
    accuracyCircleRef.current?.setLatLng(point);
    accuracyCircleRef.current?.setRadius(radiusMeters);
    edgeMarkerRef.current?.setLatLng(
      getEastEdge({ lat: location.latitude, lng: location.longitude }, radiusMeters),
    );
  }, [location.latitude, location.longitude, radiusMeters]);

  useEffect(() => {
    polygonRef.current?.setLatLngs(
      (drawing ? draft : boundary).map((p) => [p.latitude, p.longitude]),
    );
    if (!drawing && boundary.length >= 3) {
      const id = requestAnimationFrame(() => {
        mapRef.current?.invalidateSize(false);
        mapRef.current?.fitBounds(
          boundary.map((p) => [p.latitude, p.longitude]),
          {
            ...getMapClearPadding(leftCardVisible, rightCardVisible),
            maxZoom: 19,
            animate: true,
          },
        );
      });
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [drawing, draft, boundary, leftCardVisible, rightCardVisible]);

  function applyDetectedPosition(pos: GeolocationPosition) {
    setLocating(false);
    const next = {
      latitude: Number(pos.coords.latitude.toFixed(7)),
      longitude: Number(pos.coords.longitude.toFixed(7)),
    };
    const accuracy = Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null;

    if (boundary.length > 0) {
      onBoundary([]);
    }
    onChange(next);
    const resolvedRadius = accuracy && accuracy >= 15 && accuracy <= 2000 ? accuracy : 35;
    setRadiusMeters(resolvedRadius);
    accuracyCircleRef.current?.setLatLng([next.latitude, next.longitude]);
    accuracyCircleRef.current?.setRadius(resolvedRadius);
    edgeMarkerRef.current?.setLatLng(
      getEastEdge({ lat: next.latitude, lng: next.longitude }, resolvedRadius),
    );

    const map = mapRef.current;
    if (map) {
      framePointInClearArea(map, next.latitude, next.longitude, 17);
    }

    if (accuracy !== null && accuracy > 1000) {
      setError(
        `Approximate network location (~${(accuracy / 1000).toFixed(1)} km). Click the map or search a Plus Code to set your exact pin.`,
      );
    }

    showLandmarkFor(next.latitude, next.longitude, "gps", accuracy);
  }

  function locateMe() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }
    setLocating(true);
    setError("");
    // Request a fresh high-accuracy fix first (maximumAge: 0 avoids stale IP/Wi-Fi caches)
    navigator.geolocation.getCurrentPosition(
      applyDetectedPosition,
      (err) => {
        if (err.code === 1) {
          setLocating(false);
          setError("Location permission denied. Allow location access or click the map.");
          return;
        }
        navigator.geolocation.getCurrentPosition(
          applyDetectedPosition,
          () => {
            setLocating(false);
            setError("Unable to detect your location. Click anywhere on the map to pin your farm.");
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 },
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  let draftArea = "";
  if (draft.length >= 3) {
    try {
      draftArea = `${measureFarmBoundary(draft).hectares.toFixed(4)} ha`;
    } catch {
      draftArea = "Needs correction";
    }
  }

  return (
    <div className={`full-map-shell ${drawing ? "full-map-drawing" : ""}`}>
      <div
        ref={containerRef}
        className="full-map-canvas"
        role="region"
        aria-label="Full-page interactive satellite farm map"
      />

      {loading && (
        <div className="full-map-loading" role="status">
          Loading interactive satellite map…
        </div>
      )}

      {/* Minimalist floating HUD — no bulky cards */}
      <div className="full-map-hud-top">
        <div className="full-map-hud-left">
          {onBrandClick && (
            <button
              type="button"
              className="glass-brand-pill"
              onClick={onBrandClick}
              title="Return to Overview"
            >
              <span className="glass-brand-mark">
                <Sprout size={16} strokeWidth={2} />
              </span>
              <span className="brand-name">
                <span className="brand-nasa">NASA</span>
                <span className="brand-bukid">BUKID</span>
              </span>
            </button>
          )}
          <div className="full-map-search-wrap" ref={searchWrapRef}>
            <div className="full-map-search-box">
              {searching ? (
                <Loader2 size={15} className="animate-spin text-muted-foreground flex-shrink-0" />
              ) : (
                <Search size={15} className="text-muted-foreground flex-shrink-0" />
              )}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => {
                  if (searchResults.length > 0) setSearchOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSearchOpen(false);
                  if (e.key === "Enter" && searchResults[0]) {
                    e.preventDefault();
                    handleSelectLocation(searchResults[0]);
                  }
                }}
                placeholder="Search municipality, barangay, or coords…"
                aria-label="Search map location"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="full-map-search-clear"
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                    setSearchOpen(false);
                  }}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {searchOpen && searchQuery.trim() && (
              <div className="full-map-search-dropdown" role="listbox">
                {searchResults.length > 0 ? (
                  searchResults.map((item, index) => (
                    <button
                      key={`${item.latitude}-${item.longitude}-${index}`}
                      type="button"
                      className="full-map-search-item"
                      role="option"
                      onClick={() => handleSelectLocation(item)}
                    >
                      <MapPin size={14} className="search-item-icon" />
                      <div>
                        <strong>{item.title}</strong>
                        <span>{item.subtitle}</span>
                      </div>
                    </button>
                  ))
                ) : !searching ? (
                  <div className="full-map-search-empty">
                    No matching places found. Try typing coordinates (e.g. 8.326, 124.978).
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="full-map-actions">
          <div className="full-map-layers-wrap" ref={layersMenuRef}>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              aria-haspopup="menu"
              aria-expanded={layersOpen}
              onClick={() => setLayersOpen((open) => !open)}
            >
              <Layers size={14} />
              <span>
                {mapStyle === "satellite" ? "Satellite" : "Street"}
                {heatmap !== "none" ? ` · ${HEATMAP_LAYERS[heatmap].short}` : ""}
              </span>
              <ChevronDown size={13} />
            </Button>

            {layersOpen && (
              <div
                className="full-map-layers-menu"
                role="menu"
                aria-label="Map layers and NASA heatmaps"
              >
                <div className="full-map-layers-section">Base map</div>
                {(
                  [
                    { id: "satellite", label: "Satellite" },
                    { id: "street", label: "Street Map" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={mapStyle === item.id}
                    className={`full-map-layers-item ${mapStyle === item.id ? "is-active" : ""}`}
                    onClick={() => {
                      setMapStyle(item.id);
                      setLayersOpen(false);
                    }}
                  >
                    <span>{item.label}</span>
                    {mapStyle === item.id && <Check size={14} />}
                  </button>
                ))}

                <div className="full-map-layers-divider" />
                <div className="full-map-layers-section">NASA GIBS heatmap</div>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={heatmap === "none"}
                  className={`full-map-layers-item ${heatmap === "none" ? "is-active" : ""}`}
                  onClick={() => {
                    setHeatmap("none");
                    setLayersOpen(false);
                  }}
                >
                  <span>Off</span>
                  {heatmap === "none" && <Check size={14} />}
                </button>
                {(Object.keys(HEATMAP_LAYERS) as Array<Exclude<HeatmapLayer, "none">>).map(
                  (key) => {
                    const cfg = HEATMAP_LAYERS[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        role="menuitemradio"
                        aria-checked={heatmap === key}
                        className={`full-map-layers-item ${heatmap === key ? "is-active" : ""}`}
                        onClick={() => {
                          setHeatmap(key);
                          setLayersOpen(false);
                        }}
                      >
                        <div>
                          <strong>{cfg.label}</strong>
                          <small>{cfg.detail}</small>
                        </div>
                        {heatmap === key && <Check size={14} />}
                      </button>
                    );
                  },
                )}
              </div>
            )}
          </div>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={locateMe}
            disabled={locating}
          >
            <Locate size={14} className={locating ? "animate-spin" : ""} />
            {locating ? "Locating…" : "Locate me"}
          </Button>

          {!drawing ? (
            <>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setDraft([]);
                  setError("");
                  setLandmark(null);
                  setDrawing(true);
                }}
                disabled={loading}
              >
                <Pencil size={14} />
                {boundary.length ? "Redraw boundary" : "Draw boundary"}
              </Button>
              {boundary.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    onBoundary([]);
                    setFarmCardOpen(false);
                    setProfileOpen(false);
                  }}
                >
                  <Trash2 size={14} />
                  Clear
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                disabled={draft.length < 3 || checkingLandUse}
                onClick={async () => {
                  try {
                    const measured = measureFarmBoundary(draft);
                    if (ENABLE_FARM_LOT_VERIFICATION) {
                      const centroid = {
                        latitude:
                          measured.points.reduce((sum, p) => sum + p.latitude, 0) /
                          measured.points.length,
                        longitude:
                          measured.points.reduce((sum, p) => sum + p.longitude, 0) /
                          measured.points.length,
                      };
                      setCheckingLandUse(true);
                      setLandUseBlockedMessage("");
                      const landUse = await checkFarmLandUse(centroid, undefined, measured.points);
                      setCheckingLandUse(false);
                      if (landUse.tier === "hard_block") {
                        setLandUseCheck(landUse);
                        setLandUseBlockedMessage(
                          landUse.message ??
                          "The selected area is invalid (urban structure, building, or water body detected). Please select an agricultural parcel.",
                        );
                        setFarmCardOpen(false);
                        setProfileOpen(false);
                        onBoundary([]);
                        return;
                      }
                      setLandUseCheck(landUse);
                    }
                    setLandUseBlockedMessage("");
                    onBoundary(measured.points);
                    setDrawing(false);
                    setFarmCardOpen(true);
                    setProfileOpen(true);
                    setError("");
                  } catch (err) {
                    setCheckingLandUse(false);
                    setError(err instanceof Error ? err.message : "Invalid boundary.");
                  }
                }}
              >
                {checkingLandUse ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {checkingLandUse ? "Checking lot…" : `Finish (${draft.length})`}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!draft.length}
                onClick={() => setDraft((pts) => pts.slice(0, -1))}
              >
                <RotateCcw size={14} />
                Undo
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setDrawing(false);
                  setDraft([]);
                  setError("");
                }}
              >
                <X size={14} />
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Left-side column: Farm Profile card + legend message + heatmap layer pills */}
      {!drawing && (
        <div className="full-map-left-stack">
          {leftCardVisible && (
            <aside
              ref={leftPanelRef}
              className="full-map-farm-card"
              aria-label="Farm profile"
            >
              <div className="full-map-farm-photo-wrap">
                <img
                  src={bukidnonFields}
                  alt={
                    farm.place && farm.place !== "Location not identified"
                      ? `Selected farm plot in ${farm.place}`
                      : "Selected farm plot"
                  }
                  className="full-map-farm-photo"
                />
                <button
                  type="button"
                  className="full-map-farm-photo-close"
                  aria-label="Close farm profile panel"
                  onClick={() => setFarmCardOpen(false)}
                >
                  <X size={14} />
                </button>
              </div>

              <h3 className="full-map-farm-title">Farm Profile</h3>

              <div className="full-map-profile-grid">
                <div className="form-field full-span">
                  <Label htmlFor="map-farm-location">Complete address (automatic, editable)</Label>
                  <textarea
                    ref={addressRef}
                    id="map-farm-location"
                    rows={1}
                    spellCheck={false}
                    className="full-map-address-textarea"
                    value={farm.place}
                    onChange={(e) => onUpdateFarm("place", e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <Label htmlFor="map-area-ha">Farm area (ha)</Label>
                  <div className="input-unit-wrap">
                    <Input id="map-area-ha" readOnly value={farm.area} />
                    <span>ha</span>
                  </div>
                </div>

                <div className="form-field">
                  <Label htmlFor="map-soil-type">Soil texture / type</Label>
                  <Input
                    id="map-soil-type"
                    value={farm.soil}
                    placeholder="Unavailable public estimate"
                    onChange={(e) => onUpdateFarm("soil", e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <Label htmlFor="map-soil-ph">Soil pH (water)</Label>
                  <Input
                    id="map-soil-ph"
                    type="number"
                    min="0"
                    max="14"
                    step="0.1"
                    placeholder="Unknown"
                    value={farm.ph}
                    onChange={(e) => onUpdateFarm("ph", e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <Label htmlFor="map-irrigation">Irrigation</Label>
                  <select
                    id="map-irrigation"
                    className="form-select"
                    value={farm.irrigation}
                    onChange={(e) => onUpdateFarm("irrigation", e.target.value)}
                  >
                    {["Unknown", "Rain-fed", "Gravity-fed", "Pump-irrigated", "Drip irrigation", "Other"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <Label htmlFor="map-drainage">Field drainage</Label>
                  <select
                    id="map-drainage"
                    className="form-select"
                    value={farm.drainage}
                    onChange={(e) => onUpdateFarm("drainage", e.target.value)}
                  >
                    {["Moderate", "Good", "Poor", "Unknown"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </div>
              </div>

              {(() => {
                const farmClimateSummary = historical ? summarizeWeather(historical.days) : null;
                const farmSlope = terrain?.slopePercent;
                const slopeStatus =
                  farmSlope === undefined
                    ? "Sampling terrain…"
                    : farmSlope > 15
                      ? `${farmSlope.toFixed(1)}% slope · Steep (erosion risk)`
                      : farmSlope > 8
                        ? `${farmSlope.toFixed(1)}% slope · Moderate`
                        : `${farmSlope.toFixed(1)}% slope · Suitable`;
                return (
                  <div
                    className="full-map-nasa-snapshot"
                    aria-label="NASA climate and terrain summary"
                  >
                    <div>
                      <span>NASA POWER (90d)</span>
                      <strong>
                        {climateLoading
                          ? "Fetching NASA climate…"
                          : farmClimateSummary
                            ? `${farmClimateSummary.temperature !== null ? `${farmClimateSummary.temperature.toFixed(1)}°C` : "—"} · ${farmClimateSummary.rainfall !== null ? `${Math.round(farmClimateSummary.rainfall)} mm rain` : "—"}`
                            : "Select area to load"}
                      </strong>
                    </div>
                    <div>
                      <span>Terrain &amp; Slope</span>
                      <strong>
                        {terrain
                          ? `${Math.round(terrain.elevation)} m · ${slopeStatus}`
                          : slopeStatus}
                      </strong>
                    </div>
                  </div>
                );
              })()}
            </aside>
          )}

          <div className="full-map-bottom-hud" aria-label="Map legend and layer switcher">
            {((hasValidBoundary && !farmCardOpen) || !profileOpen) && (
              <div className="full-map-reopen-row">
                {hasValidBoundary && !farmCardOpen && (
                  <button
                    type="button"
                    className="full-map-hud-reopen-btn"
                    onClick={() => setFarmCardOpen(true)}
                  >
                    <MapPin size={13} />
                    <span>Open Farm Profile</span>
                  </button>
                )}
                {!profileOpen && (
                  <button
                    type="button"
                    className="full-map-hud-reopen-btn"
                    onClick={() => setProfileOpen(true)}
                  >
                    {drawerTab === "recovery" ? <ShieldAlert size={13} /> : <Sprout size={13} />}
                    <span>{drawerTab === "recovery" ? "Open Recovery" : "Open Advisory"}</span>
                  </button>
                )}
              </div>
            )}
            <div className="full-map-legend-card" role="status" aria-live="polite">
              <div className="full-map-legend-head">
                <span
                  className={`full-map-legend-title ${heatmap === "soil_moisture"
                    ? "is-smap"
                    : heatmap === "ndvi"
                      ? "is-ndvi"
                      : heatmap === "lst"
                        ? "is-lst"
                        : "is-truecolor"
                    }`}
                >
                  <span className="full-map-legend-dot" aria-hidden="true" />
                  {heatmap === "soil_moisture"
                    ? "SOIL MOISTURE"
                    : heatmap === "ndvi"
                      ? "PLANT HEALTH"
                      : heatmap === "lst"
                        ? "GROUND HEAT"
                        : "YOUR FARM FIELD"}
                </span>
                <span className="full-map-legend-source">
                  {heatmap === "soil_moisture"
                    ? "NASA Soil Data"
                    : heatmap === "ndvi"
                      ? "NASA Greenness"
                      : heatmap === "lst"
                        ? "NASA Heat Map"
                        : "Satellite View"}
                </span>
              </div>
              <p className="full-map-legend-desc">
                {heatmap === "soil_moisture"
                  ? `Soil moisture is ${moisture !== null ? `${moisture}%` : "loading"}. Shows how wet or dry the topsoil is.`
                  : heatmap === "ndvi"
                    ? `Plant greenness is ${modisNdvi?.latestNdvi !== null && modisNdvi?.latestNdvi !== undefined
                      ? modisNdvi.latestNdvi.toFixed(2)
                      : "loading"
                    } for your field. Higher means greener plants.`
                    : heatmap === "lst"
                      ? `Ground temperature is ${surfaceTemp !== null ? `${surfaceTemp.toFixed(1)}°C` : "loading"
                      }. Shows how warm the soil surface is.`
                      : `Showing your farm boundary${farm.place && farm.place !== "Location not identified" ? ` in ${farm.place}` : ""
                      }. Tap a layer below to check soil moisture or plant health.`}
              </p>
              {heatmap !== "none" && (
                <div className="full-map-legend-scale">
                  <div
                    className="full-map-legend-bar"
                    style={{
                      background:
                        heatmap === "ndvi"
                          ? "linear-gradient(90deg, #ef4444, #facc15, #16a34a)"
                          : heatmap === "soil_moisture"
                            ? "linear-gradient(90deg, #fbbf24, #38bdf8, #1d4ed8)"
                            : HEATMAP_LAYERS[heatmap].gradient,
                    }}
                  />
                  <div className="full-map-legend-ticks">
                    {heatmap === "ndvi" ? (
                      <>
                        <span>0.15 Bare Soil</span>
                        <span>0.50 Growing</span>
                        <span>0.85 Lush &amp; Green</span>
                      </>
                    ) : heatmap === "soil_moisture" ? (
                      <>
                        <span>10% Dry</span>
                        <span>35% Just Right</span>
                        <span>60% Very Wet</span>
                      </>
                    ) : (
                      <>
                        <span>Cool</span>
                        <span>Warm</span>
                        <span>Hot</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="full-map-layer-pills" role="group" aria-label="Map view mode">
              <button
                type="button"
                className={`full-map-layer-pill ${heatmap === "none" ? "is-active" : ""}`}
                aria-pressed={heatmap === "none"}
                onClick={() => setHeatmap("none")}
              >
                <Globe size={13} />
                <span>Field View</span>
              </button>
              <button
                type="button"
                className={`full-map-layer-pill ${heatmap === "soil_moisture" ? "is-active" : ""}`}
                aria-pressed={heatmap === "soil_moisture"}
                onClick={() => setHeatmap("soil_moisture")}
              >
                <Droplets size={13} className="text-sky-600" />
                <span>Soil Moisture</span>
              </button>
              <button
                type="button"
                className={`full-map-layer-pill ${heatmap === "ndvi" ? "is-active" : ""}`}
                aria-pressed={heatmap === "ndvi"}
                onClick={() => setHeatmap("ndvi")}
              >
                <Activity size={13} className="text-emerald-600" />
                <span>Plant Health</span>
              </button>
              <button
                type="button"
                className={`full-map-layer-pill ${heatmap === "lst" ? "is-active" : ""}`}
                aria-pressed={heatmap === "lst"}
                onClick={() => setHeatmap("lst")}
              >
                <ThermometerSun size={13} className="text-amber-600" />
                <span>Ground Heat</span>
              </button>
            </div>
          </div>
        </div>
      )
      }

      {/* Right-side Crop Rotation & Disaster Recovery Drawer */}
      {
        rightCardVisible && (
          <aside
            ref={rightPanelRef}
            className={`full-map-profile-panel ${advisorOpen ? "is-advisor" : ""}`}
            aria-label="Crop rotation and disaster recovery"
          >
            <div className="full-map-advisory-content" hidden={advisorOpen}>
            <div className="full-map-profile-head">
              <div>
                <div className="drawer-badges-row">
                  <span className="drawer-badge-nasa">
                    {drawerTab === "recovery"
                      ? "HISTORICAL EVENT CONTEXT"
                      : "NASA POWER · 10-YEAR HISTORY"}
                  </span>
                  <span className="drawer-badge-engine">
                    {drawerTab === "recovery" ? "Recovery Planning" : "Crop Planning"}
                  </span>
                  {historical?.sourceUrl && (
                    <a
                      href={historical.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="drawer-verify-link"
                    >
                      Verify NASA Data <ExternalLink size={11} />
                    </a>
                  )}
                </div>
                <h3>
                  {drawerTab === "recovery"
                    ? "Disaster Recovery & Loss Check"
                    : "Crop Rotation & Land Advisory"}
                </h3>
              </div>
              <div className="full-map-profile-head-right">
                <button
                  type="button"
                  className="full-map-export-pdf-btn"
                  title="Export the rotation result and disaster recovery loss check as one PDF"
                  onClick={() => setExportMode(true)}
                >
                  <FileDown size={13} />
                  <span>Export PDF</span>
                </button>
                <button
                  type="button"
                  className="full-map-profile-close"
                  aria-label="Close advisory panel"
                  onClick={() => setProfileOpen(false)}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="drawer-tab-bar" role="tablist" aria-label="Drawer view">
              <button
                type="button"
                role="tab"
                aria-selected={!recoveryModalOpen && drawerTab === "rotation"}
                className={!recoveryModalOpen && drawerTab === "rotation" ? "is-active" : ""}
                onClick={() => {
                  setRecoveryModalOpen(false);
                  setDrawerTab("rotation");
                  onAdvisoryModeChange?.("rotation");
                }}
              >
                Crop Rotation
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={ENABLE_RECOVERY_MODAL ? recoveryModalOpen : drawerTab === "recovery"}
                className={
                  (ENABLE_RECOVERY_MODAL ? recoveryModalOpen : drawerTab === "recovery")
                    ? "is-active"
                    : ""
                }
                onClick={() => {
                  onOpenRecovery?.();
                  if (ENABLE_RECOVERY_MODAL) {
                    setRecoveryModalOpen(true);
                  } else {
                    setDrawerTab("recovery");
                  }
                  onAdvisoryModeChange?.("recovery");
                }}
              >
                Disaster Recovery
              </button>
            </div>

            {drawerTab === "recovery" ? (
              (() => {
                const moistureTag =
                  moisture === null ? "Loading" : moisture < 20 ? "Dry" : moisture > 65 ? "Very Wet" : "Just Right";
                const parsedArea = Number(farm.area);
                const parsedYield = Number(activeExpectedYield);
                const parsedPrice = Number(activePrice);
                const validRecoveryInputs =
                  Number.isFinite(parsedArea) &&
                  parsedArea >= 0 &&
                  Number.isFinite(parsedYield) &&
                  parsedYield >= 0 &&
                  Number.isFinite(parsedPrice) &&
                  parsedPrice >= 0;
                const estimatedLoss = validRecoveryInputs
                  ? calculateEstimatedLoss({
                    areaHectares: parsedArea,
                    affectedFraction: activeAffected / 100,
                    expectedYieldKgPerHectare: parsedYield,
                    yieldLossFraction: activeYieldLoss / 100,
                    pricePerKg: parsedPrice,
                  })
                  : 0;
                const hazardMeta = RECOVERY_HAZARDS[activeHazard];

                if (!SHOW_COMPACT_RECOVERY_UI && cardRecoveryContent) {
                  return (
                    <div className="drawer-card-recovery-wrap">{cardRecoveryContent}</div>
                  );
                }

                return (
                  <div className="drawer-rotation-body">
                    <div className="drawer-telemetry-grid" aria-label="Farm weather and soil summary">
                      <button
                        type="button"
                        className={`telemetry-tile is-smap is-action ${heatmap === "soil_moisture" ? "is-on" : ""}`}
                        aria-pressed={heatmap === "soil_moisture"}
                        title="Show soil moisture on the map"
                        onClick={() => setHeatmap(heatmap === "soil_moisture" ? "none" : "soil_moisture")}
                      >
                        <div className="telemetry-tile-head">
                          <Droplets size={14} />
                          <span>MOISTURE</span>
                        </div>
                        <strong>{climateLoading ? "…" : moisture !== null ? `${moisture}%` : "—"}</strong>
                        <small>{moistureTag}</small>
                      </button>
                      <button
                        type="button"
                        className={`telemetry-tile is-modis is-action ${heatmap === "lst" ? "is-on" : ""}`}
                        aria-pressed={heatmap === "lst"}
                        title="Show ground heat on the map"
                        onClick={() => setHeatmap(heatmap === "lst" ? "none" : "lst")}
                      >
                        <div className="telemetry-tile-head">
                          <ThermometerSun size={14} />
                          <span>HEAT</span>
                        </div>
                        <strong>
                          {climateLoading
                            ? "…"
                            : surfaceTemp !== null
                              ? `${surfaceTemp.toFixed(1)}°C`
                              : "—"}
                        </strong>
                        <small>Ground Temp</small>
                      </button>
                      <div className="telemetry-tile is-gpm">
                        <div className="telemetry-tile-head">
                          <CloudRain size={14} />
                          <span>RAIN</span>
                        </div>
                        <strong>{climateLoading ? "…" : rain30 !== null ? `${Math.round(rain30)}mm` : "—"}</strong>
                        <small>Last 30 Days</small>
                      </div>
                      <button
                        type="button"
                        className={`telemetry-tile is-ndvi is-action ${heatmap === "ndvi" ? "is-on" : ""}`}
                        aria-pressed={heatmap === "ndvi"}
                        title="Show plant health on the map"
                        onClick={() => setHeatmap(heatmap === "ndvi" ? "none" : "ndvi")}
                      >
                        <div className="telemetry-tile-head">
                          <Sprout size={14} />
                          <span>HEALTH</span>
                        </div>
                        <strong>
                          {ndviLoading
                            ? "…"
                            : modisNdvi?.latestNdvi !== null && modisNdvi?.latestNdvi !== undefined
                              ? modisNdvi.latestNdvi.toFixed(2)
                              : heatmap === "ndvi"
                                ? "On"
                                : "—"}
                        </strong>
                        <small>Greenness</small>
                      </button>
                    </div>

                    {!SHOW_COMPACT_RECOVERY_UI && legacyRecoveryContent && (
                      <div className="drawer-legacy-recovery">{legacyRecoveryContent}</div>
                    )}

                    {SHOW_COMPACT_RECOVERY_UI && (
                      <>
                        <div className="drawer-recovery-section">
                          <div className="drawer-sequence-heading">WHAT HAPPENED ON THIS FIELD?</div>
                          <div className="drawer-hazard-grid" role="group" aria-label="Select event type">
                            {(Object.keys(RECOVERY_HAZARDS) as HazardType[]).map((item) => {
                              const Icon = RECOVERY_HAZARDS[item].icon;
                              const active = activeHazard === item;
                              return (
                                <button
                                  key={item}
                                  type="button"
                                  className={`drawer-hazard-btn ${active ? "is-active" : ""}`}
                                  aria-pressed={active}
                                  onClick={() => setActiveHazard(item)}
                                >
                                  <Icon size={15} />
                                  <span>{item}</span>
                                </button>
                              );
                            })}
                          </div>
                          <p className="drawer-recovery-note">{hazardMeta.summary}</p>
                        </div>

                        <div className="drawer-recovery-loss-box">
                          <div className="drawer-recovery-loss-head">
                            <span>ESTIMATED INCOME AT RISK · DEMO</span>
                            <strong>
                              {validRecoveryInputs ? `${PHP_FORMATTER.format(estimatedLoss)} PHP` : "Check inputs"}
                            </strong>
                          </div>
                          <div className="drawer-recovery-sliders">
                            <label className="drawer-range-field">
                              <div>
                                <span>Area affected</span>
                                <b>{activeAffected}%</b>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={activeAffected}
                                onChange={(e) => setActiveAffected(Number(e.target.value))}
                              />
                            </label>
                            <label className="drawer-range-field">
                              <div>
                                <span>Expected yield loss</span>
                                <b>{activeYieldLoss}%</b>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={activeYieldLoss}
                                onChange={(e) => setActiveYieldLoss(Number(e.target.value))}
                              />
                            </label>
                          </div>
                          <div className="drawer-recovery-inputs">
                            <div className="form-field">
                              <Label htmlFor="drawer-damage-date">Event date</Label>
                              <Input
                                id="drawer-damage-date"
                                type="date"
                                value={activeDamageDate}
                                onChange={(e) => setActiveDamageDate(e.target.value)}
                              />
                            </div>
                            <div className="form-field">
                              <Label htmlFor="drawer-recovery-area">Area (ha)</Label>
                              <Input
                                id="drawer-recovery-area"
                                type="number"
                                min="0"
                                step="any"
                                value={farm.area}
                                onChange={(e) => onUpdateFarm("area", e.target.value)}
                              />
                            </div>
                            <div className="form-field">
                              <Label htmlFor="drawer-yield-est">Yield (kg/ha)</Label>
                              <Input
                                id="drawer-yield-est"
                                type="number"
                                min="0"
                                step="any"
                                value={activeExpectedYield}
                                onChange={(e) => setActiveExpectedYield(e.target.value)}
                              />
                            </div>
                            <div className="form-field">
                              <Label htmlFor="drawer-price-est">Price (₱/kg)</Label>
                              <Input
                                id="drawer-price-est"
                                type="number"
                                min="0"
                                step="any"
                                value={activePrice}
                                onChange={(e) => setActivePrice(e.target.value)}
                              />
                            </div>
                          </div>
                          <small className="drawer-recovery-foot">
                            Sample calculation ({farm.area} ha × {activeAffected}% × {activeYieldLoss}% ×{" "}
                            {activeExpectedYield} kg/ha × ₱{activePrice}/kg). Not a verified claim.
                          </small>
                        </div>

                        <div className="drawer-recovery-section">
                          <div className="drawer-sequence-heading">POSSIBLE NEXT STEPS · {activeHazard.toUpperCase()}</div>
                          <ol className="drawer-recovery-steps">
                            {RECOVERY_STEPS[activeHazard].map((step, index) => (
                              <li key={step}>
                                <span>{index + 1}</span>
                                <p>{step}</p>
                              </li>
                            ))}
                          </ol>
                        </div>

                        <div className="drawer-recovery-replant">
                          <div className="drawer-recovery-replant-head">
                            <ShieldCheck size={14} />
                            <span>FAST REPLANTING NOTE</span>
                          </div>
                          <p>{hazardMeta.replantNote}</p>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()
            ) : (
              <NextCropPlanner
                location={location}
                locationConfirmed={locationConfirmed}
                farm={farm}
                onUpdate={onUpdateFarm}
                terrain={terrain}
                onResult={handlePlannerResult}
                onAskAdvisor={onAskAdvisor}
              />
            )}

            {drawerTab !== "recovery" && onContinue && (
              <div className="full-map-profile-foot">
                <Button type="button" size="sm" onClick={onContinue}>
                  Continue to crop planning <ArrowRight size={14} />
                </Button>
              </div>
            )}
            </div>
            {advisorContent}
          </aside>
        )}

      {/* Floating Landmark / Location Preview Modal */}
      {
        landmark && !drawing && (
          <div
            className={`landmark-modal ${isDragging ? "is-dragging" : ""}`}
            role="dialog"
            aria-label="Detected location landmark"
            style={
              {
                "--drag-x": `${modalOffset.x}px`,
                "--drag-y": `${modalOffset.y}px`,
              } as React.CSSProperties
            }
          >
            <div
              className="landmark-drag-header"
              onPointerDown={handleModalDragStart}
              onPointerMove={handleModalDragMove}
              onPointerUp={handleModalDragEnd}
              onPointerCancel={handleModalDragEnd}
              title="Drag to reposition modal"
            >
              <GripHorizontal size={14} />
              <span>Drag to move</span>
            </div>
            <button
              type="button"
              className="landmark-close"
              aria-label="Close landmark preview"
              onClick={() => {
                setLandmark(null);
                setModalOffset({ x: 0, y: 0 });
              }}
            >
              <X size={14} />
            </button>
            <div className="landmark-image-wrap">
              <img
                src={landmark.photoUrl || bukidnonFields}
                alt={landmark.photoLabel || "Representative photo of selected area"}
                title={landmark.photoLabel || "Representative area photo"}
                onError={(e) => {
                  if (e.currentTarget.src !== bukidnonFields) {
                    e.currentTarget.src = bukidnonFields;
                  }
                }}
              />
              <span className="landmark-badge">
                <Navigation size={11} />
                {landmark.source === "gps" ? "YOUR GPS LOCATION" : "PINNED LANDMARK"}
              </span>
              {landmark.accuracyMeters !== null && (
                <span className="landmark-accuracy">±{landmark.accuracyMeters} m</span>
              )}
            </div>
            <div className="landmark-body">
              <strong>{landmarkLoading ? "Identifying landmark…" : landmark.title}</strong>
              <span>{landmark.subtitle}</span>
              <div className="landmark-meta">
                <span>
                  {location.latitude.toFixed(5)}°, {location.longitude.toFixed(5)}°
                </span>
              </div>
              <div className="landmark-radius-control">
                <div className="landmark-radius-row">
                  <label htmlFor="landmark-radius-range">Area radius (drag pin or edge)</label>
                  <span>
                    {radiusMeters} m (≈ {((Math.PI * radiusMeters * radiusMeters) / 10000).toFixed(2)}{" "}
                    ha)
                  </span>
                </div>
                <input
                  id="landmark-radius-range"
                  type="range"
                  min={15}
                  max={1000}
                  step={5}
                  value={Math.min(1000, radiusMeters)}
                  onChange={(e) => setRadiusMeters(Number(e.target.value))}
                  className="landmark-slider"
                />
              </div>
              <div className="landmark-footer">
                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setLandmark(null);
                    setDraft([]);
                    setDrawing(true);
                  }}
                >
                  <Pencil size={13} />
                  Draw farm boundary here
                </Button>
              </div>
            </div>
          </div>
        )
      }

      {/* Bottom-right coordinates & area pill */}
      {
        !drawing && (
          <div
            className={`full-map-coords-pill ${rightCardVisible ? "is-shifted" : ""}`}
            aria-label="Selected field coordinates and area"
          >
            <MapPin size={13} />
            <span>
              {location.latitude.toFixed(5)}°, {location.longitude.toFixed(5)}°
            </span>
            <span className="full-map-coords-sep" aria-hidden="true">•</span>
            <span>
              {boundary.length >= 3
                ? (() => {
                  try {
                    return `${measureFarmBoundary(boundary).hectares.toFixed(4)} ha`;
                  } catch {
                    return "Invalid area";
                  }
                })()
                : `${((Math.PI * radiusMeters * radiusMeters) / 10000).toFixed(2)} ha`}
            </span>
          </div>
        )
      }

      {/* Bottom-right zoom controls */}
      <div className={`full-map-zoom ${rightCardVisible ? "is-shifted" : ""}`}>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          aria-label="Zoom in"
          onClick={() => mapRef.current?.zoomIn()}
        >
          <ZoomIn size={16} />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          aria-label="Zoom out"
          onClick={() => mapRef.current?.zoomOut()}
        >
          <ZoomOut size={16} />
        </Button>
      </div>

      {/* Large centered Disaster Recovery modal with backdrop overlay (preserved, hidden for now) */}
      {
        ENABLE_RECOVERY_MODAL && recoveryModalOpen && legacyRecoveryContent && (
          <div
            className="full-map-recovery-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recovery-modal-title"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setRecoveryModalOpen(false);
                onAdvisoryModeChange?.("rotation");
              }
            }}
          >
            <div className="full-map-recovery-modal">
              <div className="full-map-recovery-modal-head">
                <div>
                  <div className="drawer-badges-row">
                    <span className="drawer-badge-nasa">REGIONAL DATA · DEMO ESTIMATE</span>
                    <span className="drawer-badge-engine">Recovery Engine</span>
                    {farm.place && farm.place !== "Location not identified" && (
                      <span className="full-map-recovery-place">
                        <MapPin size={11} />
                        {farm.place}
                      </span>
                    )}
                  </div>
                  <h2 id="recovery-modal-title">Disaster Recovery &amp; Loss Check</h2>
                </div>
                <button
                  type="button"
                  className="full-map-recovery-close"
                  aria-label="Close disaster recovery modal"
                  onClick={() => {
                    setRecoveryModalOpen(false);
                    onAdvisoryModeChange?.("rotation");
                  }}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="full-map-recovery-modal-body">
                {legacyRecoveryContent}
              </div>
            </div>
          </div>
        )
      }

      {/* Centered Farm Lot Verification Loading / Restriction Modal */}
      {
        ENABLE_FARM_LOT_VERIFICATION && (checkingLandUse || landUseBlockedMessage) && (
          <div
            className={`full-map-center-modal ${landUseBlockedMessage ? "is-error" : ""}`}
            role={landUseBlockedMessage ? "alertdialog" : "status"}
            aria-live="polite"
          >
            {checkingLandUse ? (
              <>
                <Loader2 size={26} className="animate-spin" />
                <strong>Verifying farm lot…</strong>
                <span>Checking NASA MODIS NDVI, soil profile, and terrain</span>
              </>
            ) : (
              <>
                <strong>Selected Area Is Invalid</strong>
                <p>{landUseBlockedMessage}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setLandUseBlockedMessage("");
                    setDraft([]);
                    setDrawing(false);
                  }}
                >
                  Select Another Lot
                </Button>
              </>
            )}
          </div>
        )
      }

      {/* Status / error toast */}
      {
        (drawing || error) && (
          <div
            className={`full-map-hud-bottom ${error ? "is-error" : ""}`}
            role={error ? "alert" : "status"}
          >
            {error
              ? error
              : "Click corners on the satellite image to outline your field, then click Finish."}
          </div>
        )
      }
      {/* Printable-only report: hidden on screen, shown by @media print in styles.css */}
      {exportMode ? (
        <PrintReport
          farm={farm}
          location={location}
          terrain={terrain}
          historical={historical}
          ndvi={modisNdvi?.latestNdvi ?? null}
          plan={printPlan}
          recovery={{
            hazard: activeHazard,
            damageDate: activeDamageDate,
            actualPlantingDate: recoveryDetails?.actualPlantingDate ?? "",
            growthStage: recoveryDetails?.growthStage ?? "",
            durationHours: recoveryDetails?.durationHours ?? "",
            observations: recoveryDetails?.observations ?? "",
            affected: activeAffected,
            yieldLoss: activeYieldLoss,
            expectedYield: activeExpectedYield,
            price: activePrice,
            area: farm.area,
            loss: printLoss,
            replantNote: RECOVERY_HAZARDS[activeHazard].replantNote,
            steps: RECOVERY_STEPS[activeHazard],
          }}
        />
      ) : null}
    </div >
  );
}
