import { useEffect, useRef, useState } from "react";
import { Check, GripHorizontal, Layers, Locate, MapPin, Navigation, Pencil, RotateCcw, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import bukidnonFields from "@/assets/bukidnon-fields.jpg";
import { Button } from "@/components/ui/button";
import {
  loadLeaflet,
  type CircleInstance,
  type Leaflet,
  type MapInstance,
  type TileLayerInstance,
} from "@/components/farm-map";
import { measureFarmBoundary } from "@/lib/farm-boundary";
import type { Coordinates } from "@/lib/nasa-power";

type MapStyle = "satellite" | "street";

type LandmarkInfo = {
  title: string;
  subtitle: string;
  accuracyMeters: number | null;
  source: "gps" | "pin";
};

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

export function FullFarmMap({
  location,
  onChange,
  boundary,
  onBoundary,
  areaLabel,
}: {
  location: Coordinates;
  onChange: (point: Coordinates) => void;
  boundary: Coordinates[];
  onBoundary: (points: Coordinates[]) => void;
  areaLabel: string;
}) {
  const [mapStyle, setMapStyle] = useState<MapStyle>("satellite");
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<Coordinates[]>([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [landmark, setLandmark] = useState<LandmarkInfo | null>(null);
  const [landmarkLoading, setLandmarkLoading] = useState(false);
  const [modalOffset, setModalOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);

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
  const polygonRef = useRef<{ setLatLngs: (points: [number, number][]) => void } | null>(null);
  const markerRef = useRef<{ setLatLng: (point: [number, number]) => void } | null>(null);
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

    lookupLandmark(lat, lng, controller.signal)
      .then((info) => {
        if (!controller.signal.aborted) {
          setLandmark({
            title: info.title,
            subtitle: info.subtitle,
            accuracyMeters,
            source,
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
            radius: 0,
            color: "#22c55e",
            weight: 1.5,
            fillColor: "#4ade80",
            fillOpacity: 0.14,
            interactive: false,
          }).addTo(instance);
        }

        if (L.circleMarker) {
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
            { padding: [48, 48], maxZoom: 19 },
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
            accuracyCircleRef.current?.setRadius(0);
            changeRef.current(clicked);
            showLandmarkFor(clicked.latitude, clicked.longitude, "pin", null);
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
    const point: [number, number] = [location.latitude, location.longitude];
    markerRef.current?.setLatLng(point);
    accuracyCircleRef.current?.setLatLng(point);
  }, [location.latitude, location.longitude]);

  useEffect(() => {
    polygonRef.current?.setLatLngs(
      (drawing ? draft : boundary).map((p) => [p.latitude, p.longitude]),
    );
    if (!drawing && boundary.length >= 3) {
      mapRef.current?.fitBounds(
        boundary.map((p) => [p.latitude, p.longitude]),
        { padding: [48, 48], maxZoom: 19 },
      );
    }
  }, [drawing, draft, boundary]);

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
    accuracyCircleRef.current?.setLatLng([next.latitude, next.longitude]);
    accuracyCircleRef.current?.setRadius(accuracy && accuracy < 2000 ? accuracy : 35);

    const map = mapRef.current;
    if (map?.flyTo) {
      map.flyTo([next.latitude, next.longitude], 17, { duration: 1.1 });
    } else {
      map?.setView([next.latitude, next.longitude], 17);
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
        <div className="full-map-pill">
          <MapPin size={14} />
          <span>
            {location.latitude.toFixed(5)}°, {location.longitude.toFixed(5)}°
          </span>
          <span className="hud-sep">·</span>
          <strong>{drawing && draftArea ? draftArea : `${areaLabel} ha`}</strong>
        </div>

        <div className="full-map-actions">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setMapStyle((s) => (s === "satellite" ? "street" : "satellite"))}
          >
            <Layers size={14} />
            {mapStyle === "satellite" ? "Satellite" : "Street Map"}
          </Button>

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
                  onClick={() => onBoundary([])}
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
            <img src={bukidnonFields} alt="Bukidnon agricultural landmark preview" />
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
      <div className="full-map-zoom">
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
