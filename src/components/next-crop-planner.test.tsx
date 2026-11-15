import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NextCropPlanner } from "./next-crop-planner";
import type { NextCropField } from "@/lib/fieldshift-demo";
const result = vi.fn();
const ask = vi.fn();
const date = `${new Date().getFullYear() + 1}-12-15`;
function weather() {
  const rain: Record<string, number> = {},
    temperature: Record<string, number> = {};
  const end = new Date().getUTCFullYear() - 1;
  for (let year = end - 9; year <= end; year++)
    for (let month = 1; month <= 12; month++) {
      const key = `${year}${String(month).padStart(2, "0")}`;
      rain[key] = 100;
      temperature[key] = 25;
    }
  return {
    header: { fill_value: -999 },
    parameters: { PRECTOTCORR: { units: "mm/month" }, T2M: { units: "C" } },
    properties: { parameter: { PRECTOTCORR: rain, T2M: temperature } },
  };
}
function Harness({
  confirmed = true,
  initialPh = "6",
}: {
  confirmed?: boolean;
  initialPh?: string;
}) {
  const [farm, setFarm] = useState<NextCropField>({
    crop: "Corn",
    previous: "Corn",
    planted: "2000-01-01",
    ph: initialPh,
    soil: "Loam",
    drainage: "Good",
    irrigation: "Rain-fed",
  });
  return (
    <NextCropPlanner
      location={{ latitude: 8.3, longitude: 125 }}
      locationConfirmed={confirmed}
      farm={farm}
      terrain={{ elevation: 300, slopePercent: 3 }}
      onUpdate={(key, value) => setFarm((current) => ({ ...current, [key]: value }))}
      onResult={result}
      onAskAdvisor={ask}
    />
  );
}
function setup(confirmed = true, initialPh = "6") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness confirmed={confirmed} initialPh={initialPh} />
    </QueryClientProvider>,
  );
  return client;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("requires an explicitly chosen date and confirmed location before requesting history", () => {
  vi.stubGlobal("fetch", vi.fn());
  setup(false);
  expect(screen.getByRole("button", { name: "Suggest my next crop" })).toBeDisabled();
  expect(screen.getByLabelText("When will you plant next?")).toHaveValue("");
  expect(fetch).not.toHaveBeenCalled();
});
it("shows a suggestion plus alternatives, passes the same result, and clears it after edits", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => weather() }));
  setup();
  fireEvent.change(screen.getByLabelText("When will you plant next?"), { target: { value: date } });
  fireEvent.click(screen.getByRole("button", { name: "Suggest my next crop" }));
  expect(await screen.findByText("NEXT CROP TO CONSIDER")).toBeInTheDocument();
  expect(screen.getByText("NEXT CROP TO CONSIDER").closest(".next-crop-results")).toHaveFocus();
  expect(screen.queryByRole("button", { name: "Suggest my next crop" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Current crop")).not.toBeInTheDocument();
  expect(screen.getByTestId("next-crop-history-ref").textContent).toContain("Current crop");
  expect(screen.getByTestId("next-crop-history-ref").textContent).toContain("Previous crop");
  expect(screen.getByTestId("next-crop-history-ref").textContent).toContain("Corn");
  expect(screen.queryByText("Soil pH: 6")).not.toBeInTheDocument();
  expect(screen.getAllByText("ALTERNATIVE")).toHaveLength(2);
  expect(screen.queryByText(/\/ 100/)).not.toBeInTheDocument();
  expect(
    screen.getByText(/Not a forecast or verified agronomic recommendation/),
  ).toBeInTheDocument();
  await waitFor(() => expect(result.mock.calls.at(-1)?.[0]?.result.suggestions.length).toBe(3));
  expect(result.mock.calls.at(-1)?.[0]?.result.planted).toBe(date);
  expect(result.mock.calls.at(-1)?.[0]?.climateMonths).toHaveLength(12);
  fireEvent.click(screen.getByRole("button", { name: "Ask AI advisor about this result" }));
  expect(ask).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Edit planting details" }));
  expect(screen.getByLabelText("When will you plant next?")).toHaveValue(date);
  fireEvent.change(screen.getByLabelText("Current crop"), { target: { value: "Rice" } });
  expect(screen.queryByText("NEXT CROP TO CONSIDER")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Update suggestion" })).toBeEnabled();
  await waitFor(() => expect(result.mock.calls.at(-1)?.[0]).toBeNull());
});
it("reports NASA failure and permits retry without fabricating a result", async () => {
  let nasaCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (!url.includes("/temporal/monthly/")) throw new Error("Soil service offline");
      nasaCalls++;
      return nasaCalls === 1
        ? { ok: false, status: 503 }
        : { ok: true, json: async () => weather() };
    }),
  );
  setup();
  fireEvent.change(screen.getByLabelText("When will you plant next?"), { target: { value: date } });
  fireEvent.click(screen.getByRole("button", { name: "Suggest my next crop" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("503");
  expect(screen.queryByText("NEXT CROP TO CONSIDER")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry weather history" }));
  expect(await screen.findByText("NEXT CROP TO CONSIDER")).toBeInTheDocument();
});
it("cancels the obsolete weather request when planting input changes", async () => {
  let aborted = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    ),
  );
  setup();
  fireEvent.change(screen.getByLabelText("When will you plant next?"), { target: { value: date } });
  fireEvent.click(screen.getByRole("button", { name: "Suggest my next crop" }));
  await waitFor(() =>
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/temporal/monthly/")),
    ).toBe(true),
  );
  fireEvent.change(screen.getByLabelText("When will you plant next?"), {
    target: { value: `${new Date().getFullYear() + 1}-11-15` },
  });
  await waitFor(() => expect(aborted).toBe(true));
});

it("automatically fills SoilGrids pH and preserves a manual correction on refresh", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        properties: {
          layers: [
            {
              name: "phh2o",
              unit_measure: { d_factor: 10 },
              depths: [{ label: "5-15cm", values: { mean: 62, "Q0.05": 55, "Q0.95": 69 } }],
            },
          ],
        },
      }),
    }),
  );
  setup(true, "");
  const input = screen.getByLabelText("Soil pH (automatic, editable)");
  await waitFor(() => expect(input).toHaveValue(6.2));
  expect(screen.getByRole("link", { name: /Soil source/ })).toHaveAttribute(
    "href",
    expect.stringContaining("rest.isric.org"),
  );
  fireEvent.change(input, { target: { value: "5.7" } });
  fireEvent.click(screen.getByRole("button", { name: "Refresh soil estimate" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(input).toHaveValue(5.7);
});
it("keeps automated pH unknown when SoilGrids is unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
  setup(true, "");
  expect(await screen.findByText(/Soil lookup is unavailable/)).toBeInTheDocument();
  expect(screen.getByLabelText("Soil pH (automatic, editable)")).toHaveValue(null);
});
