import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Route } from "@/routes/index";

const App = Route.options.component!;
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
it("draws a boundary, fills hectares, preserves it when cancelling a redraw, and uses the area in recovery", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  let click = (_event: { latlng: { lat: number; lng: number } }) => {};
  const map = {
    setView: vi.fn().mockReturnThis(),
    fitBounds: vi.fn(),
    remove: vi.fn(),
    on: vi.fn((_event: string, handler: typeof click) => {
      click = handler;
    }),
  };
  const polygon = { setLatLngs: vi.fn(), addTo: vi.fn().mockReturnThis() };
  const circleMarker = vi.fn();
  vi.stubGlobal("L", {
    map: () => map,
    polygon: () => polygon,
    circleMarker,
    tileLayer: () => ({ addTo: () => ({ on: vi.fn() }) }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "My farm" }));
  fireEvent.load(
    document.querySelector('script[src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"]')!,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Draw farm boundary" })).toBeEnabled(),
  );
  expect(circleMarker).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Draw farm boundary" }));
  const d = ((100 / 6371008.8) * 180) / Math.PI;
  const w = d / Math.cos((8 * Math.PI) / 180);
  act(() => {
    for (const [lat, lng] of [
      [8, 125],
      [8, 125 + w],
      [8 + d, 125 + w],
      [8 + d, 125],
    ])
      click({ latlng: { lat: lat!, lng: lng! } });
  });
  fireEvent.click(screen.getByRole("button", { name: "Finish boundary" }));
  const area = screen.getByLabelText(/Farm area/);
  expect(Number((area as HTMLInputElement).value)).toBeCloseTo(1, 3);
  expect(area).toHaveAttribute("readonly");
  expect(JSON.parse(localStorage.getItem("fieldshift-boundary")!)).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: "Redraw farm boundary" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel drawing" }));
  expect(area).toHaveAttribute("readonly");
  fireEvent.click(screen.getByRole("button", { name: "Damage recovery" }));
  expect(screen.getByText("1.0000 ha")).toBeInTheDocument();
  expect(screen.getByText("₱24,570")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "My farm" }));
  fireEvent.click(screen.getByRole("button", { name: "Clear boundary" }));
  expect(screen.getByLabelText(/Farm area/)).not.toHaveAttribute("readonly");
  expect(Number((screen.getByLabelText(/Farm area/) as HTMLInputElement).value)).toBeCloseTo(1, 3);
});
