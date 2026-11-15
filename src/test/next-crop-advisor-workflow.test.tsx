import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Route } from "@/routes/index";
import { advisorRequestSchema } from "@/lib/advisor";
const App = Route.options.component!;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it.each([false, true])(
  "hands the actual next-crop result to the advisor and recovers from an initial failure (%s)",
  async (initialFailure) => {
    let advisorCalls = 0;
    vi.stubGlobal("scrollTo", vi.fn());
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.setItem("fieldshift-location", JSON.stringify({ latitude: 8.3, longitude: 125 }));
    localStorage.setItem("fieldshift-location-confirmed", "true");
    localStorage.setItem(
      "fieldshift-boundary",
      JSON.stringify([
        { latitude: 8.3, longitude: 125 },
        { latitude: 8.301, longitude: 125 },
        { latitude: 8.301, longitude: 125.001 },
      ]),
    );
    const rain: Record<string, number> = {},
      temp: Record<string, number> = {};
    const end = new Date().getUTCFullYear() - 1;
    for (let year = end - 9; year <= end; year++)
      for (let month = 1; month <= 12; month++) {
        const key = `${year}${String(month).padStart(2, "0")}`;
        rain[key] = 100;
        temp[key] = 25;
      }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/temporal/monthly/"))
          return {
            ok: true,
            json: async () => ({
              header: { fill_value: -999 },
              parameters: { PRECTOTCORR: { units: "mm/month" }, T2M: { units: "C" } },
              properties: { parameter: { PRECTOTCORR: rain, T2M: temp } },
            }),
          };
        if (url === "/api/advisor") {
          advisorCalls++;
          if (initialFailure && advisorCalls === 1)
            return {
              ok: false,
              text: async () => "The advisor could not reach Google. Please try again shortly.",
            };
          return {
            ok: true,
            json: async () => ({ answer: "Review this crop with a local technician." }),
          };
        }
        throw new Error("Other public services offline");
      }),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <App />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Crop Rotation/ }));
    const openAdvisory = screen.queryByRole("button", { name: "Open Advisory" });
    if (openAdvisory) fireEvent.click(openAdvisory);
    expect(screen.queryByRole("button", { name: "Open AI field advisor" })).not.toBeInTheDocument();
    const date = `${new Date().getFullYear() + 1}-12-15`;
    fireEvent.change(screen.getByLabelText("When will you plant next?"), {
      target: { value: date },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suggest my next crop" }));
    expect(await screen.findByText("NEXT CROP TO CONSIDER")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ask AI advisor about this result" }));
    expect(screen.getByRole("region", { name: "AI field advisor" })).toBeInTheDocument();
    expect(screen.getByText("Crop planning")).toBeInTheDocument();
    expect(screen.queryByText("Damage recovery")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "What should I plant next?" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "AI field advisor" }).closest("aside"),
    ).toHaveAttribute("aria-label", "Crop rotation and disaster recovery");
    expect(screen.queryByText("Picking up where you left off.")).not.toBeInTheDocument();
    if (initialFailure) {
      expect(
        await screen.findByText("The advisor could not reach Google. Please try again shortly."),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Back to result" }));
      fireEvent.click(screen.getByRole("button", { name: "Ask AI advisor about this result" }));
    }
    expect(
      await screen.findByText("Review this crop with a local technician."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("The advisor could not reach Google. Please try again shortly."),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Ask a question..."), {
      target: { value: "Why this next crop?" },
    });
    fireEvent.submit(screen.getByPlaceholderText("Ask a question...").closest("form")!);
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.some(([url]) => url === "/api/advisor")).toBe(true),
    );
    const call = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/advisor")!;
    const payload = JSON.parse(String((call as unknown as [string, RequestInit])[1].body));
    expect(advisorRequestSchema.safeParse(payload).success).toBe(true);
    expect(payload.context.nextCropPlan.planted).toBe(date);
    expect(payload.context.nextCropPlan.suggestions).toHaveLength(3);
    expect(payload.context.nextCropPlan.climateMonths).toHaveLength(12);
    expect(payload.context.nextCropPlan.climateMonths[0]).toMatchObject({
      month: 1,
      validYears: 10,
      rainfallMm: 100,
      rainfallMinMm: 100,
      rainfallMaxMm: 100,
      temperatureC: 25,
    });
    expect(payload.context.nextCropPlan.climateMonths[11].month).toBe(12);
    expect(payload.context.nextCropPlan.climateSourceUrl).toContain("power.larc.nasa.gov");
    const repeatedMonth = structuredClone(payload);
    repeatedMonth.context.nextCropPlan.climateMonths[1].month = 1;
    expect(advisorRequestSchema.safeParse(repeatedMonth).success).toBe(false);
    expect(payload.context.rotation).toBe(payload.context.nextCropPlan.suggestions[0].crop);
    expect(payload.context.rotationDetails).toBeUndefined();
    expect(payload.context.agronomyAdvisory).toBeUndefined();
    expect(payload.context.weather).toBeNull();
    expect(payload.context.workflow).toBe("prevention");
    expect(payload.context.recovery).toBeUndefined();
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/advisor")).toHaveLength(
        initialFailure ? 3 : 2,
      ),
    );
    expect(payload.question).toContain("Explain this next-crop result briefly");
    fireEvent.click(screen.getByRole("button", { name: "Back to result" }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "AI field advisor" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Open AI field advisor" })).not.toBeInTheDocument();
    expect(screen.getByText("NEXT CROP TO CONSIDER")).toBeInTheDocument();
    expect(screen.getByText(date)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ask AI advisor about this result" }));
    expect(screen.getByRole("region", { name: "AI field advisor" })).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/advisor")).toHaveLength(
      initialFailure ? 3 : 2,
    );
    const bisaya = screen.getByRole("button", { name: "Bisaya" });
    await waitFor(() => expect(bisaya).toBeEnabled());
    fireEvent.click(bisaya);
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/advisor")).toHaveLength(
        initialFailure ? 4 : 3,
      ),
    );
    const lastCall = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => url === "/api/advisor")
      .at(-1)!;
    const translated = JSON.parse(String((lastCall as unknown as [string, RequestInit])[1].body));
    expect(translated.language).toBe("bisaya");
    expect(translated.question).toContain("Bisaya (Cebuano)");
    fireEvent.click(screen.getByRole("button", { name: "Back to result" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit planting details" }));
    expect(screen.getByLabelText("When will you plant next?")).toHaveValue(date);
  },
);

it("opens recovery advice from the final recovery step with recovery context", async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/advisor")
      return { ok: true, json: async () => ({ answer: "Record the affected area and check drainage." }) };
    throw new Error("Public service offline");
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <App />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Disaster Recovery/ }));
  fireEvent.change(screen.getByLabelText("Damaged crop"), { target: { value: "Banana" } });
  fireEvent.click(screen.getByRole("button", { name: "Human-caused" }));
  fireEvent.change(screen.getByLabelText("What happened? (optional)"), { target: { value: "A nearby fire reached the field." } });
  expect(screen.getByText("No event photo added")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByLabelText("Expected yield (kg/ha)")).toHaveValue(null);
  expect(screen.getByText("Enter valid assumptions")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ask AI advisor about this recovery" }));
  expect(screen.getByRole("region", { name: "AI field advisor" })).toBeInTheDocument();
  expect(screen.getByText("Damage recovery")).toBeInTheDocument();
  expect(screen.queryByText("Crop planning")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "What should I check first?" }));
  await screen.findByText("Record the affected area and check drainage.");
  const call = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/advisor")!;
  const payload = JSON.parse(String((call as unknown as [string, RequestInit])[1].body));
  expect(payload.context.workflow).toBe("recovery");
  expect(payload.context.farm.crop).toBe("Banana");
  expect(payload.context.recovery.expectedYieldKgPerHectare).toBeNull();
  expect(payload.context.recovery.hazard).toBe("Human-caused");
  expect(payload.context.recovery.observations).toBe("A nearby fire reached the field.");
  expect(payload.context.weather).toBeNull();
  expect(payload.history).toEqual([]);
});
