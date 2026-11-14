import { CROP_RESEARCH, ROTATION_RESEARCH } from "@/lib/crop-research";

export function RotationResearch({
  rotationId,
  drainage,
}: {
  rotationId: string;
  drainage: string;
}) {
  const evidence = ROTATION_RESEARCH[rotationId];
  if (!evidence) return null;
  return (
    <div className="rotation-research">
      <span className="research-label">PUBLISHED EVIDENCE · PARTIAL SUPPORT</span>
      <p>{evidence.rationale}</p>
      {rotationId === "root-crop" && drainage !== "Good" && (
        <p className="research-caution">
          <strong>Drainage needs verification.</strong> Current profile: {drainage || "Unknown"}. Do
          not infer sweetpotato suitability from the demo rank.
        </p>
      )}
      <details>
        <summary>Research findings &amp; references</summary>
        {evidence.sources.map((id) => {
          const source = CROP_RESEARCH[id];
          return (
            <div key={id} className="research-finding">
              <strong>{source.kind}</strong>
              <p>{source.finding}</p>
              <p>
                <strong>What this supports:</strong> {source.relevance}
              </p>
              <p>
                <strong>Limits:</strong> {source.limitation}
              </p>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.citation} ↗
              </a>
            </div>
          );
        })}
      </details>
      <p className="research-scope">
        None of the cited studies establishes this exact three-crop sequence as best for this farm.
        Published findings are not used to calibrate the demo score.
      </p>
    </div>
  );
}
