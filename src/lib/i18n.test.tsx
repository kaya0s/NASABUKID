import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FullFarmMap, type FarmProfileData } from "@/components/full-farm-map";
import {
  LocaleProvider,
  translateCropName,
  translateRotationText,
  type AppLocale,
} from "./i18n";
import type { Coordinates } from "./nasa-power";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SAMPLE_FARM: FarmProfileData = {
  place: "Malaybalay, Bukidnon",
  area: "3.1881",
  crop: "Sugar Cane",
  previous: "Corn",
  ph: "6.0",
  soil: "Clay loam",
  irrigation: "Rain-fed",
  drainage: "Moderate",
  planted: "2026-12-01",
};

function BilingualHarness() {
  const [locale, setLocale] = useState<AppLocale>("en");
  const [location, setLocation] = useState<Coordinates>({
    latitude: 8.1575,
    longitude: 125.1277,
  });
  const [boundary, setBoundary] = useState<Coordinates[]>([
    { latitude: 8.156, longitude: 125.126 },
    { latitude: 8.156, longitude: 125.129 },
    { latitude: 8.159, longitude: 125.129 },
  ]);
  const [farm, setFarm] = useState<FarmProfileData>(SAMPLE_FARM);

  return (
    <LocaleProvider locale={locale} onLocaleChange={setLocale}>
      <FullFarmMap
        location={location}
        onChange={setLocation}
        boundary={boundary}
        onBoundary={setBoundary}
        areaLabel="3.1881 ha"
        farm={farm}
        onUpdateFarm={(key, value) => setFarm((prev) => ({ ...prev, [key]: value }))}
        terrain={{ elevation: 298, slopePercent: 2.5 }}
      />
    </LocaleProvider>
  );
}

describe("English to Cebuano (EN | CEB) workspace translation", () => {
  it("translates telemetry, advisory headings, crop names, and topography badge on CEB toggle", async () => {
    const createTileLayer = () => {
      const layer = { on: vi.fn(), addTo: vi.fn(), remove: vi.fn() };
      layer.on.mockReturnValue(layer);
      layer.addTo.mockReturnValue(layer);
      return layer;
    };
    const map = {
      setView: vi.fn().mockReturnThis(),
      flyTo: vi.fn().mockReturnThis(),
      fitBounds: vi.fn(),
      invalidateSize: vi.fn(),
      remove: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    vi.stubGlobal("L", {
      map: () => map,
      polygon: () => ({
        setLatLngs: vi.fn(),
        setStyle: vi.fn(),
        getBounds: vi.fn(() => ({ isValid: () => true })),
        addTo: vi.fn().mockReturnThis(),
      }),
      circleMarker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), remove: vi.fn() })),
      tileLayer: createTileLayer,
    });

    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <BilingualHarness />
      </QueryClientProvider>,
    );

    const leafletScript = document.querySelector(
      'script[src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"]',
    );
    await act(async () => {
      if (leafletScript) fireEvent.load(leafletScript);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("Crop Rotation & Land Advisory")).toBeTruthy();
    expect(screen.getByText("MOISTURE")).toBeTruthy();

    // Language toggle renders full English/Cebuano labels outside top actions bar & left of open drawer
    const langFloat = container.querySelector(".full-map-lang-float");
    expect(langFloat).toBeTruthy();
    expect(langFloat?.classList.contains("is-drawer-open")).toBe(true);
    expect(container.querySelector(".full-map-actions .lang-toggle-pill")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cebuano" }));

    expect(screen.getByText("Tambag sa pagliso sa tanom ug yuta")).toBeTruthy();
    expect(screen.getByText("UMOG SA YUTA")).toBeTruthy();
    expect(screen.getByText("KAINIT SA YUTA")).toBeTruthy();
    expect(screen.getByText("ULAN (30D)")).toBeTruthy();
    expect(screen.getByText("KAHIMSOG")).toBeTruthy();
    expect(screen.queryByLabelText("Terrain and slope summary")).toBeNull();

    // Closing the right drawer removes is-drawer-open so toggle glides cleanly under the options card
    fireEvent.click(screen.getByRole("button", { name: "Isira ang panel sa tambag" }));
    expect(langFloat?.classList.contains("is-drawer-open")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("button", { name: "Redraw boundary" })).toBeTruthy();
  });

  it("translates crop names and parameterized rotation screening sentences cleanly", () => {
    expect(translateCropName("Sugar Cane", "ceb")).toBe("Tubo");
    expect(translateCropName("Mungbean", "ceb")).toBe("Monggo");
    expect(
      translateRotationText(
        "Historical annual rain averages 2150 mm across 10 complete years, within this crop's broad reference limits.",
        "ceb",
      ),
    ).toContain("2150 mm");
    expect(
      translateRotationText(
        "Changes crop family from the current crop; local pest and disease history still needs review.",
        "ceb",
      ),
    ).toContain("Mag-ilis sa pamilya sa tanom");
  });

  it("frames current location at zoom 17 and shows the bilingual yellow location callout", async () => {
    const createTileLayer = () => {
      const layer = { on: vi.fn(), addTo: vi.fn(), remove: vi.fn() };
      layer.on.mockReturnValue(layer);
      layer.addTo.mockReturnValue(layer);
      return layer;
    };
    const fitBounds = vi.fn();
    const map = {
      setView: vi.fn().mockReturnThis(),
      flyTo: vi.fn().mockReturnThis(),
      fitBounds,
      invalidateSize: vi.fn(),
      remove: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };
    const setIcon = vi.fn().mockReturnThis();
    const divIcon = vi.fn((opts: { html: string }) => opts);

    vi.stubGlobal("L", {
      map: () => map,
      polygon: () => ({
        setLatLngs: vi.fn(),
        setStyle: vi.fn(),
        getBounds: vi.fn(() => ({ isValid: () => true })),
        addTo: vi.fn().mockReturnThis(),
      }),
      circle: vi.fn(() => ({
        setLatLng: vi.fn().mockReturnThis(),
        setRadius: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
      })),
      marker: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        setLatLng: vi.fn().mockReturnThis(),
        setIcon,
        addTo: vi.fn().mockReturnThis(),
      })),
      divIcon,
      tileLayer: createTileLayer,
    });

    function PointOnlyHarness() {
      const [locale, setLocale] = useState<AppLocale>("en");
      const [location, setLocation] = useState<Coordinates>({ latitude: 7.76706, longitude: 124.99071 });
      const [boundary, setBoundary] = useState<Coordinates[]>([]);
      const [farm, setFarm] = useState<FarmProfileData>(SAMPLE_FARM);
      return (
        <LocaleProvider locale={locale} onLocaleChange={setLocale}>
          <FullFarmMap
            location={location}
            onChange={setLocation}
            boundary={boundary}
            onBoundary={setBoundary}
            areaLabel=""
            farm={farm}
            onUpdateFarm={(k, v) => setFarm((p) => ({ ...p, [k]: v }))}
          />
        </LocaleProvider>
      );
    }

    render(
      <QueryClientProvider client={new QueryClient()}>
        <PointOnlyHarness />
      </QueryClientProvider>,
    );

    const leafletScript = document.querySelector(
      'script[src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"]',
    );
    await act(async () => {
      if (leafletScript) fireEvent.load(leafletScript);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fitBounds).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ maxZoom: 17 }),
    );
    expect(divIcon).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("You are currently here"),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Cebuano" }));
    expect(setIcon).toHaveBeenCalled();
    expect(divIcon).toHaveBeenLastCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("Ania ka karon dinhi"),
      }),
    );
  });
});
