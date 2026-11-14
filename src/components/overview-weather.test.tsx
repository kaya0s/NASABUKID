import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { fetchCurrentWeather, OverviewWeatherWidget } from "./overview-weather";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows unknown weather instead of sample measurements before data loads", () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OverviewWeatherWidget location={{ latitude: 8.3, longitude: 125 }} />
    </QueryClientProvider>,
  );
  expect(screen.getByText("Weather unavailable")).toBeInTheDocument();
  expect(screen.queryByText("80%")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
});
it("rejects missing weather measurements rather than converting null to zero", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ current: { temperature_2m: null } }) }),
  );
  await expect(fetchCurrentWeather({ latitude: 8.3, longitude: 125 })).rejects.toThrow();
});
