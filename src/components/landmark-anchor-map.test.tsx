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
  area: "1.20",
  crop: "Corn",
  previous: "Mungbean",
  ph: "6.0",
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
      areaLabel=""
      farm={farm}
      onUpdateFarm={(key, value) => setFarm((prev) => ({ ...prev, [key]: value }))}
      activeLotId="lot-1"
      activeLotName="Uma ni Erin"
    />
  );
}

describe("FullFarmMap landmark floating address callout", () => {
  it("shows only the white 3-line address callout, hides callout and farm name while navigating, and follows pin clicks and pans", async () => {
    vi.useFakeTimers();
    let panOffsetX = 0;
    let panOffsetY = 0;
    const handlers: Record<string, Array<(e?: unknown) => void>> = {};
    const setIconCalls: Array<{ html?: string }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          features: [
            {
              properties: {
                name: "Casa de Madrid Apartelle",
                city: "Maramag",
                state: "Bukidnon",
                country: "Philippines",
              },
            },
          ],
        }),
      })),
    );

    const map = {
      setView: vi.fn().mockReturnThis(),
      flyTo: vi.fn().mockReturnThis(),
      fitBounds: vi.fn(),
      invalidateSize: vi.fn(),
      remove: vi.fn(),
      removeLayer: vi.fn(),
      latLngToContainerPoint: vi.fn((pt: [number, number] | { lat: number; lng: number }) => {
        const lat = Array.isArray(pt) ? pt[0] : pt.lat;
        const lng = Array.isArray(pt) ? pt[1] : pt.lng;
        return {
          x: Math.round((lng - 124) * 400 + panOffsetX),
          y: Math.round((9 - lat) * 400 + panOffsetY),
        };
      }),
      on: vi.fn((event: string, cb: (e?: unknown) => void) => {
        handlers[event] = [...(handlers[event] ?? []), cb];
      }),
      off: vi.fn(),
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
      polygon: () => ({
        setLatLngs: vi.fn(),
        setStyle: vi.fn(),
        on: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
      }),
      circle: () => ({
        setLatLng: vi.fn().mockReturnThis(),
        setRadius: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
      }),
      marker: vi.fn((initialPt: [number, number]) => {
        let current = { lat: initialPt[0], lng: initialPt[1] };
        return {
          addTo: vi.fn().mockReturnThis(),
          setLatLng: vi.fn((next: [number, number] | { lat: number; lng: number }) => {
            current = Array.isArray(next) ? { lat: next[0], lng: next[1] } : next;
          }),
          getLatLng: vi.fn(() => current),
          setIcon: vi.fn((icon: { html?: string }) => {
            setIconCalls.push(icon);
          }),
          on: vi.fn().mockReturnThis(),
          remove: vi.fn(),
        };
      }),
      divIcon: vi.fn((opts: object) => opts),
      tileLayer: createTileLayer,
    });

    render(
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

    // Click Location A on the map
    const locA = { lat: 7.28755, lng: 124.8599 };
    await act(async () => {
      handlers["click"]?.forEach((cb) => cb({ latlng: locA }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const addressCard = screen.getByRole("status", { name: "Selected location address" });
    expect(addressCard.classList.contains("is-anchored")).toBe(true);
    expect(addressCard.querySelector(".landmark-anchor-pointer")).toBeTruthy();
    expect(addressCard.querySelector("img")).toBeNull();
    expect(addressCard.textContent).toContain("Casa de Madrid Apartelle");
    expect(addressCard.textContent).toContain("Maramag, Bukidnon, Philippines");
    expect(addressCard.textContent).toContain("7.28755°, 124.85990°");

    // During navigation, neither "You are currently here" nor the active farm name renders on the pin
    const latestIconHtml = setIconCalls[setIconCalls.length - 1]?.html ?? "";
    expect(latestIconHtml).not.toContain("You are currently here");
    expect(latestIconHtml).not.toContain("Ania ka karon dinhi");
    expect(latestIconHtml).not.toContain("Uma ni Erin");

    const expectedAx = Math.round((locA.lng - 124) * 400);
    const expectedAy = Math.round((9 - locA.lat) * 400);
    expect(addressCard.style.getPropertyValue("--anchor-x")).toBe(`${expectedAx}px`);
    expect(addressCard.style.getPropertyValue("--anchor-y")).toBe(`${expectedAy}px`);

    // Pan/zoom the map: white address callout follows the shifted container coordinates on "move"
    panOffsetX = 95;
    panOffsetY = -60;
    act(() => {
      handlers["move"]?.forEach((cb) => cb());
    });
    expect(addressCard.style.getPropertyValue("--anchor-x")).toBe(`${expectedAx + 95}px`);
    expect(addressCard.style.getPropertyValue("--anchor-y")).toBe(`${expectedAy - 60}px`);

    // Click Location B on the map: white address callout jumps cleanly to Location B
    const locB = { lat: 8.15125, lng: 125.1245 };
    await act(async () => {
      handlers["click"]?.forEach((cb) => cb({ latlng: locB }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const expectedBx = Math.round((locB.lng - 124) * 400 + panOffsetX);
    const expectedBy = Math.round((9 - locB.lat) * 400 + panOffsetY);
    expect(addressCard.style.getPropertyValue("--anchor-x")).toBe(`${expectedBx}px`);
    expect(addressCard.style.getPropertyValue("--anchor-y")).toBe(`${expectedBy}px`);
  });
});
