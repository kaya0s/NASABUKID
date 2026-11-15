import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FullFarmMap, type FarmProfileData } from "./full-farm-map";
import { createDefaultDisasterRecoveryState, type CachedFarmLot } from "@/lib/farm-lots-cache";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const INITIAL_FARM: FarmProfileData = {
  place: "Malaybalay, Bukidnon",
  area: "1.5000",
  crop: "Corn",
  previous: "Mungbean",
  ph: "5.8",
  soil: "Clay loam",
  irrigation: "Rainfed",
  drainage: "Moderate",
  planted: "2026-06-15",
};

describe("FullFarmMap saved lot caching, naming & navigation", () => {
  it("displays custom lot names alongside location pins and navigates when clicking saved lots or polygons", async () => {
    vi.useFakeTimers();
    const savedLots: CachedFarmLot[] = [
      {
        id: "lot-1",
        name: "North Maize Ridge",
        location: { latitude: 8.157, longitude: 125.127 },
        locationConfirmed: true,
        boundary: [
          { latitude: 8.156, longitude: 125.126 },
          { latitude: 8.156, longitude: 125.128 },
          { latitude: 8.158, longitude: 125.128 },
        ],
        terrain: { elevation: 310, slopePercent: 1.8 },
        farm: { ...INITIAL_FARM, crop: "Corn", area: "1.5000" },
        cropRotation: { plannedDate: "2027-01-15", plannerResult: null },
        disasterRecovery: createDefaultDisasterRecoveryState(),
        createdAt: "2026-11-15T00:00:00.000Z",
        updatedAt: "2026-11-15T00:00:00.000Z",
      },
      {
        id: "lot-2",
        name: "Riverbank Mungbean",
        location: { latitude: 8.172, longitude: 125.142 },
        locationConfirmed: true,
        boundary: [
          { latitude: 8.171, longitude: 125.141 },
          { latitude: 8.171, longitude: 125.143 },
          { latitude: 8.173, longitude: 125.143 },
        ],
        terrain: { elevation: 265, slopePercent: 0.9 },
        farm: { ...INITIAL_FARM, crop: "Mungbean", area: "2.1000" },
        cropRotation: { plannedDate: "2027-02-01", plannerResult: null },
        disasterRecovery: createDefaultDisasterRecoveryState(),
        createdAt: "2026-11-15T00:00:00.000Z",
        updatedAt: "2026-11-15T00:00:00.000Z",
      },
    ];

    const markerCalls: Array<{
      coords: [number, number];
      opts: { icon?: { html?: string } };
      handlers: Record<string, () => void>;
    }> = [];
    const polygonCalls: Array<{
      handlers: Record<string, () => void>;
    }> = [];
    const map = {
      setView: vi.fn().mockReturnThis(),
      flyTo: vi.fn().mockReturnThis(),
      fitBounds: vi.fn(),
      invalidateSize: vi.fn(),
      remove: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };
    const createTileLayer = () => {
      const layer = { on: vi.fn(), addTo: vi.fn(), remove: vi.fn() };
      layer.on.mockReturnValue(layer);
      layer.addTo.mockReturnValue(layer);
      return layer;
    };

    vi.stubGlobal("L", {
      map: () => map,
      polygon: () => {
        const handlers: Record<string, () => void> = {};
        const poly = {
          setLatLngs: vi.fn(),
          setStyle: vi.fn(),
          getBounds: vi.fn(() => ({ isValid: () => true })),
          addTo: vi.fn().mockReturnThis(),
          remove: vi.fn(),
          on: vi.fn((ev: string, fn: () => void) => {
            handlers[ev] = fn;
          }),
        };
        polygonCalls.push({ handlers });
        return poly;
      },
      divIcon: (opts: { html?: string }) => opts,
      marker: (coords: [number, number], opts: { icon?: { html?: string } }) => {
        const handlers: Record<string, () => void> = {};
        const record = { coords, opts, handlers };
        markerCalls.push(record);
        return {
          addTo: vi.fn().mockReturnThis(),
          setLatLng: vi.fn(),
          setIcon: vi.fn((nextIcon: { html?: string }) => {
            record.opts.icon = nextIcon;
          }),
          on: vi.fn((ev: string, fn: () => void) => {
            handlers[ev] = fn;
          }),
          remove: vi.fn(),
        };
      },
      circleMarker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), remove: vi.fn() })),
      tileLayer: createTileLayer,
    });

    function MultiLotHarness() {
      const [activeId, setActiveId] = useState("lot-1");
      const [lotName, setLotName] = useState("North Maize Ridge");
      const current = savedLots.find((l) => l.id === activeId)!;
      return (
        <FullFarmMap
          location={current.location}
          onChange={() => {}}
          boundary={current.boundary}
          onBoundary={() => {}}
          areaLabel={`${current.farm.area} ha`}
          farm={current.farm}
          onUpdateFarm={() => {}}
          activeLotId={activeId}
          activeLotName={lotName}
          onRenameActiveLot={setLotName}
          savedLots={savedLots}
          onSelectSavedLot={(id) => {
            setActiveId(id);
            setLotName(savedLots.find((l) => l.id === id)!.name);
          }}
        />
      );
    }

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MultiLotHarness />
      </QueryClientProvider>,
    );

    const leafletScript = document.querySelector(
      'script[src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"]',
    );
    await act(async () => {
      if (leafletScript) fireEvent.load(leafletScript);
      vi.advanceTimersByTime(60);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Active pin HTML includes the active lot name alongside the location icon
    expect(markerCalls[0]?.opts.icon?.html).toContain("North Maize Ridge");

    // Inactive saved lot ("Riverbank Mungbean") renders its own clickable pin & polygon
    const savedPin = markerCalls.find((m) =>
      m.opts.icon?.html?.includes("Riverbank Mungbean"),
    );
    expect(savedPin).toBeTruthy();

    // Renaming active lot via Farm Profile input updates pin badge & switcher pill live
    const lotNameInput = screen.getByLabelText(/Lot \/ farm name/i);
    fireEvent.change(lotNameInput, { target: { value: "Summit Cornfield" } });
    expect(screen.getByTestId("saved-lots-bar").textContent).toContain("Summit Cornfield");

    // Clicking the inactive saved lot's location pin redirects to Lot 2
    await act(async () => {
      savedPin!.handlers["click"]?.();
    });
    expect(screen.getByTestId("saved-lots-bar").textContent).toContain("Riverbank Mungbean");
    expect(polygonCalls.length).toBeGreaterThanOrEqual(2);

    // Clicking Lot 1's retained saved polygon redirects back to Lot 1
    const lot1Poly = polygonCalls.filter((p) => typeof p.handlers["click"] === "function").at(-1);
    expect(lot1Poly).toBeTruthy();
    await act(async () => {
      lot1Poly!.handlers["click"]?.();
    });
    expect(screen.getByTestId("saved-lots-bar").textContent).toContain("North Maize Ridge");
  });
});
