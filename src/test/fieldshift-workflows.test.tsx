import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/index";

const App = Route.options.component!;
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
function renderApp() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );
}
describe("FieldShift planning workflows", () => {
  it("carries manually selected coordinates into the NASA request when the map is offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "My farm" }));
    const script = document.querySelector(
      'script[src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"]',
    );
    expect(script).not.toBeNull();
    fireEvent.error(script!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Map unavailable");
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "8.2" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "125.1" } });
    fireEvent.click(screen.getByRole("button", { name: "Set location" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to crop planning" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain("latitude=8.2&longitude=125.1");
    expect(JSON.parse(localStorage.getItem("fieldshift-location")!)).toEqual({
      latitude: 8.2,
      longitude: 125.1,
    });
  });
  it("recalculates recovery revenue and carries reported drainage into next-season options", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Damage recovery" }));
    fireEvent.change(screen.getByLabelText("Expected yield (kg/ha)"), {
      target: { value: "3000" },
    });
    fireEvent.change(screen.getByLabelText("Farmgate price (₱/kg)"), { target: { value: "20" } });
    expect(screen.getByText("₱57,330")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Farmgate price (₱/kg)"), { target: { value: "-1" } });
    expect(screen.getByText("Enter valid assumptions")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Current field drainage"), {
      target: { value: "Poor" },
    });
    fireEvent.change(screen.getByLabelText("Planned next planting"), {
      target: { value: "2026-11-15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Compare next-season options" }));
    expect(screen.getAllByText(/Poor drainage: demo soil rating/)).toHaveLength(3);
  });
});

it("fills public location and soil fields and preserves manual corrections across navigation", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes("open-meteo")
          ? { elevation: [100, 100, 100, 100, 100] }
          : url.includes("photon")
            ? {
                features: [
                  { properties: { city: "Lantapan", state: "Bukidnon", country: "Philippines" } },
                ],
              }
            : {
                properties: {
                  layers: [
                    ["phh2o", 62],
                    ["sand", 200],
                    ["silt", 350],
                    ["clay", 450],
                  ].map(([name, mean]) => ({
                    name,
                    depths: [{ label: "5-15cm", values: { mean } }],
                  })),
                },
              },
    })),
  );
  renderApp();
  fireEvent.click(screen.getByRole("button", { name: "My farm" }));
  fireEvent.click(screen.getByRole("button", { name: "Set location" }));
  await waitFor(() => expect(screen.getByLabelText("Soil pH (water, editable)")).toHaveValue(6.2), {
    timeout: 3000,
  });
  expect(screen.getByLabelText("Municipality / city (automatic, editable)")).toHaveValue(
    "Lantapan",
  );
  expect(screen.getByLabelText("Soil texture / type (editable)")).toHaveValue(
    "Sand 20.0% · Silt 35.0% · Clay 45.0%",
  );
  expect(screen.getByLabelText("Field drainage")).toHaveValue("Unknown");
  fireEvent.click(
    await screen.findByRole("button", { name: "I checked the field — use poor drainage" }),
  );
  expect(screen.getByLabelText("Field drainage")).toHaveValue("Poor");
  fireEvent.change(screen.getByLabelText("Field drainage"), { target: { value: "Good" } });
  fireEvent.change(screen.getByLabelText("Soil pH (water, editable)"), {
    target: { value: "5.7" },
  });
  fireEvent.click(screen.getAllByRole("button", { name: "Overview" })[0]!);
  fireEvent.click(screen.getByRole("button", { name: "My farm" }));
  expect(screen.getByLabelText("Soil pH (water, editable)")).toHaveValue(5.7);
  expect(screen.getByLabelText("Field drainage")).toHaveValue("Good");
  expect(screen.getByLabelText("Irrigation")).toHaveValue("Unknown");
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
});
