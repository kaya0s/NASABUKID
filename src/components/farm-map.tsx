import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { measureFarmBoundary } from "@/lib/farm-boundary";
import { coordinatesSchema, type Coordinates } from "@/lib/nasa-power";

export type MapInstance = {
  setView: (point: [number, number], zoom?: number, options?: object) => MapInstance;
  flyTo?: (point: [number, number], zoom?: number, options?: object) => MapInstance;
  on: (event: string, callback: (event: { latlng: { lat: number; lng: number } }) => void) => void;
  remove: () => void;
  removeLayer: (layer: unknown) => void;
  fitBounds: (points: [number, number][], options: object) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  invalidateSize: (animate?: boolean) => void;
};
export type TileLayerInstance = {
  addTo: (map: MapInstance) => TileLayerInstance;
  on: (event: string, callback: () => void) => TileLayerInstance;
};
export type LatLng = { lat: number; lng: number };
export type MarkerInstance = {
  addTo: (map: MapInstance) => MarkerInstance;
  setLatLng: (point: [number, number] | LatLng) => MarkerInstance;
  on?: (event: string, callback: (event: { latlng: LatLng }) => void) => MarkerInstance;
  getLatLng?: () => LatLng;
  bindTooltip?: (content: string, options?: object) => MarkerInstance;
};
export type CircleInstance = {
  addTo: (map: MapInstance) => CircleInstance;
  setLatLng: (point: [number, number] | LatLng) => CircleInstance;
  setRadius: (radius: number) => CircleInstance;
  getRadius?: () => number;
  getLatLng?: () => LatLng;
};
export type Leaflet = {
  map: (element: HTMLElement, options: object) => MapInstance;
  tileLayer: (url: string, options: object) => TileLayerInstance;
  polygon: (
    points: [number, number][],
    options: object,
  ) => {
    addTo: (map: MapInstance) => {
      setLatLngs: (points: [number, number][]) => void;
      setStyle?: (options: object) => void;
    };
  };
  marker?: (point: [number, number] | LatLng, options?: object) => MarkerInstance;
  circleMarker?: (point: [number, number] | LatLng, options?: object) => MarkerInstance;
  circle?: (point: [number, number] | LatLng, options?: object) => CircleInstance;
  divIcon?: (options: object) => unknown;
  latLng?: (lat: number, lng: number) => { distanceTo: (other: LatLng) => number; lat: number; lng: number };
};
let leafletPromise: Promise<Leaflet> | undefined;
// shortcut: Leaflet is CDN-hosted; bundle it when package registry access is available.
export function loadLeaflet() {
  if (!leafletPromise)
    leafletPromise = new Promise<Leaflet>((resolve, reject) => {
      const cssHref = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      const existingCss = document.querySelector(`link[href="${cssHref}"]`) as HTMLLinkElement | null;
      let cssReady = Boolean(existingCss?.sheet);
      if (!existingCss) {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = cssHref;
        css.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
        css.crossOrigin = "anonymous";
        css.onload = () => {
          cssReady = true;
        };
        css.onerror = () => {
          cssReady = true;
        };
        document.head.append(css);
      } else if (!cssReady) {
        existingCss.addEventListener("load", () => {
          cssReady = true;
        });
      }
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
      script.crossOrigin = "anonymous";
      const timeout = window.setTimeout(
        () => reject(new Error("Map download timed out. Enter coordinates below.")),
        15000,
      );
      script.onload = () => {
        window.clearTimeout(timeout);
        const finish = () => resolve((window as unknown as { L: Leaflet }).L);
        if (cssReady) finish();
        else window.setTimeout(finish, 50);
      };
      script.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Map unavailable. Enter coordinates below."));
      };
      document.head.append(script);
    });
  return leafletPromise;
}

export function FarmMap({
  location,
  onChange,
  boundary,
  onBoundary,
}: {
  boundary: Coordinates[];
  onBoundary: (points: Coordinates[]) => void;
  location: Coordinates;
  onChange: (point: Coordinates) => void;
}) {
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<Coordinates[]>([]);
  const drawingRef = useRef(false);
  drawingRef.current = drawing;
  const polygon = useRef<{ setLatLngs: (points: [number, number][]) => void } | null>(null);
  const savedBoundary = useRef(boundary);
  savedBoundary.current = boundary;
  const visiblePoints = useRef(boundary);
  visiblePoints.current = drawing ? draft : boundary;
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const current = useRef(location);
  current.current = location;
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [latitude, setLatitude] = useState(String(location.latitude));
  const [longitude, setLongitude] = useState(String(location.longitude));
  useEffect(() => {
    setLatitude(String(location.latitude));
    setLongitude(String(location.longitude));
  }, [location.latitude, location.longitude]);
  useEffect(() => {
    let disposed = false;
    loadLeaflet()
      .then((L) => {
        if (disposed || !element.current) return;
        const point: [number, number] = [current.current.latitude, current.current.longitude];
        const instance = L.map(element.current, { scrollWheelZoom: false }).setView(point, 11);
        map.current = instance;
        setLoading(false);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        })
          .addTo(instance)
          .on("tileerror", () => {
            if (!disposed)
              setError("Some map tiles could not load. You can still enter coordinates below.");
          });
        polygon.current = L.polygon(
          visiblePoints.current.map((point) => [point.latitude, point.longitude]),
          {
            color: "#175c3a",
            fillColor: "#42b878",
            fillOpacity: 0.2,
            interactive: false,
          },
        ).addTo(instance);
        if (visiblePoints.current.length >= 3)
          instance.fitBounds(
            visiblePoints.current.map((point) => [point.latitude, point.longitude]),
            { padding: [20, 20], maxZoom: 18 },
          );
        instance.on("click", (event) => {
          const point = {
            latitude: Number(event.latlng.lat.toFixed(7)),
            longitude: Number(event.latlng.lng.toFixed(7)),
          };
          if (drawingRef.current)
            setDraft((points) => (points.length < 200 ? [...points, point] : points));
          else if (!savedBoundary.current.length) change.current(point);
        });
      })
      .catch((reason) => {
        if (!disposed) {
          setLoading(false);
          setError(reason instanceof Error ? reason.message : "Map unavailable.");
        }
      });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      polygon.current = null;
    };
  }, []);
  useEffect(() => {
    const point: [number, number] = [location.latitude, location.longitude];
    map.current?.setView(point);
  }, [location.latitude, location.longitude]);
  useEffect(() => {
    polygon.current?.setLatLngs(
      (drawing ? draft : boundary).map((point) => [point.latitude, point.longitude]),
    );
    if (!drawing && boundary.length >= 3)
      map.current?.fitBounds(
        boundary.map((point) => [point.latitude, point.longitude]),
        { padding: [20, 20], maxZoom: 18 },
      );
  }, [drawing, draft, boundary]);
  let draftArea = "";
  if (draft.length >= 3) {
    try {
      draftArea = `${measureFarmBoundary(draft).hectares.toFixed(4)} ha`;
    } catch {
      draftArea = "Outline needs correction before saving.";
    }
  }
  return (
    <>
      <div className="boundary-toolbar">
        {!drawing ? (
          <>
            <Button
              type="button"
              disabled={loading || !map.current}
              onClick={() => {
                setDraft([]);
                setError("");
                setDrawing(true);
              }}
            >
              {boundary.length ? "Redraw farm boundary" : "Draw farm boundary"}
            </Button>
            {boundary.length > 0 && (
              <Button type="button" variant="outline" onClick={() => onBoundary([])}>
                Clear boundary
              </Button>
            )}
          </>
        ) : (
          <>
            <Button
              type="button"
              disabled={draft.length < 3}
              onClick={() => {
                try {
                  const measured = measureFarmBoundary(draft);
                  onBoundary(measured.points);
                  setDrawing(false);
                  setError("");
                } catch (error) {
                  setError(error instanceof Error ? error.message : "Invalid boundary.");
                }
              }}
            >
              Finish boundary
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!draft.length}
              onClick={() => setDraft((points) => points.slice(0, -1))}
            >
              Undo corner
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDrawing(false);
                setDraft([]);
                setError("");
              }}
            >
              Cancel drawing
            </Button>
          </>
        )}
      </div>
      <p className="map-caption" role="status">
        {drawing
          ? `Click or tap each farm corner, then finish. ${draft.length}/200 corners. ${draftArea}`
          : boundary.length
            ? "Boundary saved. Area is calculated automatically; clear the boundary to enter area manually."
            : "Draw the farm outline to calculate hectares automatically."}
      </p>
      <div
        ref={element}
        className="farm-map leaflet-farm-map"
        role="region"
        aria-label="Farm location map. Click to select a point or use coordinate fields below."
      />
      {loading && (
        <p role="status" className="map-caption">
          Loading Leaflet map… Coordinate entry is available below.
        </p>
      )}
      <p className="map-caption">
        Outside drawing mode, click the map to select a farm reference point, or enter coordinates.
        The initial point is a town reference, not your confirmed farm. During drawing, coordinates
        can also add corners. Setting a new reference location clears an existing boundary. Drawn
        area is an approximate horizontal area, not a survey. OpenStreetMap may not show individual
        field edges.
      </p>
      {error && (
        <p role="alert" className="integration-error">
          {error}
        </p>
      )}
      <form
        className="coordinate-form"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = coordinatesSchema.safeParse({
            latitude: Number(latitude),
            longitude: Number(longitude),
          });
          if (!latitude.trim() || !longitude.trim() || !parsed.success) {
            setError("Enter valid latitude (−90 to 90) and longitude (−180 to 180).");
            return;
          }
          setError("");
          if (drawing) {
            if (draft.length >= 200) {
              setError("Maximum 200 corners. Undo a corner before adding another.");
              return;
            }
            setDraft((points) => [...points, parsed.data]);
          } else onChange(parsed.data);
        }}
      >
        <div>
          <Label htmlFor="latitude">Latitude</Label>
          <Input
            id="latitude"
            type="number"
            min={-90}
            max={90}
            step="any"
            required
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="longitude">Longitude</Label>
          <Input
            id="longitude"
            type="number"
            min={-180}
            max={180}
            step="any"
            required
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline">
          {drawing ? "Add boundary corner" : "Set location"}
        </Button>
      </form>
    </>
  );
}
