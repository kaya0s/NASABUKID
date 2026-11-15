import { afterEach, expect, it, vi } from "vitest";
import { fetchSoilContext, parseSoilPhMap, soilPhMapUrl } from "./farm-context";
const location = { latitude: 8.3, longitude: 125 };
const point = {
  type: "FeatureCollection",
  features: [{ id: "phh2o_5-15cm_mean", properties: { pixel_value: 55, unit: "pH*10" } }],
};
afterEach(() => vi.unstubAllGlobals());
it("requests the centred official map layer and scales its published pH units", () => {
  const url = new URL(soilPhMapUrl(location));
  expect(url.searchParams.get("SRS")).toBe("EPSG:4326");
  expect(url.searchParams.get("QUERY_LAYERS")).toBe("phh2o_5-15cm_mean");
  expect(url.searchParams.get("INFO_FORMAT")).toBe("application/geo+json");
  expect(parseSoilPhMap(point)).toBe(5.5);
});
it("rejects nodata, incorrect units, incorrect depths and invalid scaled values", () => {
  expect(() => parseSoilPhMap({ type: "FeatureCollection", features: [] })).toThrow();
  for (const properties of [
    { pixel_value: -32768, unit: "pH*10" },
    { pixel_value: 55, unit: "pH" },
    { pixel_value: 150, unit: "pH*10" },
    { pixel_value: null, unit: "pH*10" },
  ]) {
    expect(() =>
      parseSoilPhMap({
        type: "FeatureCollection",
        features: [{ id: "phh2o_5-15cm_mean", properties }],
      }),
    ).toThrow();
  }
  expect(() =>
    parseSoilPhMap({ ...point, features: [{ ...point.features[0], id: "phh2o_0-5cm_mean" }] }),
  ).toThrow();
});
it("falls back from unavailable REST to the real map response without inventing texture", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => point }),
  );
  const data = await fetchSoilContext(location, new AbortController().signal);
  expect(data.ph).toBe(5.5);
  expect(data.texture).toBeNull();
  expect(data.phRange).toBeNull();
  expect(data.sourceUrl).toContain("maps.isric.org");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("does not start fallback after the request is cancelled", async () => {
  const controller = new AbortController();
  controller.abort();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")));
  await expect(fetchSoilContext(location, controller.signal)).rejects.toThrow("Aborted");
  expect(fetch).toHaveBeenCalledOnce();
});
it("keeps pH unavailable when both services fail", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
  await expect(fetchSoilContext(location, new AbortController().signal)).rejects.toThrow(
    "Automatic soil lookup is unavailable",
  );
});
