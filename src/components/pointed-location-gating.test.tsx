import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/index";
import { FARM_LOTS_CACHE_STORAGE_KEY } from "@/lib/farm-lots-cache";

const App = Route.options.component!;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function stubLeafletMap() {
  const mapHandlers: Record<string, (e?: unknown) => void> = {};
  const createTileLayer = () => {
    const layer = { on: vi.fn(), addTo: vi.fn(), remove: vi.fn() };
    layer.on.mockReturnValue(layer);
    layer.addTo.mockReturnValue(layer);
    return layer;
  };
  const pinHtmls: string[] = [];
  const mainMarker = {
    setLatLng: vi.fn(),
    setIcon: vi.fn((icon: { html?: string }) => {
      if (icon?.html) pinHtmls.push(icon.html);
    }),
    getLatLng: vi.fn(() => ({ lat: 8.3, lng: 125.0 })),
    on: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
  };
  const map = {
    setView: vi.fn().mockReturnThis(),
    flyTo: vi.fn().mockReturnThis(),
    fitBounds: vi.fn(),
    invalidateSize: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    remove: vi.fn(),
    latLngToContainerPoint: vi.fn(([lat, lng]: [number, number]) => ({
      x: 200 + Math.round((lng - 125) * 1000),
      y: 200 - Math.round((lat - 8.3) * 1000),
    })),
    on: vi.fn((event: string, handler: (e?: unknown) => void) => {
      mapHandlers[event] = handler;
    }),
    off: vi.fn(),
  };

  vi.stubGlobal("L", {
    map: () => map,
    polygon: () => ({
      setLatLngs: vi.fn(),
      setStyle: vi.fn(),
      getBounds: vi.fn(() => ({ isValid: () => true })),
      on: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
    }),
    circle: () => ({
      setLatLng: vi.fn(),
      setRadius: vi.fn(),
      addTo: vi.fn().mockReturnThis(),
    }),
    marker: vi.fn((_coords: [number, number], opts?: { icon?: { html?: string } }) => {
      if (opts?.icon?.html?.includes("full-map-location-dot")) {
        pinHtmls.push(opts.icon.html);
        return mainMarker;
      }
      return {
        setLatLng: vi.fn(),
        on: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
      };
    }),
    divIcon: vi.fn((opts: { html: string }) => opts),
    circleMarker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), remove: vi.fn() })),
    tileLayer: createTileLayer,
  });

  return { mapHandlers, pinHtmls };
}

describe("pointed location gating for lots and stats cards", () => {
  it("does not display a lot or fetch stats cards for a pointed location, and loads them once a farm lot is plotted", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("scrollTo", vi.fn());
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();

    // Even if legacy storage had a stale point-only "Lot 1", it must not render as a lot.
    localStorage.setItem(
      FARM_LOTS_CACHE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        activeLotId: "legacy-point",
        lots: [
          {
            id: "legacy-point",
            name: "Lot 1",
            location: { latitude: 7.76786, longitude: 124.99071 },
            locationConfirmed: true,
            boundary: [],
            terrain: null,
            farm: {
              place: "Base Camp, Maramag, Bukidnon",
              area: "1.4",
              crop: "Corn",
              previous: "Mungbean",
              ph: "",
              soil: "",
              irrigation: "Unknown",
              drainage: "Unknown",
              planted: "2026-06-15",
            },
            cropRotation: { plannedDate: "2026-06-15", plannerResult: null },
            disasterRecovery: {
              hazard: "Flooding",
              damageDate: "2026-10-29",
              affected: 65,
              yieldLoss: 35,
              price: "15",
              expectedYield: "3000",
              assumptionsEdited: false,
              actualPlantingDate: "",
              growthStage: "",
              durationHours: "",
              observations: "",
              estimatedLossPhp: 0,
            },
            createdAt: "2026-11-15T00:00:00.000Z",
            updatedAt: "2026-11-15T00:00:00.000Z",
          },
        ],
      }),
    );
    localStorage.setItem("fieldshift-location-confirmed", "true");

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("photon.komoot.io/reverse")) {
        return {
          ok: true,
          json: async () => ({
            features: [
              {
                properties: {
                  name: "Base Camp",
                  city: "Maramag",
                  state: "Bukidnon",
                  country: "Philippines",
                },
              },
            ],
          }),
        } as Response;
      }
      if (url.includes("power.larc.nasa.gov/api/temporal/daily")) {
        return {
          ok: true,
          json: async () => ({
            header: { fill_value: -999 },
            properties: {
              parameter: {
                PRECTOTCORR: { "20261001": 12 },
                T2M: { "20261001": 24.5 },
                GWETTOP: { "20261001": 0.65 },
                TS: { "20261001": 23.2 },
              },
            },
            geometry: { coordinates: [125.0, 8.3, 310] },
          }),
        } as Response;
      }
      if (url.includes("modis.ornl.gov")) {
        return {
          ok: true,
          json: async () => ({ subset: [{ calendar_date: "2026-10-15", data: [6200] }] }),
        } as Response;
      }
      if (url.includes("rest.isric.org")) {
        return {
          ok: true,
          json: async () => ({
            properties: {
              layers: [
                {
                  name: "phh2o",
                  depths: [{ label: "5-15cm", values: { mean: 58 } }],
                },
              ],
            },
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ features: [], elevation: [300, 301, 300, 300, 300] }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const { mapHandlers, pinHtmls } = stubLeafletMap();

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Open Field Desk" })[0]!);

    const leafletScript = document.querySelector(
      'script[src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"]',
    );
    await act(async () => {
      if (leafletScript) fireEvent.load(leafletScript);
      await vi.advanceTimersByTimeAsync(60);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Point a location on the map without drawing a boundary
    await act(async () => {
      mapHandlers["click"]?.({ latlng: { lat: 7.76786, lng: 124.99071 } });
      await Promise.resolve();
      await Promise.resolve();
    });

    // No lot bar, no lot pin badge, no stats cards, no SoilGrids/climate/NDVI calls
    expect(screen.queryByTestId("saved-lots-bar")).toBeNull();
    expect(pinHtmls.every((html) => !html.includes("full-map-lot-pin-label"))).toBe(true);
    expect(screen.queryByText("MOISTURE")).toBeNull();
    expect(screen.queryByText("HEAT")).toBeNull();
    expect(screen.queryByText("RAIN")).toBeNull();
    expect(screen.queryByText("HEALTH")).toBeNull();
    expect(screen.queryByText(/SoilGrids mapped estimate/i)).toBeNull();

    const calledUrls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(calledUrls.some((u) => u.includes("power.larc.nasa.gov/api/temporal/daily"))).toBe(false);
    expect(calledUrls.some((u) => u.includes("modis.ornl.gov"))).toBe(false);
    expect(calledUrls.some((u) => u.includes("rest.isric.org"))).toBe(false);

    // Now draw an actual 3-point farm boundary and finish it
    fireEvent.click(screen.getByRole("button", { name: /Draw boundary/i }));
    await act(async () => {
      mapHandlers["click"]?.({ latlng: { lat: 7.768, lng: 124.991 } });
      mapHandlers["click"]?.({ latlng: { lat: 7.768, lng: 124.992 } });
      mapHandlers["click"]?.({ latlng: { lat: 7.769, lng: 124.992 } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Finish \(3\)/i }));
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Once a farm lot is plotted/selected, lot bar + stats cards appear and telemetry fetches run
    expect(screen.getByTestId("saved-lots-bar")).toBeTruthy();
    expect(screen.getByText("MOISTURE")).toBeTruthy();
    expect(screen.getByText("HEAT")).toBeTruthy();
    expect(screen.getByText("RAIN")).toBeTruthy();
    expect(screen.getByText("HEALTH")).toBeTruthy();
    const afterLotUrls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(afterLotUrls.some((u) => u.includes("power.larc.nasa.gov/api/temporal/daily"))).toBe(true);
    expect(afterLotUrls.some((u) => u.includes("modis.ornl.gov"))).toBe(true);

    // Pointing elsewhere again detaches from Lot 1 without labelling the pointed spot as a lot or showing stats
    await act(async () => {
      mapHandlers["click"]?.({ latlng: { lat: 7.81, lng: 125.02 } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText("MOISTURE")).toBeNull();
    expect(screen.getByTestId("saved-lots-bar").textContent).toContain("Saved lots");
    expect(pinHtmls.at(-1)).not.toContain("full-map-lot-pin-label");
  });
});
