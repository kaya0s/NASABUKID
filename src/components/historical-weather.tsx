import { MonthlyWeatherCharts } from "@/components/monthly-weather-charts";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchHistoricalWeather,
  summarizeWeather,
  weatherRequestUrl,
  type Coordinates,
  type HistoricalWeather,
} from "@/lib/nasa-power";

export function HistoricalWeatherPanel({
  location,
  eventDate,
  onUse,
  monthlyCharts = false,
}: {
  location: Coordinates;
  eventDate?: string;
  monthlyCharts?: boolean;
  onUse?: (weather: HistoricalWeather | null) => void;
}) {
  const year = new Date().getUTCFullYear() - 1;
  const [start, setStart] = useState(
    eventDate && Number.isFinite(Date.parse(eventDate))
      ? new Date(Date.parse(eventDate) - 6 * 86400000).toISOString().slice(0, 10)
      : `${year}-01-01`,
  );
  const [end, setEnd] = useState(eventDate ?? `${year}-12-31`);
  const [requested, setRequested] = useState("");
  const key = JSON.stringify([location.latitude, location.longitude, start, end]);
  let validation = "";
  try {
    weatherRequestUrl(location, start, end);
  } catch (error) {
    validation = error instanceof Error ? error.message : "Invalid date range.";
  }
  const query = useQuery({
    queryKey: ["nasa-power", key],
    queryFn: ({ signal }) => fetchHistoricalWeather(location, start, end, signal),
    enabled: (monthlyCharts || requested === key) && !validation,
    staleTime: 86400000,
    gcTime: 86400000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = validation ? undefined : query.data;
  const summary = data ? summarizeWeather(data.days) : null;
  return (
    <section className="panel historical-panel">
      <div className="panel-top">
        <div>
          <span className="panel-eyebrow">NASA POWER · HISTORICAL OBSERVATIONS</span>
          <h2>
            {eventDate ? "Weather around the reported event" : "Explore actual historical weather"}
          </h2>
        </div>
        <span className="sample-chip">{data ? "NASA RECORDS" : "NOT YET LOADED"}</span>
      </div>
      <p className="historical-copy">
        {location.latitude.toFixed(5)}°, {location.longitude.toFixed(5)}° · Regional grid data, not
        a farm measurement or forecast. These records are not real-time weather.
      </p>
      {monthlyCharts ? (
        <div className="weather-form">
          <div>
            <Label htmlFor="historical-chart-year">Historical year</Label>
            <select
              id="historical-chart-year"
              className="form-select"
              value={start.slice(0, 4)}
              onChange={(event) => {
                onUse?.(null);
                setStart(`${event.target.value}-01-01`);
                setEnd(`${event.target.value}-12-31`);
              }}
            >
              {Array.from({ length: year - 1980 }, (_, index) => year - index).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isFetching ? "Loading NASA records…" : "Refresh NASA records"}
          </Button>
        </div>
      ) : (
        <form
          className="weather-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (requested === key) void query.refetch();
            else setRequested(key);
          }}
        >
          <div>
            <Label htmlFor="weather-start">Start date</Label>
            <Input
              id="weather-start"
              type="date"
              required
              min="1981-01-01"
              max={end}
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="weather-end">End date</Label>
            <Input
              id="weather-end"
              type="date"
              required
              min={start}
              max={new Date().toISOString().slice(0, 10)}
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={!!validation || query.isFetching}>
            {query.isFetching ? "Loading NASA records…" : "Load historical weather"}
          </Button>
        </form>
      )}
      {eventDate && (
        <p className="historical-copy">
          Reported event: {eventDate}.{" "}
          <button
            className="text-action"
            onClick={() => {
              if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !Number.isFinite(Date.parse(eventDate)))
                return;
              setStart(new Date(Date.parse(eventDate) - 6 * 86400000).toISOString().slice(0, 10));
              setEnd(eventDate);
            }}
          >
            Use seven-day event window
          </button>{" "}
          Weather alone cannot confirm flooding or explain crop damage.
        </p>
      )}
      <div aria-live="polite">
        {validation && <p className="integration-error">{validation}</p>}
        {query.isFetching && (
          <p className="historical-copy" role="status">
            Contacting NASA POWER. This may take up to 45 seconds.
          </p>
        )}
        {query.error && (
          <p role="alert" className="integration-error">
            {query.error instanceof Error ? query.error.message : "Weather unavailable."} Check your
            connection and retry. No sample values have been substituted.
          </p>
        )}
      </div>
      {monthlyCharts && !data && (
        <div className="chart-grid" aria-live="polite">
          <section className="panel chart-panel">
            <h2>Recorded monthly rainfall.</h2>
            <p className="historical-copy">
              {query.isFetching
                ? "Loading actual NASA records…"
                : "No observations loaded. Refresh to retry."}
            </p>
          </section>
          <section className="panel chart-panel">
            <h2>Recorded monthly temperature.</h2>
            <p className="historical-copy">
              {query.isFetching
                ? "Loading actual NASA records…"
                : "No observations loaded. Refresh to retry."}
            </p>
          </section>
        </div>
      )}
      {data && summary && (
        <>
          <div className="historical-stats">
            <div>
              <span>Period rainfall</span>
              <strong>
                {summary.rainfall === null ? "Incomplete" : `${summary.rainfall.toFixed(1)} mm`}
              </strong>
            </div>
            <div>
              <span>Mean air temperature</span>
              <strong>
                {summary.temperature === null
                  ? "Incomplete"
                  : `${summary.temperature.toFixed(1)} °C`}
              </strong>
            </div>
            <div>
              <span>Missing or incomplete days</span>
              <strong>
                {summary.missingDays} / {data.days.length}
              </strong>
            </div>
          </div>
          {monthlyCharts ? (
            <MonthlyWeatherCharts days={data.days} />
          ) : (
            <div
              className="historical-chart"
              role="img"
              aria-label="NASA historical daily rainfall chart. Daily values are available in the table below."
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.days} margin={{ left: 0, right: 15, top: 12, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 5" />
                  <XAxis dataKey="date" minTickGap={50} tick={{ fontSize: 11 }} />
                  <YAxis unit=" mm" tick={{ fontSize: 11 }} width={65} />
                  <Tooltip formatter={(value) => [`${value} mm`, "Daily rainfall"]} />
                  <Area
                    dataKey="rainfall"
                    stroke="#23764d"
                    fill="#23764d"
                    fillOpacity={0.12}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          <details className="weather-details">
            <summary>Daily observations and download</summary>
            <Button
              variant="outline"
              onClick={() => {
                const csv =
                  "Date,Rainfall (mm/day),Temperature (C)\n" +
                  data.days
                    .map((day) => `${day.date},${day.rainfall ?? ""},${day.temperature ?? ""}`)
                    .join("\n");
                const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = `nasa-power-${data.latitude}-${data.longitude}-${data.start}-${data.end}.csv`;
                anchor.click();
                window.setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              Download CSV
            </Button>
            <div className="weather-table-scroll">
              <table>
                <caption>
                  NASA POWER daily data · UTC · blank CSV values are missing observations
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Rainfall (mm)</th>
                    <th scope="col">Temperature (°C)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((day) => (
                    <tr key={day.date}>
                      <th scope="row">{day.date}</th>
                      <td>{day.rainfall?.toFixed(2) ?? "Missing"}</td>
                      <td>{day.temperature?.toFixed(2) ?? "Missing"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          {onUse && (
            <Button
              variant="outline"
              disabled={
                summary.missingDays > 0 ||
                data.days.length < 365 ||
                data.start.slice(5) !== "01-01" ||
                data.end.slice(5) !== "12-31"
              }
              onClick={() => onUse(data)}
            >
              Use full year as demo water context
            </Button>
          )}
          {onUse && (
            <p className="historical-copy">
              Apply a complete calendar year to the illustrative ranking. Crop ratings and water
              thresholds remain unvalidated demo assumptions; these records do not classify ENSO.
            </p>
          )}
          <p className="historical-provenance">
            <a href={data.sourceUrl} target="_blank" rel="noreferrer">
              Open exact NASA JSON request ↗
            </a>{" "}
            · Retrieved {new Date(data.retrievedAt).toLocaleString()} · PRECTOTCORR (mm/day), T2M
            (°C), UTC.
          </p>
        </>
      )}
      <p className="historical-copy">
        POWER meteorology has a coarse grid (approximately 0.5° × 0.625°). Nearby farms can share
        records.{" "}
        <a href="https://power.larc.nasa.gov/docs/" target="_blank" rel="noreferrer">
          Source and methodology ↗
        </a>
      </p>
    </section>
  );
}
