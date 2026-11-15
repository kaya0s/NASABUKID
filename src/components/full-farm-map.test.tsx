import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FullFarmMap, type FarmProfileData } from "./full-farm-map";
import type { Coordinates } from "@/lib/nasa-power";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const INITIAL_FARM: FarmProfileData = {
  place: "Malaybalay, Bukidnon",
  area: "3.19",
  crop: "Corn",
  previous: "Mungbean",
  ph: "5.8",
  soil: "Clay loam",
  irrigation: "Rainfed",
  drainage: "Moderate",
  planted: "2026-06-15",
};

function Harness() {
  const [location, setLocation] = useState<Coordinates>({
    latitude: 8.1575,
    longitude: 125.1277,
  });
  const [boundary, setBoundary] = useState<Coordinates[]>([]);
  const [farm, setFarm] = useState<FarmProfileData>(INITIAL_FARM);

  return (
    <FullFarmMap
      location={location}
      onChange={setLocation}
      boundary={boundary}
      onBoundary={setBoundary}
      areaLabel={boundary.length >= 3 ? "3.1881 ha" : ""}
      farm={farm}
      onUpdateFarm={(key, value) => setFarm((prev) => ({ ...prev, [key]: value }))}
      terrain={{ elevation: 298.4, slopePercent: 2.5 }}
    />
  );
}

describe("FullFarmMap 3D lot selection sequence", () => {
  it("flies to parcel at zoom 16.5 for 2.5s, shows dual scan cues, and reveals topography badge after completion", async () => {
    vi.useFakeTimers();
    const clickHandlers: Array<(e: { latlng: { lat: number; lng: number } }) => void> = [];
    const map = {
      setView: vi.fn().mockReturnThis(),
      flyTo: vi.fn().mockReturnThis(),
      fitBounds: vi.fn(),
      invalidateSize: vi.fn(),
      remove: vi.fn(),
      on: vi.fn((event: string, handler: (e: { latlng: { lat: number; lng: number } }) => void) => {
        if (event === "click") clickHandlers.push(handler);
      }),
      off: vi.fn(),
    };
    const polygon = {
      setLatLngs: vi.fn(),
      setStyle: vi.fn(),
      getBounds: vi.fn(() => ({ isValid: () => true })),
      addTo: vi.fn().mockReturnThis(),
    };

    const createTileLayer = () => {
      const layer = {
        on: vi.fn(),
        addTo: vi.fn(),
        remove: vi.fn(),
      };
      layer.on.mockReturnValue(layer);
      layer.addTo.mockReturnValue(layer);
      return layer;
    };

    vi.stubGlobal("L", {
      map: () => map,
      polygon: () => polygon,
      circleMarker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), remove: vi.fn() })),
      tileLayer: createTileLayer,
    });

    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <Harness />
      </QueryClientProvider>,
    );

    const leafletScript = document.querySelector(
      'script[src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"]',
    );
    await act(async () => {
      if (leafletScript) {
        fireEvent.load(leafletScript);
      }
      vi.advanceTimersByTime(60);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Enter draw mode and click 3 parcel vertices
    const drawBtn = screen.getByRole("button", { name: /Draw boundary/i });
    expect(drawBtn).toBeEnabled();
    fireEvent.click(drawBtn);
    act(() => {
      clickHandlers.forEach((fn) => fn({ latlng: { lat: 8.156, lng: 125.126 } }));
    });
    act(() => {
      clickHandlers.forEach((fn) => fn({ latlng: { lat: 8.156, lng: 125.129 } }));
    });
    act(() => {
      clickHandlers.forEach((fn) => fn({ latlng: { lat: 8.159, lng: 125.129 } }));
    });

    const finishBtn = screen.getByRole("button", { name: /Finish \(3\)/i });
    await act(async () => {
      fireEvent.click(finishBtn);
    });

    // 1. Camera flyTo triggered at zoom 16.5 for 2.5s targeting centroid
    expect(map.flyTo).toHaveBeenCalledTimes(1);
    const [targetCoord, targetZoom, flyOptions] = map.flyTo.mock.calls[0]!;
    expect(targetCoord[0]).toBeCloseTo((8.156 + 8.156 + 8.159) / 3, 5);
    expect(targetCoord[1]).toBeCloseTo((125.126 + 125.129 + 125.129) / 3, 5);
    expect(targetZoom).toBe(16.5);
    expect(flyOptions).toMatchObject({ duration: 2.5 });

    // 2. 3D stage & green scan FX active; polygon highlighted in glowing green
    expect(container.querySelector(".full-map-stage.is-3d-scanning")).toBeTruthy();
    expect(container.querySelector(".full-map-scan-fx")).toBeTruthy();
    expect(polygon.setStyle).toHaveBeenCalledWith(
      expect.objectContaining({ color: "#4ade80", fillColor: "#22c55e" }),
    );

    // 3. Visual UI scan cue displayed in map HUD while fly-in runs
    expect(screen.getByText(/Scanning Farm Boundary\.\.\./i)).toBeTruthy();

    // At 2.0s: fade phase begins (.is-fading applied)
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.querySelector(".full-map-scan-cue.is-fading")).toBeTruthy();

    // At 2.5s: 3D rotation finishes, scan cue disappears, terrain badge stays removed, and map zooms tightly into plot
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(container.querySelector(".full-map-stage.is-3d-scanning")).toBeNull();
    expect(screen.queryByText(/Scanning Farm Boundary\.\.\./i)).toBeNull();
    expect(screen.queryByLabelText("Terrain and slope summary")).toBeNull();
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      [
        [8.156, 125.126],
        [8.156, 125.129],
        [8.159, 125.129],
      ],
      expect.objectContaining({ maxZoom: 19, animate: true }),
    );
  });
});
