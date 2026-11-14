import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoricalWeatherPanel } from "./historical-weather";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function panel(latitude = 8.3) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <HistoricalWeatherPanel location={{ latitude, longitude: 125 }} onUse={vi.fn()} />
    </QueryClientProvider>
  );
}
describe("Historical weather interface", () => {
  it("only contacts NASA after an explicit request and shows connection failure honestly", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetch);
    render(panel());
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Load historical weather" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No sample values have been substituted",
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0]?.[0])).toContain("latitude=8.3");
  });
  it("shows missing coverage and disables applying a partial period to scoring", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          properties: {
            parameter: {
              PRECTOTCORR: { "20240101": 10 },
              T2M: { "20240101": 24 },
            },
          },
        }),
      }),
    );
    render(panel());
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2024-01-01" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2024-01-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Load historical weather" }));
    expect(await screen.findByText("1 / 2")).toBeInTheDocument();
    expect(screen.getAllByText("Incomplete")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Use full year as demo water context" }),
    ).toBeDisabled();
    expect(screen.getByRole("link", { name: /Open exact NASA JSON/ })).toHaveAttribute(
      "href",
      expect.stringContaining("start=20240101"),
    );
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2024-01-03" } });
    expect(screen.queryByText("1 / 2")).not.toBeInTheDocument();
  });
});

it("automatically loads actual monthly charts and refetches for a different year", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const fetch = vi.fn().mockImplementation(async (url: string) => {
    const year = new URL(url).searchParams.get("start")!.slice(0, 4);
    const rain: Record<string, number> = {};
    const temperature: Record<string, number> = {};
    for (
      let time = Date.parse(`${year}-01-01`);
      time <= Date.parse(`${year}-12-31`);
      time += 86400000
    ) {
      const key = new Date(time).toISOString().slice(0, 10).replaceAll("-", "");
      rain[key] = 1;
      temperature[key] = 24;
    }
    return {
      ok: true,
      json: async () => ({ properties: { parameter: { PRECTOTCORR: rain, T2M: temperature } } }),
    };
  });
  vi.stubGlobal("fetch", fetch);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <HistoricalWeatherPanel location={{ latitude: 8.3, longitude: 125 }} monthlyCharts />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("region", { name: "NASA monthly rainfall" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "NASA monthly temperature" })).toBeInTheDocument();
  expect(screen.queryByText("SAMPLE CLIMATE PATTERNS")).not.toBeInTheDocument();
  expect(screen.getAllByText("31.0").length).toBeGreaterThan(0);
  fireEvent.change(screen.getByLabelText("Historical year"), { target: { value: "2024" } });
  expect(await screen.findByText("366.0 mm")).toBeInTheDocument();
  expect(String(fetch.mock.calls.at(-1)?.[0])).toContain("start=20240101");
});
