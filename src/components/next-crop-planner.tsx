import { useFarmSoil } from "@/hooks/use-farm-soil";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CROP_REQUIREMENTS, DRAINAGE_SOURCES } from "@/lib/crop-requirements";
import {
  CROP_PROFILES,
  localPlanningDate,
  nextCropInputKey,
  suggestNextCrops,
  validNextPlantingDate,
  type NextCropField,
  type NextCropResult,
} from "@/lib/fieldshift-demo";
import { coordinatesSchema, fetchRotationClimate, type ClimateMonth, type Coordinates } from "@/lib/nasa-power";

export type PlannerResult = { inputKey: string; result: NextCropResult; climateMonths: ClimateMonth[] };
type Terrain = { elevation: number | null; slopePercent: number | null } | null;
export function NextCropPlanner({
  location,
  locationConfirmed = false,
  farm,
  onUpdate,
  terrain = null,
  onResult,
  onAskAdvisor,
}: {
  location: Coordinates;
  locationConfirmed?: boolean;
  farm: NextCropField;
  onUpdate: (key: keyof NextCropField, value: string) => void;
  terrain?: Terrain;
  onResult?: ((value: PlannerResult | null) => void) | undefined;
  onAskAdvisor?: (() => void) | undefined;
}) {
  const id = useId();
  const resultRef = useRef<HTMLDivElement>(null);
  const soil = useFarmSoil(location, locationConfirmed);
  const update = useRef(onUpdate);
  update.current = onUpdate;
  useEffect(() => {
    if (locationConfirmed && !farm.ph.trim() && soil.data?.ph != null)
      update.current("ph", String(soil.data.ph));
  }, [locationConfirmed, farm.ph, soil.data]);
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const today = localPlanningDate();
  const endYear = new Date().getUTCFullYear() - 1;
  const plannedFarm = { ...farm, planted: date };
  const key = nextCropInputKey(location, plannedFarm, terrain);
  const active = submitted === key && locationConfirmed && validNextPlantingDate(date, today);
  const query = useQuery({
    queryKey: ["rotation-climate", location.latitude, location.longitude, endYear],
    enabled: active,
    staleTime: 86400000,
    gcTime: 86400000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => fetchRotationClimate(location, endYear, signal),
  });
  useEffect(() => {
    const queryKey = ["rotation-climate", location.latitude, location.longitude, endYear];
    if (!active) void queryClient.cancelQueries({ queryKey, exact: true });
    return () => {
      void queryClient.cancelQueries({ queryKey, exact: true });
    };
  }, [active, location.latitude, location.longitude, endYear, queryClient]);
  const result =
    active && query.data && !query.isFetching && !query.error
      ? suggestNextCrops(plannedFarm, query.data, terrain, today)
      : null;
  const showResult = result && !editing;
  const showingResult = !!showResult;
  useEffect(() => {
    if (showingResult) resultRef.current?.focus();
  }, [showingResult]);
  const resultKey = result ? JSON.stringify(result) : "";
  const climateMonths = query.data?.months;
  useEffect(() => {
    onResult?.(
      resultKey && climateMonths
        ? { inputKey: key, result: JSON.parse(resultKey) as NextCropResult, climateMonths }
        : null,
    );
  }, [resultKey, key, onResult, climateMonths]);
  const month = query.data?.months[Number(date.slice(5, 7)) - 1];
  return (
    <section className="panel next-crop-planner">
      {!showResult && (
        <>
          <div>
            <span className="eyebrow">PLAN YOUR NEXT PLANTING</span>
            <h2>What should I plant next?</h2>
            <p>
              Confirm your crop history and planting date. We compare past weather patterns and
              field conditions across eight crops.
            </p>
          </div>
          {!locationConfirmed && (
            <p role="note">
              Set and confirm your farm location first. Sample coordinates cannot establish your
              field conditions.
            </p>
          )}
          {locationConfirmed && (
            <div className="next-crop-soil-status" aria-live="polite">
              <p>
                <strong>Soil pH: {farm.ph || "Unknown"}</strong>
                {soil.isFetching
                  ? " · Looking up SoilGrids…"
                  : soil.data?.ph != null
                    ? ` · SoilGrids mapped estimate: ${soil.data.ph} (water, 5–15 cm)`
                    : " · No mapped estimate available"}
              </p>
              {soil.data?.ph != null && (
                <p>
                  Automatically filled when unknown. Edit under soil and field conditions if you
                  have a soil test.{" "}
                  {soil.data.phRange && `Mapped interval: ${soil.data.phRange.join("–")}. `}
                  <a href={soil.data.sourceUrl} target="_blank" rel="noreferrer">
                    Soil source ↗
                  </a>
                </p>
              )}
              {soil.error && (
                <p>Soil lookup is unavailable. Keep pH unknown or enter your soil-test value.</p>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={soil.isFetching}
                onClick={() => void soil.refetch()}
              >
                Refresh soil estimate
              </Button>
            </div>
          )}
          <form
            className="next-crop-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!locationConfirmed || !coordinatesSchema.safeParse(location).success) {
                setError("Confirm a valid farm location first.");
                return;
              }
              if (!validNextPlantingDate(date, today)) {
                setError("Choose a valid planting date from today onward.");
                return;
              }
              if (
                farm.ph.trim() &&
                (!Number.isFinite(Number(farm.ph)) || Number(farm.ph) < 0 || Number(farm.ph) > 14)
              ) {
                setError("Enter pH from 0 to 14, or leave it blank.");
                return;
              }
              setError("");
              onUpdate("planted", date);
              setSubmitted(key);
              setEditing(false);
            }}
          >
            {(["crop", "previous"] as const).map((field) => (
              <div className="form-field" key={field}>
                <Label htmlFor={`${id}-${field}`}>
                  {field === "crop" ? "Current crop" : "Previous crop"}
                </Label>
                <select
                  id={`${id}-${field}`}
                  className="form-select"
                  value={farm[field]}
                  onChange={(event) => onUpdate(field, event.target.value)}
                >
                  {[
                    ...CROP_REQUIREMENTS.map((rule) => rule.crop),
                    ...(field === "previous" ? ["Fallow", "Unknown"] : []),
                  ].map((crop) => (
                    <option key={crop}>{crop}</option>
                  ))}
                </select>
              </div>
            ))}
            <div className="form-field">
              <Label htmlFor={`${id}-date`}>When will you plant next?</Label>
              <Input
                id={`${id}-date`}
                type="date"
                required
                min={today}
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setError("");
                }}
              />
            </div>
            <details className="next-crop-field-details">
              <summary>Soil and field conditions</summary>
              <p>
                Imported soil and terrain are estimates. Correct them if you have field
                measurements; unknown values stay unknown.
              </p>
              <div className="next-crop-form">
                <div className="form-field">
                  <Label htmlFor={`${id}-ph`}>Soil pH (automatic, editable)</Label>
                  <Input
                    id={`${id}-ph`}
                    type="number"
                    min="0"
                    max="14"
                    step="0.1"
                    value={farm.ph}
                    placeholder="Unknown"
                    onChange={(event) => onUpdate("ph", event.target.value)}
                  />
                </div>
                <div className="form-field">
                  <Label htmlFor={`${id}-soil`}>Soil texture (optional)</Label>
                  <select
                    id={`${id}-soil`}
                    className="form-select"
                    value={farm.soil}
                    onChange={(event) => onUpdate("soil", event.target.value)}
                  >
                    <option value="">Unknown</option>
                    {farm.soil && !["Loam", "Sand", "Clay", "Organic"].includes(farm.soil) && (
                      <option value={farm.soil}>{farm.soil}</option>
                    )}
                    {["Loam", "Sand", "Clay", "Organic"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </div>
                {(["drainage", "irrigation"] as const).map((field) => (
                  <div className="form-field" key={field}>
                    <Label htmlFor={`${id}-${field}`}>
                      {field === "drainage" ? "Drainage" : "Irrigation"}
                    </Label>
                    <select
                      id={`${id}-${field}`}
                      className="form-select"
                      value={farm[field]}
                      onChange={(event) => onUpdate(field, event.target.value)}
                    >
                      {(field === "drainage"
                        ? ["Unknown", "Good", "Moderate", "Poor"]
                        : [
                            "Unknown",
                            "Rain-fed",
                            "Gravity-fed",
                            "Pump-irrigated",
                            "Drip irrigation",
                          ]
                      ).map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <p>
                Terrain:{" "}
                {terrain?.elevation != null
                  ? `${Math.round(terrain.elevation)} m elevation`
                  : "elevation unknown"}
                ;{" "}
                {terrain?.slopePercent != null
                  ? `${terrain.slopePercent.toFixed(1)}% slope`
                  : "slope unknown"}
                .
              </p>
            </details>
            {error && <p role="alert">{error}</p>}
            <Button type="submit" disabled={!locationConfirmed || (active && query.isFetching)}>
              {active && query.isFetching
                ? "Checking historical patterns…"
                : submitted
                  ? "Update suggestion"
                  : "Suggest my next crop"}
            </Button>
          </form>
        </>
      )}
      <div aria-live="polite">
        {active && query.isFetching && (
          <p>
            Loading NASA POWER history for {endYear - 9}–{endYear}…
          </p>
        )}
        {active && query.error && (
          <div role="alert">
            <p>{query.error.message}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Retry weather history
            </Button>
          </div>
        )}
        {showResult && (
          <div ref={resultRef} tabIndex={-1} className="next-crop-results">
            <Button type="button" variant="outline" onClick={() => setEditing(true)}>
              Edit planting details
            </Button>
            <p className="next-crop-disclaimer">
              Historical-pattern screening · Not a forecast or verified agronomic recommendation.
              Confirm variety, water supply and field suitability locally.
            </p>
            <p>
              Planned planting: <strong>{date}</strong>.{" "}
              {month && month.validYears >= 8 && (
                <>
                  This calendar month averaged {month.rainfallMm?.toFixed(0)} mm rain and{" "}
                  {month.temperatureC?.toFixed(1)} °C across {month.validYears} years.
                </>
              )}
            </p>
            {result.suggestions.length ? (
              result.suggestions.map((suggestion, index) => {
                const profile = CROP_PROFILES[suggestion.crop]!;
                return (
                  <article
                    className={`next-crop-option ${index === 0 ? "next-crop-primary" : ""}`}
                    key={suggestion.crop}
                  >
                    <span className="eyebrow">
                      {index === 0 ? "NEXT CROP TO CONSIDER" : "ALTERNATIVE"}
                    </span>
                    <div className="next-crop-option-heading">
                      <img src={profile.image} alt={suggestion.crop} width="72" height="72" />
                      <h3>
                        {suggestion.crop} / {profile.localName}
                      </h3>
                    </div>
                    <ul>
                      {suggestion.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    {suggestion.conditions.length > 0 && (
                      <details open={index === 0}>
                        <summary>Check before planting</summary>
                        <ul>
                          {suggestion.conditions.map((condition) => (
                            <li key={condition}>{condition}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <a href={suggestion.sourceUrl} target="_blank" rel="noreferrer">
                      FAO crop requirements ↗
                    </a>
                  </article>
                );
              })
            ) : (
              <>
                <h3>We need more information before suggesting a crop</h3>
                <ul>
                  {result.gaps.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
              </>
            )}
            <details>
              <summary>Data sources and how suggestions work</summary>
              <p>
                We exclude known conflicts with published limits, then compare unresolved
                conditions, matches to optimal ranges, and crop-family changes. Ties keep catalog
                order. This ordering is illustrative screening, not a validated suitability model.
              </p>
              <p>
                Annual rainfall is compared with annual requirements. Monthly mean temperatures are
                checked over the published maximum growing period, including months across year
                boundaries. Variety-specific establishment water needs, daily extremes, soil depth,
                fertility and pest history are not established by this comparison. Annual limits can
                exclude a crop that could grow locally in a managed seasonal window.
              </p>
              <p>
                Only years with complete rainfall contribute to the annual average. Each
                growing-period month needs at least eight years of usable rainfall and temperature.
                No weather is fabricated for missing records.
              </p>
              <a href={query.data!.sourceUrl} target="_blank" rel="noreferrer">
                NASA POWER monthly records, {result.startYear}–{result.endYear} ↗
              </a>
              <p>
                Retrieved {new Date(query.data!.retrievedAt).toLocaleString()}. Monthly rainfall
                variation is the observed range across available years, not a forecast interval.
              </p>
              <div className="next-crop-weather-table">
                <table>
                  <caption>Historical calendar-month patterns</caption>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Mean rain</th>
                      <th>Rain range</th>
                      <th>Mean °C</th>
                      <th>Years</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data!.months.map((row) => (
                      <tr key={row.month}>
                        <th>
                          {new Date(Date.UTC(2000, row.month - 1, 1)).toLocaleString("en", {
                            month: "short",
                            timeZone: "UTC",
                          })}
                        </th>
                        <td>{row.rainfallMm?.toFixed(0) ?? "Unknown"} mm</td>
                        <td>
                          {row.rainfallMinMm?.toFixed(0) ?? "?"}–
                          {row.rainfallMaxMm?.toFixed(0) ?? "?"} mm
                        </td>
                        <td>{row.temperatureC?.toFixed(1) ?? "Unknown"}</td>
                        <td>{row.validYears}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.excluded.length > 0 && (
                <>
                  <h4>Crops withheld</h4>
                  <ul>
                    {result.excluded.map((crop) => (
                      <li key={crop.crop}>
                        <strong>{crop.crop}:</strong> {crop.reasons.join(" ")}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p>
                Drainage references:{" "}
                {DRAINAGE_SOURCES.map((url, index) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    {index ? " · " : ""}Source {index + 1}
                  </a>
                ))}
              </p>
              <p>
                SoilGrids and mapped terrain are estimates. Crop rules were sourced from FAO
                ECOCROP; the comparison has not been locally validated.
              </p>
            </details>
            {onAskAdvisor && (
              <Button variant="outline" onClick={onAskAdvisor}>
                Ask AI advisor about this result
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
