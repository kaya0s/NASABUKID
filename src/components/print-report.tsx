import type { PlannerResult } from "@/components/next-crop-planner";
import { CROP_PROFILES } from "@/lib/fieldshift-demo";
import { summarizeWeather, type HistoricalWeather } from "@/lib/nasa-power";

export type PrintHazard = "Flooding" | "Drought" | "Typhoon" | "Heat";

export type PrintFarm = {
  place: string;
  area: string;
  crop: string;
  previous: string;
  ph: string;
  soil: string;
  irrigation: string;
  drainage: string;
  planted: string;
};

export type PrintRecovery = {
  hazard: PrintHazard;
  damageDate: string;
  actualPlantingDate: string;
  growthStage: string;
  durationHours: string;
  observations: string;
  affected: number;
  yieldLoss: number;
  expectedYield: string;
  price: string;
  area: string;
  loss: number | null;
  replantNote: string;
  steps: readonly string[];
};

const PHP = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

function monthLabel(month: number) {
  return new Date(Date.UTC(2000, month - 1, 1)).toLocaleString("en", {
    month: "short",
    timeZone: "UTC",
  });
}

function value(input: string | number | null | undefined, fallback = "Unknown") {
  if (input === null || input === undefined) return fallback;
  const text = String(input).trim();
  return text ? text : fallback;
}

/**
 * Printable-only document. Hidden on screen, shown by the `@media print` rules in styles.css.
 * Rendered only while an export is requested so the on-screen app never shows it.
 *
 * One export always carries both halves of the advisory — the crop rotation screening
 * result and the disaster recovery / loss check — so the farmer never prints a report
 * that is missing the half they were looking at.
 */
export function PrintReport({
  farm,
  location,
  terrain,
  historical,
  ndvi,
  plan,
  recovery,
}: {
  farm: PrintFarm;
  location: { latitude: number; longitude: number };
  terrain: { elevation: number; slopePercent: number } | null;
  historical: HistoricalWeather | null;
  ndvi: number | null;
  plan: PlannerResult | null;
  recovery: PrintRecovery | null;
}) {
  const summary = historical ? summarizeWeather(historical.days) : null;
  const moisture = historical?.soilMoisturePercent ?? null;
  const surfaceTemp = historical?.surfaceTempC ?? summary?.temperature ?? null;
  const rain30 = historical?.recent30dRainfallMm ?? summary?.rainfall ?? null;
  const result = plan?.result ?? null;
  const generatedAt = new Date().toLocaleString("en-PH");
  const eventRecorded = Boolean(recovery?.damageDate?.trim());

  return (
    <div className="print-report-container">
      <header className="print-report-header">
        <div className="print-brand-row">
          <div className="print-brand-title">
            <h1>NASABUKID</h1>
            <span className="print-brand-tagline">
              Crop Rotation &amp; Disaster Recovery Report
            </span>
          </div>
          <div className="print-report-meta">
            <span>Generated {generatedAt}</span>
            <span>{value(farm.place, "Location not identified")}</span>
            <span>
              {location.latitude.toFixed(5)}°, {location.longitude.toFixed(5)}°
            </span>
            {farm.area ? <span>{farm.area} ha</span> : null}
          </div>
        </div>
        <p className="print-report-notice">
          Demo decision support. Historical-pattern screening and sample assumptions — not a
          forecast, verified agronomic recommendation, or crop-damage diagnosis. Confirm variety,
          water supply and field suitability locally.
        </p>
      </header>

      <section className="print-report-section">
        <h2 className="print-section-title">Farm &amp; field profile</h2>
        <table className="print-table">
          <tbody>
            <tr>
              <th scope="row">Location</th>
              <td>{value(farm.place, "Not identified")}</td>
            </tr>
            <tr>
              <th scope="row">Farm area</th>
              <td>{value(farm.area, "Not set")} ha</td>
            </tr>
            <tr>
              <th scope="row">Current crop</th>
              <td>{value(farm.crop, "Not set")}</td>
            </tr>
            <tr>
              <th scope="row">Previous crop</th>
              <td>{value(farm.previous, "Not set")}</td>
            </tr>
            <tr>
              <th scope="row">Planned next planting</th>
              <td>{value(farm.planted, "Not set")}</td>
            </tr>
            <tr>
              <th scope="row">Soil texture / type</th>
              <td>{value(farm.soil)}</td>
            </tr>
            <tr>
              <th scope="row">Soil pH (water)</th>
              <td>{value(farm.ph)}</td>
            </tr>
            <tr>
              <th scope="row">Drainage</th>
              <td>{value(farm.drainage)}</td>
            </tr>
            <tr>
              <th scope="row">Irrigation</th>
              <td>{value(farm.irrigation)}</td>
            </tr>
            <tr>
              <th scope="row">Elevation / slope</th>
              <td>
                {terrain
                  ? `${Math.round(terrain.elevation)} m · ${terrain.slopePercent.toFixed(1)}% slope`
                  : "Terrain not loaded"}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="print-report-section">
        <h2 className="print-section-title">NASA regional context</h2>
        <p className="print-section-desc">
          NASA POWER is regional gridded data (~0.5° × 0.625°), not an on-farm measurement.
        </p>
        <div className="print-telemetry-grid">
          <div className="print-telemetry-box">
            <span className="print-telemetry-lbl">MOISTURE</span>
            <span className="print-telemetry-val">
              {moisture === null ? "—" : `${moisture}%`}
            </span>
            <span className="print-telemetry-sub">Topsoil</span>
          </div>
          <div className="print-telemetry-box">
            <span className="print-telemetry-lbl">HEAT</span>
            <span className="print-telemetry-val">
              {surfaceTemp === null ? "—" : `${surfaceTemp.toFixed(1)}°C`}
            </span>
            <span className="print-telemetry-sub">Surface temp</span>
          </div>
          <div className="print-telemetry-box">
            <span className="print-telemetry-lbl">RAIN</span>
            <span className="print-telemetry-val">
              {rain30 === null ? "—" : `${Math.round(rain30)}mm`}
            </span>
            <span className="print-telemetry-sub">Last 30 days</span>
          </div>
          <div className="print-telemetry-box">
            <span className="print-telemetry-lbl">HEALTH</span>
            <span className="print-telemetry-val">
              {ndvi === null ? "—" : ndvi.toFixed(2)}
            </span>
            <span className="print-telemetry-sub">NDVI greenness</span>
          </div>
        </div>
      </section>

      {/* ── Part 1: crop rotation & land advisory ─────────────────────────── */}
      <h2 className="print-part-title">Part 1 · Crop rotation &amp; land advisory</h2>

      <section className="print-report-section">
        <h2 className="print-section-title">1.1 · Next-crop screening result</h2>
        {!result ? (
          <p className="print-text-muted">
            No rotation result was produced. Open Crop Rotation, confirm the current crop, previous
            crop and planned planting date, then run “Suggest my next crop” before exporting.
          </p>
        ) : (
          <>
            <p className="print-section-desc">
              Planned planting: {result.planted}. Historical window: {result.startYear}–
              {result.endYear}. Illustrative screening against published reference ranges, not a
              validated suitability model.
            </p>

            {result.suggestions.length ? (
              <table className="print-table print-table-full">
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Crop</th>
                    <th scope="col">Why it ranked here</th>
                    <th scope="col">Check before planting</th>
                  </tr>
                </thead>
                <tbody>
                  {result.suggestions.map((suggestion, index) => {
                    const profile = CROP_PROFILES[suggestion.crop];
                    return (
                      <tr key={suggestion.crop}>
                        <td>
                          <span className="print-score-badge">
                            {index === 0 ? "Next" : `#${index + 1}`}
                          </span>
                        </td>
                        <td>
                          <strong>{suggestion.crop}</strong>
                          {profile?.localName ? (
                            <>
                              <br />
                              <span className="print-text-muted">{profile.localName}</span>
                            </>
                          ) : null}
                        </td>
                        <td>
                          <p className="print-cell-para">{suggestion.reasons.join(" ")}</p>
                        </td>
                        <td>
                          <p className="print-cell-para">
                            {suggestion.conditions.length
                              ? suggestion.conditions.join(" ")
                              : "No additional checks listed."}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <>
                <p className="print-section-desc">
                  We need more information before suggesting a crop.
                </p>
                <ul className="print-steps-list">
                  {result.gaps.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>

      {result && result.excluded.length > 0 ? (
        <section className="print-report-section">
          <h2 className="print-section-title">1.2 · Crops withheld</h2>
          <table className="print-table print-table-full">
            <tbody>
              {result.excluded.map((crop) => (
                <tr key={crop.crop} className="print-highlight-row">
                  <th scope="row">{crop.crop}</th>
                  <td>{crop.reasons.join(" ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {plan && plan.climateMonths.length > 0 ? (
        <section className="print-report-section">
          <h2 className="print-section-title">1.3 · Historical calendar-month patterns</h2>
          <p className="print-section-desc">
            Observed variation across available years, not a forecast interval. Only years with
            complete records contribute.
          </p>
          <table className="print-table print-table-full">
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Mean rain</th>
                <th scope="col">Rain range</th>
                <th scope="col">Mean °C</th>
                <th scope="col">Years</th>
              </tr>
            </thead>
            <tbody>
              {plan.climateMonths.map((row) => (
                <tr key={row.month}>
                  <th scope="row">{monthLabel(row.month)}</th>
                  <td>{row.rainfallMm === null ? "Unknown" : `${row.rainfallMm.toFixed(0)} mm`}</td>
                  <td>
                    {row.rainfallMinMm === null ? "?" : row.rainfallMinMm.toFixed(0)}–
                    {row.rainfallMaxMm === null ? "?" : row.rainfallMaxMm.toFixed(0)} mm
                  </td>
                  <td>{row.temperatureC === null ? "Unknown" : row.temperatureC.toFixed(1)}</td>
                  <td>{row.validYears}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* ── Part 2: disaster recovery & loss check ────────────────────────── */}
      <h2 className="print-part-title">Part 2 · Disaster recovery &amp; loss check</h2>

      {recovery && eventRecorded ? (
        <>
          <section className="print-report-section">
            <h2 className="print-section-title">2.1 · Reported event</h2>
            <table className="print-table">
              <tbody>
                <tr>
                  <th scope="row">Hazard</th>
                  <td>{recovery.hazard}</td>
                </tr>
                <tr>
                  <th scope="row">Event date</th>
                  <td>{recovery.damageDate}</td>
                </tr>
                <tr>
                  <th scope="row">Actual planting date of damaged crop</th>
                  <td>{value(recovery.actualPlantingDate, "Unknown")}</td>
                </tr>
                <tr>
                  <th scope="row">Observed growth stage</th>
                  <td>{value(recovery.growthStage, "Unknown")}</td>
                </tr>
                <tr>
                  <th scope="row">Event duration</th>
                  <td>
                    {value(recovery.durationHours, "Unknown")}
                    {recovery.durationHours.trim() ? " hours" : ""}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Farmer observations</th>
                  <td>{value(recovery.observations, "None recorded")}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="print-report-section">
            <h2 className="print-section-title">2.2 · Estimated gross revenue at risk</h2>
            <p className="print-section-desc">
              Editable planning assumptions, not a verified claim. Excludes production costs,
              salvage expenses and insurance.
            </p>
            <div className="print-loss-card">
              <div className="print-loss-head">
                <span>Gross revenue at risk</span>
                <strong>{recovery.loss === null ? "Check inputs" : PHP.format(recovery.loss)}</strong>
              </div>
              <table className="print-table print-table-full">
                <thead>
                  <tr>
                    <th scope="col">Input</th>
                    <th scope="col">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Farm area</td>
                    <td>{value(recovery.area, "Not set")} ha</td>
                  </tr>
                  <tr>
                    <td>Area affected</td>
                    <td>{recovery.affected}%</td>
                  </tr>
                  <tr>
                    <td>Expected yield</td>
                    <td>{value(recovery.expectedYield, "Not set")} kg/ha</td>
                  </tr>
                  <tr>
                    <td>Expected yield loss on affected area</td>
                    <td>{recovery.yieldLoss}%</td>
                  </tr>
                  <tr>
                    <td>Farmgate price</td>
                    <td>₱{value(recovery.price, "Not set")}/kg</td>
                  </tr>
                </tbody>
              </table>
              <p className="print-cell-para">
                Farm area × affected share × entered yield × yield-loss fraction × entered price.
              </p>
            </div>
          </section>

          <section className="print-report-section">
            <h2 className="print-section-title">2.3 · Possible next steps · {recovery.hazard}</h2>
            <div className="print-steps-card">
              <p className="print-replant-highlight">{recovery.replantNote}</p>
              <ol className="print-steps-list">
                {recovery.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
            <p className="print-text-muted">
              Weather records cannot establish the cause of crop injury. This report cannot replace
              an on-site assessment by an agricultural technician.
            </p>
          </section>
        </>
      ) : (
        <section className="print-report-section">
          <h2 className="print-section-title">2.1 · Reported event</h2>
          <p className="print-text-muted">
            No disaster event recorded. Open Disaster Recovery, choose the hazard and enter the
            event date, then export again to include the loss check in this report.
          </p>
        </section>
      )}

      <section className="print-report-section">
        <h2 className="print-section-title">Sources &amp; method</h2>
        <p className="print-section-desc">
          Weather: NASA POWER monthly records {result ? `${result.startYear}–${result.endYear}` : ""}
          {historical?.sourceUrl ? ` · ${historical.sourceUrl}` : ""}
        </p>
        <p className="print-section-desc">
          Crop reference ranges: FAO ECOCROP. Soil: ISRIC SoilGrids (mapped estimate, 5–15 cm).
          Terrain: Open-Meteo / Copernicus DEM. Soil and terrain values are estimates, not
          measurements.
        </p>
        <p className="print-text-muted">
          Known conflicts with published limits are excluded first; remaining options are ordered by
          unresolved conditions, matches to optimal ranges, and crop-family changes. Ties keep
          catalog order. Harvest outcomes, local yields and prices are not validated.
        </p>
      </section>

      <footer className="print-report-footer">
        <span>NASABUKID · NASA Space Apps Challenge · Bukidnon, Philippines</span>
        <span>Demo data · Verify with a local agricultural technician</span>
      </footer>
    </div>
  );
}
