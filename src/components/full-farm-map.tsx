import { useEffect, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, Check, ChevronDown, ExternalLink, GripHorizontal, Layers, Loader2, Locate, MapPin, Navigation, Pencil, RotateCcw, Search, Sprout, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import bukidnonFields from "@/assets/bukidnon-fields.jpg";
import { Button } from "@/components/ui/button";
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
import { buildRotationStrategies, getCropProfile } from "@/lib/fieldshift-demo";
import { summarizeWeather, type Coordinates, type HistoricalWeather } from "@/lib/nasa-power";

type MapStyle = "satellite" | "street";
type HeatmapLayer = "none" | "lst" | "soil_moisture" | "ndvi";

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

async function searchLocations(
  query: string,
  nearLat: number,
  nearLon: number,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

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

async function lookupLandmark(lat: number, lon: number, signal?: AbortSignal): Promise<{ title: string; subtitle: string }> {
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
      keepBuffer: 4,
      updateWhenZooming: false,
      attribution: "Map data &copy; Google",
    }).on("tileerror", onTileError);
  }
  return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxNativeZoom: 19,
    maxZoom: 21,
    keepBuffer: 4,
    updateWhenZooming: false,
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
    keepBuffer: 2,
    updateWhenZooming: false,
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
            { index?: number; title?: string; imageinfo?: Array<{ thumburl?: string; url?: string }> }
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
            label: (page.title || "Nearby area photo").replace(/^File:/, "").replace(/\.[^.]+$/, ""),
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

const DEFAULT_CROP_OPTIONS = [
  "Pineapple",
  "Banana",
  "Sugar Cane",
  "Corn",
  "Rice",
  "Mungbean",
  "Sweet potato",
  "Cassava",
] as const;
const DEFAULT_PREVIOUS_CROP_OPTIONS = [...DEFAULT_CROP_OPTIONS, "Fallow"] as const;

export function FullFarmMap({
  location,
  onChange,
  boundary,
  onBoundary,
  areaLabel,
  farm,
  onUpdateFarm,
  onContinue,
  historical = null,
  climateLoading = false,
  terrain = null,
  cropOptions = DEFAULT_CROP_OPTIONS,
  previousCropOptions = DEFAULT_PREVIOUS_CROP_OPTIONS,
}: {
  location: Coordinates;
  onChange: (point: Coordinates) => void;
  boundary: Coordinates[];
  onBoundary: (points: Coordinates[]) => void;
  areaLabel: string;
  farm: FarmProfileData;
  onUpdateFarm: (key: keyof FarmProfileData, value: string) => void;
  onContinue: () => void;
  historical?: HistoricalWeather | null;
  climateLoading?: boolean;
  terrain?: { elevation: number; slopePercent: number } | null;
  cropOptions?: readonly string[];
  previousCropOptions?: readonly string[];
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
  const [landmark, setLandmark] = useState<LandmarkInfo | null>(null);
  const [landmarkLoading, setLandmarkLoading] = useState(false);
  const [radiusMeters, setRadiusMeters] = useState(100);
  const radiusRef = useRef(radiusMeters);
  radiusRef.current = radiusMeters;
  const [profileOpen, setProfileOpen] = useState(boundary.length >= 3);
  const [drawerTab, setDrawerTab] = useState<"rotation" | "profile">("rotation");
  const [expandedStrategyId, setExpandedStrategyId] = useState<string>("legume-break");
  const [detailTab, setDetailTab] = useState<"proscons" | "pests">("proscons");
  const [modalOffset, setModalOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);

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

  function getLeftAreaPadding(rightPanelVisible: boolean) {
    const isDesktop = (containerRef.current?.clientWidth ?? 0) >= 768;
    if (isDesktop && rightPanelVisible) {
      return {
        paddingTopLeft: [48, 84] as [number, number],
        paddingBottomRight: [490, 44] as [number, number],
      };
    }
    return {
      paddingTopLeft: [36, 72] as [number, number],
      paddingBottomRight: [36, 36] as [number, number],
    };
  }

  function framePointInLeftArea(map: MapInstance, lat: number, lon: number, maxZoom = 18) {
    const delta = 0.0009;
    map.fitBounds(
      [
        [lat - delta, lon - delta],
        [lat + delta, lon + delta],
      ],
      { ...getLeftAreaPadding(true), maxZoom, animate: true },
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
      framePointInLeftArea(map, next.latitude, next.longitude, 16);
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
    } catch {}
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
  const polygonRef = useRef<{ setLatLngs: (points: [number, number][]) => void } | null>(null);
  const markerRef = useRef<MarkerInstance | null>(null);
  const edgeMarkerRef = useRef<MarkerInstance | null>(null);
  const accuracyCircleRef = useRef<CircleInstance | null>(null);
  const lookupAbortRef = useRef<AbortController | null>(null);

  function showLandmarkFor(lat: number, lng: number, source: "gps" | "pin", accuracyMeters: number | null) {
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
        const point: [number, number] = [locationRef.current.latitude, locationRef.current.longitude];
        const instance = L.map(containerRef.current, {
          scrollWheelZoom: true,
          zoomControl: false,
          preferCanvas: true,
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
            color: "#4ade80",
            weight: 3,
            fillColor: "#22c55e",
            fillOpacity: 0.25,
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
          const edgeMarker = L.marker(getEastEdge({ lat: point[0], lng: point[1] }, radiusRef.current), {
            icon: edgeIcon,
            interactive: true,
            draggable: true,
            zIndexOffset: 900,
          }).addTo(instance);

          edgeMarker.on?.("drag", () => {
            const edgeLatLng = edgeMarker.getLatLng?.();
            const centerLatLng = centerMarker.getLatLng?.() ?? {
              lat: locationRef.current.latitude,
              lng: locationRef.current.longitude,
            };
            if (!edgeLatLng) return;
            const nextRadius = Math.max(15, Math.min(2000, Math.round(distanceMeters(centerLatLng, edgeLatLng))));
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
            { ...getLeftAreaPadding(true), maxZoom: 20 },
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
            accuracyCircleRef.current?.setLatLng([clicked.latitude, clicked.longitude]);
            accuracyCircleRef.current?.setRadius(radiusRef.current);
            edgeMarkerRef.current?.setLatLng(
              getEastEdge({ lat: clicked.latitude, lng: clicked.longitude }, radiusRef.current),
            );
            changeRef.current(clicked);
            framePointInLeftArea(instance, clicked.latitude, clicked.longitude, 16);
            showLandmarkFor(clicked.latitude, clicked.longitude, "pin", radiusRef.current);
          }
        });

        requestAnimationFrame(() => {
          if (!disposed) instance.invalidateSize(false);
        });
        if (typeof ResizeObserver !== "undefined" && containerRef.current) {
          resizeObserver = new ResizeObserver(() => {
            if (!disposed) instance.invalidateSize(false);
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
        mapRef.current?.fitBounds(
          boundary.map((p) => [p.latitude, p.longitude]),
          { ...getLeftAreaPadding(profileOpen), maxZoom: 20, animate: true },
        );
      });
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [drawing, draft, boundary, profileOpen]);

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
      framePointInLeftArea(map, next.latitude, next.longitude, 17);
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
    // Try high-accuracy GPS first, then gracefully fall back to fast network positioning
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
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
        );
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 15000 },
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
          <div className="full-map-pill">
            <MapPin size={14} />
            <span>
              {location.latitude.toFixed(5)}°, {location.longitude.toFixed(5)}°
            </span>
            <span className="hud-sep">·</span>
            <strong>{drawing && draftArea ? draftArea : `${areaLabel} ha`}</strong>
          </div>

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
              <div className="full-map-layers-menu" role="menu" aria-label="Map layers and NASA heatmaps">
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
                {(Object.keys(HEATMAP_LAYERS) as Array<Exclude<HeatmapLayer, "none">>).map((key) => {
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
                })}
              </div>
            )}
          </div>

          <Button type="button" size="sm" variant="secondary" onClick={locateMe} disabled={locating}>
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
                disabled={draft.length < 3}
                onClick={() => {
                  try {
                    const measured = measureFarmBoundary(draft);
                    onBoundary(measured.points);
                    setDrawing(false);
                    setProfileOpen(true);
                    setError("");
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Invalid boundary.");
                  }
                }}
              >
                <Check size={14} />
                Finish ({draft.length})
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

      {/* Right-side Plot Intelligence & Farm Profile Drawer */}
      {boundary.length >= 3 && !drawing && profileOpen && (
        <aside className="full-map-profile-panel" aria-label="Plot intelligence and farm profile">
          <div className="full-map-profile-head">
            <div>
              <div className="drawer-badges-row">
                <span className="drawer-badge-nasa">NASA EARTHDATA</span>
                <span className="drawer-badge-engine">Rotation Engine</span>
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
              <h3>{drawerTab === "rotation" ? "Crop Rotation & Land Advisory" : "Farm Profile"}</h3>
            </div>
            <div className="full-map-profile-head-right">
              <button
                type="button"
                className="full-map-profile-close"
                aria-label="Close farm profile panel"
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
              aria-selected={drawerTab === "rotation"}
              className={drawerTab === "rotation" ? "is-active" : ""}
              onClick={() => setDrawerTab("rotation")}
            >
              Crop Rotation &amp; Telemetry
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={drawerTab === "profile"}
              className={drawerTab === "profile" ? "is-active" : ""}
              onClick={() => setDrawerTab("profile")}
            >
              Farm Profile
            </button>
          </div>

          {drawerTab === "rotation" ? (
            (() => {
              const climateSummary = historical ? summarizeWeather(historical.days) : null;
              const moisture = historical?.soilMoisturePercent ?? null;
              const moistureTag =
                moisture === null ? "Awaiting" : moisture < 20 ? "Dry" : moisture > 65 ? "Wet" : "Optimal";
              const surfaceTemp = historical?.surfaceTempC ?? climateSummary?.temperature ?? null;
              const rain30 = historical?.recent30dRainfallMm ?? climateSummary?.rainfall ?? null;
              const elev = terrain?.elevation ?? historical?.nasaElevationM ?? null;
              const slope = terrain?.slopePercent ?? null;
              const currentProfile = getCropProfile(farm.crop);
              const strategies = buildRotationStrategies("Typical", {
                ph: farm.ph.trim() ? Number(farm.ph) : NaN,
                drainage: farm.drainage,
                irrigation: farm.irrigation,
                planted: farm.planted,
                crop: farm.crop,
                previous: farm.previous,
                slopePercent: slope,
                soil: farm.soil,
              });

              return (
                <div className="drawer-rotation-body">
                  <div className="drawer-telemetry-grid" aria-label="NASA plot telemetry">
                    <button
                      type="button"
                      className={`telemetry-tile is-action ${heatmap === "soil_moisture" ? "is-on" : ""}`}
                      aria-pressed={heatmap === "soil_moisture"}
                      title="Toggle NASA SMAP soil moisture map layer"
                      onClick={() => setHeatmap(heatmap === "soil_moisture" ? "none" : "soil_moisture")}
                    >
                      <span>SMAP / GWETTOP</span>
                      <strong>{climateLoading ? "…" : moisture !== null ? `${moisture}%` : "—"}</strong>
                      <small>{moistureTag} · map layer</small>
                    </button>
                    <button
                      type="button"
                      className={`telemetry-tile is-action ${heatmap === "lst" ? "is-on" : ""}`}
                      aria-pressed={heatmap === "lst"}
                      title="Toggle NASA MODIS land surface temperature map layer"
                      onClick={() => setHeatmap(heatmap === "lst" ? "none" : "lst")}
                    >
                      <span>MODIS / TS</span>
                      <strong>
                        {climateLoading ? "…" : surfaceTemp !== null ? `${surfaceTemp.toFixed(1)}°C` : "—"}
                      </strong>
                      <small>Surface · map layer</small>
                    </button>
                    <button
                      type="button"
                      className={`telemetry-tile is-action ${heatmap === "ndvi" ? "is-on" : ""}`}
                      aria-pressed={heatmap === "ndvi"}
                      title="Toggle NASA MODIS NDVI vegetation map layer (visual only, no per-plot value)"
                      onClick={() => setHeatmap(heatmap === "ndvi" ? "none" : "ndvi")}
                    >
                      <span>MODIS / NDVI</span>
                      <strong>{heatmap === "ndvi" ? "On" : "View"}</strong>
                      <small>Vegetation · map only</small>
                    </button>
                    <div className="telemetry-tile">
                      <span>GPM / 30D RAIN</span>
                      <strong>{climateLoading ? "…" : rain30 !== null ? `${Math.round(rain30)} mm` : "—"}</strong>
                      <small>Precipitation</small>
                    </div>
                    <div className="telemetry-tile">
                      <span>SRTM / SLOPE</span>
                      <strong>{elev !== null ? `${Math.round(elev)} m` : "—"}</strong>
                      <small>{slope !== null ? `${slope.toFixed(1)}% slope` : "Terrain"}</small>
                    </div>
                  </div>

                  <div className="drawer-current-crop-card">
                    <img
                      src={currentProfile.image}
                      alt={currentProfile.name}
                      className="drawer-crop-thumb"
                    />
                    <div className="drawer-current-crop-info">
                      <div className="drawer-current-crop-top">
                        <span className="drawer-current-eyebrow">CURRENT CROP</span>
                        <select
                          aria-label="Quick switch current crop"
                          className="drawer-inline-select"
                          value={farm.crop}
                          onChange={(e) => onUpdateFarm("crop", e.target.value)}
                        >
                          {cropOptions.map((crop) => (
                            <option key={crop} value={crop}>
                              {crop}
                            </option>
                          ))}
                        </select>
                      </div>
                      <strong>
                        {currentProfile.name} / {currentProfile.localName}{" "}
                        <em>({currentProfile.scientificName})</em>
                      </strong>
                      <p>{currentProfile.soilImpact}</p>
                    </div>
                  </div>

                  <div className="drawer-sequence-heading">
                    <span>SUGGESTED ROTATION SEQUENCE (3 STRATEGIES)</span>
                  </div>

                  <div className="drawer-timeline">
                    {strategies.map((strategy, idx) => {
                      const isExpanded = expandedStrategyId === strategy.id;
                      return (
                        <div
                          key={strategy.id}
                          className={`drawer-timeline-card ${isExpanded ? "is-expanded" : ""}`}
                        >
                          <button
                            type="button"
                            className="drawer-timeline-summary"
                            onClick={() =>
                              setExpandedStrategyId(isExpanded ? "" : strategy.id)
                            }
                          >
                            <span className="timeline-step-num">{idx + 1}</span>
                            <img
                              src={strategy.nextCropImage}
                              alt={strategy.nextCrop}
                              className="drawer-crop-thumb"
                            />
                            <div className="timeline-summary-copy">
                              <div className="timeline-meta-row">
                                <span className="timeline-window">
                                  {strategy.plantingWindow} · {strategy.cycleDays}
                                </span>
                                <span className="timeline-match-pill">
                                  {Math.round(strategy.total)}% NASA Match
                                </span>
                              </div>
                              <strong>
                                {strategy.nextCrop} / {strategy.nextCropLocalName}{" "}
                                <em>({strategy.nextCropScientificName})</em>
                              </strong>
                              <p>{strategy.satelliteWhy[0]}</p>
                            </div>
                            <ChevronDown
                              size={15}
                              className={`timeline-chevron ${isExpanded ? "is-open" : ""}`}
                            />
                          </button>

                          <div
                            className={`drawer-collapse ${isExpanded ? "is-open" : ""}`}
                            aria-hidden={!isExpanded}
                          >
                            <div className="drawer-collapse-inner">
                            <div className="drawer-timeline-details">
                              <div className="drawer-detail-tabs">
                                <button
                                  type="button"
                                  className={detailTab === "proscons" ? "is-active" : ""}
                                  onClick={() => setDetailTab("proscons")}
                                >
                                  Pros &amp; Cons
                                </button>
                                <button
                                  type="button"
                                  className={detailTab === "pests" ? "is-active" : ""}
                                  onClick={() => setDetailTab("pests")}
                                >
                                  Pests &amp; Mitigations ({strategy.pestsAndDiseases.length})
                                </button>
                              </div>

                              {detailTab === "proscons" ? (
                                <div className="drawer-proscons-grid">
                                  <div>
                                    <strong className="pros-title">Pros</strong>
                                    <ul>
                                      {strategy.pros.map((item) => (
                                        <li key={item}>{item}</li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div>
                                    <strong className="cons-title">Cons &amp; Trade-offs</strong>
                                    <ul>
                                      {strategy.cons.map((item) => (
                                        <li key={item}>{item}</li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              ) : (
                                <div className="drawer-pests-list">
                                  {strategy.pestsAndDiseases.map((pest) => (
                                    <div key={pest.name} className="drawer-pest-item">
                                      <div className="drawer-pest-head">
                                        <strong>{pest.name}</strong>
                                        <span
                                          className={`risk-pill risk-${pest.riskLevel.toLowerCase()}`}
                                        >
                                          {pest.riskLevel} Risk
                                        </span>
                                      </div>
                                      <small>
                                        <b>Trigger:</b> {pest.riskWindow}
                                      </small>
                                      <small>
                                        <b>Mitigation:</b> {pest.mitigation}
                                      </small>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="drawer-verification-tags">
                                {strategy.verificationTags.map((tag) => (
                                  <span key={tag}>{tag}</span>
                                ))}
                              </div>
                            </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          ) : (
            <>
              <div className="full-map-profile-grid">
            <div className="form-field full-span">
              <Label htmlFor="map-farm-location">Municipality / city (automatic, editable)</Label>
              <Input
                id="map-farm-location"
                value={farm.place}
                onChange={(e) => onUpdateFarm("place", e.target.value)}
              />
              <small>Detected from your selected farm point when public records are available.</small>
            </div>

            <div className="form-field">
              <Label htmlFor="map-area-ha">Farm area (ha)</Label>
              <div className="input-unit-wrap">
                <Input id="map-area-ha" readOnly value={farm.area} />
                <span>ha</span>
              </div>
              <small>Calculated from drawn boundary.</small>
            </div>

            <div className="form-field">
              <Label htmlFor="map-plant-date">Planned next planting</Label>
              <Input
                id="map-plant-date"
                type="date"
                value={farm.planted}
                onChange={(e) => onUpdateFarm("planted", e.target.value)}
              />
            </div>

            <div className="form-field">
              <Label htmlFor="map-current-crop">Current crop</Label>
              <select
                id="map-current-crop"
                className="form-select"
                value={farm.crop}
                onChange={(e) => onUpdateFarm("crop", e.target.value)}
              >
                {cropOptions.map((crop) => (
                  <option key={crop}>{crop}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <Label htmlFor="map-previous-crop">Previous crop</Label>
              <select
                id="map-previous-crop"
                className="form-select"
                value={farm.previous}
                onChange={(e) => onUpdateFarm("previous", e.target.value)}
              >
                {previousCropOptions.map((crop) => (
                  <option key={crop}>{crop}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <Label htmlFor="map-soil-type">Soil texture / type</Label>
              <Input
                id="map-soil-type"
                value={farm.soil}
                placeholder="Awaiting public estimate"
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
                const climateSummary = historical ? summarizeWeather(historical.days) : null;
                const slope = terrain?.slopePercent;
                const slopeStatus =
                  slope === undefined
                    ? "Sampling terrain…"
                    : slope > 15
                      ? `${slope.toFixed(1)}% slope · Steep (erosion risk)`
                      : slope > 8
                        ? `${slope.toFixed(1)}% slope · Moderate`
                        : `${slope.toFixed(1)}% slope · Suitable`;
                return (
                  <div className="full-map-nasa-snapshot" aria-label="NASA climate and terrain summary">
                    <div>
                      <span>NASA POWER (90d)</span>
                      <strong>
                        {climateLoading
                          ? "Fetching NASA climate…"
                          : climateSummary
                            ? `${climateSummary.temperature !== null ? `${climateSummary.temperature.toFixed(1)}°C` : "—"} · ${climateSummary.rainfall !== null ? `${Math.round(climateSummary.rainfall)} mm rain` : "—"}`
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
            </>
          )}

          <div className="full-map-profile-foot">
            <span className="full-map-profile-saved">
              <span className="save-indicator">
                <Check size={11} />
              </span>
              Saved in this browser
            </span>
            <Button type="button" size="sm" onClick={onContinue}>
              Continue to crop planning <ArrowRight size={14} />
            </Button>
          </div>
        </aside>
      )}

      {/* Floating Landmark / Location Preview Modal */}
      {landmark && !drawing && (
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
                  {radiusMeters} m (≈ {((Math.PI * radiusMeters * radiusMeters) / 10000).toFixed(2)} ha)
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
      )}

      {/* Bottom-right zoom controls */}
      <div
        className={`full-map-zoom ${boundary.length >= 3 && !drawing && profileOpen ? "is-shifted" : ""}`}
      >
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

      {/* NASA GIBS heatmap legend */}
      {heatmap !== "none" && !drawing && (
        <div className="full-map-heatmap-legend" role="status" aria-label="Active NASA heatmap legend">
          <div className="full-map-heatmap-legend-head">
            <strong>{HEATMAP_LAYERS[heatmap].label}</strong>
            <button
              type="button"
              aria-label="Turn off heatmap"
              onClick={() => setHeatmap("none")}
            >
              <X size={13} />
            </button>
          </div>
          <div
            className="full-map-heatmap-bar"
            style={{ background: HEATMAP_LAYERS[heatmap].gradient }}
          />
          <span>{HEATMAP_LAYERS[heatmap].scaleLabel}</span>
        </div>
      )}

      {/* Status / error toast */}
      {(drawing || error) && (
        <div className="full-map-hud-bottom" role={error ? "alert" : "status"}>
          {error
            ? error
            : "Click corners on the satellite image to outline your field, then click Finish."}
        </div>
      )}
    </div>
  );
}
