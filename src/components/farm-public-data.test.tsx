import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FarmPublicData } from "./farm-public-data";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("automatically fills a confirmed location with independently sourced city and soil estimates", async () => {
  const fetch = vi.fn().mockImplementation(async (url: string) => ({
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
  }));
  vi.stubGlobal("fetch", fetch);
  const onApply = vi.fn();
  const client = new QueryClient();
  const view = (latitude: number, confirmed: boolean) => (
    <QueryClientProvider client={client}>
      <FarmPublicData
        location={{ latitude, longitude: 125 }}
        confirmed={confirmed}
        onApply={onApply}
      />
    </QueryClientProvider>
  );
  const { rerender } = render(view(8.3, false));
  expect(fetch).not.toHaveBeenCalled();
  rerender(view(8.3, true));
  expect(
    await screen.findByText(/Detected municipality \/ city: Lantapan/, {}, { timeout: 3000 }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(onApply).toHaveBeenCalledWith({
      ph: "6.2",
      soil: "Sand 20.0% · Silt 35.0% · Clay 45.0%",
    }),
  );
  expect(onApply).not.toHaveBeenCalledWith({ drainage: "Poor" });
  fireEvent.click(
    await screen.findByRole("button", { name: "I checked the field — use poor drainage" }),
  );
  expect(onApply).toHaveBeenCalledWith({ drainage: "Poor" });
  const sources = screen.getByText("Sources & API details").closest("details");
  expect(sources).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("Sources & API details"));
  expect(screen.getByRole("link", { name: /Exact SoilGrids response/ })).toHaveAttribute(
    "href",
    expect.stringContaining("depth=5-15cm"),
  );
  rerender(view(8.5, true));
  expect(screen.queryByText(/Detected municipality \/ city: Lantapan/)).not.toBeInTheDocument();
});
