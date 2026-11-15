import { z } from "zod";

export const coordinatesSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});
export type Coordinates = z.infer<typeof coordinatesSchema>;
export type WeatherDay = { date: string; rainfall: number | null; temperature: number | null };
export type HistoricalWeather = {
  days: WeatherDay[];
  sourceUrl: string;
  retrievedAt: string;
  latitude: number;
  longitude: number;
  start: string;
  end: string;
  soilMoisturePercent?: number | null;
  surfaceTempC?: number | null;
  recent30dRainfallMm?: number | null;
  nasaElevationM?: number | null;
};
const responseSchema = z.object({
  geometry: z
    .object({
      coordinates: z.array(z.number()).optional(),
    })
    .optional(),
  properties: z.object({
    parameter: z.object({
      PRECTOTCORR: z.record(z.number()),
      T2M: z.record(z.number()),
      GWETTOP: z.record(z.number()).optional(),
      TS: z.record(z.number()).optional(),
    }),
  }),
});

export function weatherRequestUrl(
  location: Coordinates,
  start: string,
  end: string,
  parameters = "PRECTOTCORR,T2M",
): string {
  coordinatesSchema.parse(location);
  const validDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (
    !validDate(start) ||
    !validDate(end) ||
    start > end ||
    start < "1981-01-01" ||
    end > new Date().toISOString().slice(0, 10) ||
    Date.parse(end) - Date.parse(start) > 366 * 86400000
  ) {
    throw new Error("Choose a historical date range from 1981 onward, no longer than one year.");
  }
  const query = new URLSearchParams({
    parameters,
    community: "AG",
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    start: start.replaceAll("-", ""),
    end: end.replaceAll("-", ""),
    format: "JSON",
    "time-standard": "UTC",
  });
  return `https://power.larc.nasa.gov/api/temporal/daily/point?${query}`;
}

export function parseWeather(payload: unknown, start: string, end: string): WeatherDay[] {
  const { PRECTOTCORR: rain, T2M: temperature } =
    responseSchema.parse(payload).properties.parameter;
  const days: WeatherDay[] = [];
  for (let time = Date.parse(start); time <= Date.parse(end); time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    const key = date.replaceAll("-", "");
    const r = rain[key];
    const t = temperature[key];
    days.push({
      date,
      rainfall: r !== undefined && Number.isFinite(r) && r >= 0 ? r : null,
      temperature: t !== undefined && Number.isFinite(t) && t !== -999 ? t : null,
    });
  }
  if (!days.some((day) => day.rainfall !== null || day.temperature !== null)) {
    throw new Error("NASA returned no usable observations for this period. Try an earlier period.");
  }
  return days;
}

function latestValidMetric(record: Record<string, number> | undefined, min: number, max: number) {
  if (!record) return null;
  const keys = Object.keys(record).sort();
  for (let i = keys.length - 1; i >= 0; i--) {
    const val = record[keys[i]!];
    if (val !== undefined && Number.isFinite(val) && val !== -999 && val >= min && val <= max) {
      return val;
    }
  }
  return null;
}

export async function fetchHistoricalWeather(
  location: Coordinates,
  start: string,
  end: string,
  signal?: AbortSignal,
  parameters = "PRECTOTCORR,T2M",
): Promise<HistoricalWeather> {
  const sourceUrl = weatherRequestUrl(location, start, end, parameters);
  const response = await fetch(sourceUrl, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
      : AbortSignal.timeout(45000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "NASA request limit reached. Please wait before retrying."
        : `NASA POWER request failed (${response.status}). Please retry later.`,
    );
  const json = (await response.json()) as unknown;
  const parsed = responseSchema.parse(json);
  const days = parseWeather(json, start, end);
  const rawGwet = latestValidMetric(parsed.properties.parameter.GWETTOP, 0, 1);
  const rawTs = latestValidMetric(parsed.properties.parameter.TS, -60, 70);
  const rawElev = parsed.geometry?.coordinates?.[2];
  const last30 = days.slice(-30).flatMap((d) => (d.rainfall === null ? [] : [d.rainfall]));
  return {
    days,
    sourceUrl,
    retrievedAt: new Date().toISOString(),
    ...location,
    start,
    end,
    ...(rawGwet !== null ? { soilMoisturePercent: Math.round(rawGwet * 100) } : {}),
    ...(rawTs !== null ? { surfaceTempC: Math.round(rawTs * 10) / 10 } : {}),
    ...(last30.length > 0
      ? { recent30dRainfallMm: Math.round(last30.reduce((a, b) => a + b, 0)) }
      : {}),
    ...(rawElev !== undefined && Number.isFinite(rawElev) && rawElev >= -500
      ? { nasaElevationM: Math.round(rawElev) }
      : {}),
  };
}

export function summarizeWeather(days: WeatherDay[]) {
  const rain = days.flatMap((day) => (day.rainfall === null ? [] : [day.rainfall]));
  const temp = days.flatMap((day) => (day.temperature === null ? [] : [day.temperature]));
  return {
    rainfall:
      rain.length === days.length && rain.length > 0 ? rain.reduce((a, b) => a + b, 0) : null,
    temperature:
      temp.length === days.length && temp.length > 0
        ? temp.reduce((a, b) => a + b, 0) / temp.length
        : null,
    missingDays: days.filter((day) => day.rainfall === null || day.temperature === null).length,
  };
}

export function monthlyWeather(days: WeatherDay[]) {
  const months = new Map<string, WeatherDay[]>();
  for (const day of days) {
    const key = day.date.slice(0, 7);
    const group = months.get(key) ?? [];
    group.push(day);
    months.set(key, group);
  }
  return Array.from(months, ([month, observations]) => {
    const expectedDays = new Date(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
    ).getUTCDate();
    const summary = summarizeWeather(observations);
    const omittedDays = Math.max(0, expectedDays - observations.length);
    return {
      month,
      label: new Date(`${month}-01T00:00:00Z`).toLocaleString("en", {
        month: "short",
        timeZone: "UTC",
      }),
      rainfall: omittedDays ? null : summary.rainfall,
      temperature: omittedDays ? null : summary.temperature,
      missingDays: summary.missingDays + omittedDays,
    };
  });
}

// Calendar slots preserve unknown months; these observations are not a climatology.
export function calendarWeather(days: WeatherDay[]) {
  const months = monthlyWeather(days);
  return {
    monthlyRainfall: Array.from(
      { length: 12 },
      (_, index) =>
        months.find((month) => Number(month.month.slice(5)) === index + 1)?.rainfall ?? null,
    ),
    monthlyTemperature: Array.from(
      { length: 12 },
      (_, index) =>
        months.find((month) => Number(month.month.slice(5)) === index + 1)?.temperature ?? null,
    ),
  };
}

export async function fetchRecentNasaClimate(
  location: Coordinates,
  signal?: AbortSignal,
): Promise<HistoricalWeather> {
  const endDate = new Date(Date.now() - 7 * 86400000);
  const startDate = new Date(endDate.getTime() - 89 * 86400000);
  const end = endDate.toISOString().slice(0, 10);
  const start = startDate.toISOString().slice(0, 10);
  const telemetryParams = "PRECTOTCORR,T2M,GWETTOP,TS";
  return fetchHistoricalWeather(location, start, end, signal, telemetryParams);
}

export interface ModisNdviPoint {
  date: string;
  ndvi: number;
}

export interface ModisNdviSeries {
  points: ModisNdviPoint[];
  latestNdvi: number | null;
  peakNdvi: number | null;
  sourceUrl: string;
}

export function toModisDate(date: Date): string {
  const year = date.getUTCFullYear();
  const startOfYear = Date.UTC(year, 0, 1);
  const currentDay = Date.UTC(year, date.getUTCMonth(), date.getUTCDate());
  const dayOfYear = Math.floor((currentDay - startOfYear) / 86400000) + 1;
  return `A${year}${String(dayOfYear).padStart(3, "0")}`;
}

export function modisNdviRequestUrl(location: Coordinates, startDate: Date, endDate: Date): string {
  coordinatesSchema.parse(location);
  const params = new URLSearchParams({
    latitude: location.latitude.toFixed(5),
    longitude: location.longitude.toFixed(5),
    band: "250m_16_days_NDVI",
    startDate: toModisDate(startDate),
    endDate: toModisDate(endDate),
    kmAboveBelow: "0",
    kmLeftRight: "0",
  });
  return `https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset?${params}`;
}

export function parseModisNdviSeries(payload: unknown): ModisNdviPoint[] {
  const parsed = z
    .object({
      subset: z.array(
        z.object({
          calendar_date: z.string(),
          data: z.array(z.number().finite()),
        }),
      ),
    })
    .safeParse(payload);

  if (!parsed.success) return [];

  const points: ModisNdviPoint[] = [];
  for (const row of parsed.data.subset) {
    const valid = row.data.filter((v) => v >= -2000 && v <= 10000);
    if (!valid.length) continue;
    const meanRaw = valid.reduce((sum, v) => sum + v, 0) / valid.length;
    const ndvi = Number(Math.max(-0.2, Math.min(1, meanRaw * 0.0001)).toFixed(2));
    points.push({ date: row.calendar_date, ndvi });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchRecentModisNdvi(
  location: Coordinates,
  signal?: AbortSignal,
): Promise<ModisNdviSeries | null> {
  try {
    const endDate = new Date(Date.now() - 16 * 86400000);
    const startDate = new Date(endDate.getTime() - 180 * 86400000);
    const url = modisNdviRequestUrl(location, startDate, endDate);
    const timeout = AbortSignal.timeout(9000);
    const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const response = await fetch(url, { signal: combinedSignal });
    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    const points = parseModisNdviSeries(payload);
    if (!points.length) return null;
    const latestNdvi = points[points.length - 1]!.ndvi;
    const peakNdvi = Number(Math.max(...points.map((p) => p.ndvi)).toFixed(2));
    return { points, latestNdvi, peakNdvi, sourceUrl: url };
  } catch {
    return null;
  }
}

export type ClimateMonth = {
  month: number;
  validYears: number;
  rainfallMm: number | null;
  rainfallMinMm: number | null;
  rainfallMaxMm: number | null;
  temperatureC: number | null;
};
export type RotationClimate = {
  months: ClimateMonth[];
  annualRainfallMm: number | null;
  completeYears: number;
  startYear: number;
  endYear: number;
  sourceUrl: string;
  retrievedAt: string;
};
const monthlyResponseSchema = z.object({
  header: z.object({ fill_value: z.number().finite() }),
  parameters: z.object({
    PRECTOTCORR: z.object({ units: z.enum(["mm/day", "mm/month", "mm"]) }),
    T2M: z.object({ units: z.literal("C") }),
  }),
  properties: z.object({
    parameter: z.object({
      PRECTOTCORR: z.record(z.number().finite().nullable()),
      T2M: z.record(z.number().finite().nullable()),
    }),
  }),
});
export function rotationClimateUrl(location: Coordinates, endYear: number) {
  coordinatesSchema.parse(location);
  if (!Number.isInteger(endYear) || endYear < 1990 || endYear >= new Date().getUTCFullYear()) {
    throw new Error("Choose ten complete historical years from 1981 onward.");
  }
  return `https://power.larc.nasa.gov/api/temporal/monthly/point?${new URLSearchParams({
    parameters: "PRECTOTCORR,T2M",
    community: "AG",
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    start: String(endYear - 9),
    end: String(endYear),
    format: "JSON",
  })}`;
}
export function parseRotationClimate(
  payload: unknown,
  endYear: number,
  sourceUrl: string,
): RotationClimate {
  const data = monthlyResponseSchema.parse(payload);
  const annual: number[] = [];
  const observations: Array<Array<{ rain: number; temperature: number }>> = Array.from(
    { length: 12 },
    () => [],
  );
  for (let year = endYear - 9; year <= endYear; year++) {
    const yearRain: number[] = [];
    for (let month = 1; month <= 12; month++) {
      const key = `${year}${String(month).padStart(2, "0")}`;
      const rain = data.properties.parameter.PRECTOTCORR[key];
      const temperature = data.properties.parameter.T2M[key];
      const validRain = rain != null && rain !== data.header.fill_value && rain >= 0;
      const total = validRain
        ? rain *
          (data.parameters.PRECTOTCORR.units === "mm/day"
            ? new Date(Date.UTC(year, month, 0)).getUTCDate()
            : 1)
        : null;
      if (total !== null) yearRain.push(total);
      if (total !== null && temperature != null && temperature !== data.header.fill_value) {
        observations[month - 1]!.push({ rain: total, temperature });
      }
    }
    if (yearRain.length === 12) annual.push(yearRain.reduce((sum, value) => sum + value, 0));
  }
  return {
    months: observations.map((rows, index) => ({
      month: index + 1,
      validYears: rows.length,
      rainfallMm: rows.length ? rows.reduce((sum, row) => sum + row.rain, 0) / rows.length : null,
      rainfallMinMm: rows.length ? Math.min(...rows.map((row) => row.rain)) : null,
      rainfallMaxMm: rows.length ? Math.max(...rows.map((row) => row.rain)) : null,
      temperatureC: rows.length
        ? rows.reduce((sum, row) => sum + row.temperature, 0) / rows.length
        : null,
    })),
    annualRainfallMm: annual.length
      ? annual.reduce((sum, value) => sum + value, 0) / annual.length
      : null,
    completeYears: annual.length,
    startYear: endYear - 9,
    endYear,
    sourceUrl,
    retrievedAt: new Date().toISOString(),
  };
}
export async function fetchRotationClimate(
  location: Coordinates,
  endYear: number,
  signal: AbortSignal,
) {
  const url = rotationClimateUrl(location, endYear);
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]),
  });
  if (!response.ok)
    throw new Error(`NASA history is unavailable (${response.status}). Please retry.`);
  return parseRotationClimate(await response.json(), endYear, url);
}
