import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Droplets, Thermometer } from "lucide-react";
import { monthlyWeather, type WeatherDay } from "@/lib/nasa-power";

export function MonthlyWeatherCharts({ days }: { days: WeatherDay[] }) {
  const data = monthlyWeather(days);
  return (
    <>
      <div className="chart-grid">
        <section className="panel chart-panel" aria-label="NASA monthly rainfall">
          <div className="panel-top">
            <div>
              <span className="chart-kicker">
                <Droplets size={14} /> MONTHLY RAINFALL
              </span>
              <h2>Monthly Rainfall</h2>
            </div>
            <span className="chart-unit">mm / month</span>
          </div>
          <div className="chart-body">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 5" />
                <XAxis dataKey="label" />
                <YAxis width={55} />
                <Tooltip formatter={(value) => [`${value} mm`, "Monthly total"]} />
                <Area
                  type="linear"
                  dataKey="rainfall"
                  stroke="#23764d"
                  fill="#23764d"
                  fillOpacity={0.12}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel chart-panel" aria-label="NASA monthly temperature">
          <div className="panel-top">
            <div>
              <span className="chart-kicker temp-kicker">
                <Thermometer size={14} /> MONTHLY TEMPERATURE
              </span>
              <h2>Monthly Temperature</h2>
            </div>
            <span className="chart-unit">°C / average</span>
          </div>
          <div className="chart-body">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 5" />
                <XAxis dataKey="label" />
                <YAxis domain={["auto", "auto"]} width={55} />
                <Tooltip formatter={(value) => [`${value} °C`, "Monthly mean"]} />
                <Line
                  type="linear"
                  dataKey="temperature"
                  stroke="#ef705f"
                  strokeWidth={2.5}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
      <details className="weather-details">
        <summary>Monthly chart values</summary>
        <div className="weather-table-scroll">
          <table>
            <caption>Monthly rainfall and temperature records</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Rainfall (mm)</th>
                <th scope="col">Temperature (°C)</th>
              </tr>
            </thead>
            <tbody>
              {data.map((month) => (
                <tr key={month.month}>
                  <th scope="row">{month.month}</th>
                  <td>{month.rainfall?.toFixed(1) ?? "Incomplete"}</td>
                  <td>{month.temperature?.toFixed(1) ?? "Incomplete"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
