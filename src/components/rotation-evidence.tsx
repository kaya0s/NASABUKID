import { SCORE_WEIGHTS, type Rotation } from "@/lib/fieldshift-demo";
import { calendarWeather, type HistoricalWeather } from "@/lib/nasa-power";

export function RotationEvidence({
  rotation,
  farm,
  historical,
}: {
  rotation: Rotation & { total: number };
  farm: { ph: string; soil: string; drainage: string; irrigation: string; planted: string };
  historical: HistoricalWeather | null;
}) {
  const rainfall = historical
    ? calendarWeather(historical.days).monthlyRainfall[Number(farm.planted.slice(5, 7)) - 1]
    : null;
  return (
    <details className="rotation-evidence">
      <summary>Evidence &amp; assumptions</summary>
      <dl>
        <dt>Weather used in this score</dt>
        <dd>
          {historical ? (
            <>
              <a href={historical.sourceUrl} target="_blank" rel="noreferrer">
                NASA POWER historical records ↗
              </a>{" "}
              · {historical.start} to {historical.end}. {rainfall != null
                ? `Complete planting-month rainfall (${rainfall.toFixed(1)} mm) is used in the demo water calculation.`
                : "Complete planting-month rainfall is unavailable; the water score uses demo scenario assumptions."} Retrieved{" "}
              {new Date(historical.retrievedAt).toLocaleString()}.
            </>
          ) : (
            "Sample scenario ratings. No historical NASA year has been applied to this score, even if records are displayed above."
          )}
        </dd>
        <dt>Farm inputs considered</dt>
        <dd>
          Soil pH: {farm.ph || "unknown"} · Drainage: {farm.drainage || "unknown"} · Irrigation:{" "}
          {farm.irrigation || "unknown"}. Planned planting: {farm.planted || "not entered"} (month
          used when historical rainfall is applied).
        </dd>
        <dt>Soil information</dt>
        <dd>
          {farm.soil || "Texture/type not entered"}. Profile values may be entered manually or
          imported estimates. Texture/type is recorded but does not currently change the score.
          Public soil sources and prediction uncertainty are available in My farm.
        </dd>
        <dt>How this total was calculated</dt>
        <dd>
          <ul>
            {(Object.keys(SCORE_WEIGHTS) as Array<keyof typeof SCORE_WEIGHTS>).map((factor) => (
              <li key={factor}>
                {factor[0]!.toUpperCase() + factor.slice(1)}: {rotation.scores[factor]} ×{" "}
                {SCORE_WEIGHTS[factor] * 100}%
              </li>
            ))}
          </ul>
          Weighted total, rounded to one decimal: <strong>{rotation.total} / 100</strong>. This is a
          comparative demo score, not a probability of success.
        </dd>
        <dt>What still needs verification</dt>
        <dd>
          Crop suitability, planting windows, crop durations, local yields and prices have not been
          validated. Base crop ratings, income/resilience scores, thresholds and scenario
          adjustments are demo assumptions. Unknown inputs do not establish suitability. Review with
          an agricultural technician before using this plan.
        </dd>
      </dl>
    </details>
  );
}
