# Methodology

## Separate the outputs

1. Demo crop comparison: an illustrative weighted ranking, not a probability or suitability certification.
2. Gross revenue at risk: deterministic arithmetic using explicit assumptions.
3. Advisor: an explanation layer using supplied evidence and context, not a numerical prediction engine.
4. Future yield prediction: requires independently recorded outcomes and held-out validation before release.

## Existing demo algorithm

All scoring, scenarios, loss arithmetic and pilot evaluation stay pure and typed in src/lib/fieldshift-demo.ts.

Score = 0.30 × water + 0.30 × soil + 0.25 × income + 0.15 × resilience.

Three fixed crop sequences receive illustrative scenario and field adjustments. Optional complete-year historical data supplies planting-month rainfall. Water scores saturate at 100; they do not model flooding, daily soil storage, evapotranspiration, or a complete growing season. Income ratings are fixed, not calculated margins. These shortcuts remain labeled; replacing them with invented agronomic constants would not improve accuracy.

Planning review flags identify missing crop history, pH, drainage, water availability and planting date. They require review rather than claiming a crop is unsuitable. Locally validated thresholds must precede genuine exclusions.

## Loss arithmetic

Gross revenue at risk (PHP) = area (ha) × affected fraction × baseline yield (kg/ha) × yield-loss fraction × farmgate price (PHP/kg).

Fractions must lie in [0,1]. Amounts must be finite and nonnegative. Overflow is rejected. The advisor server recomputes the result; the model receives the result and operands. Missing numerical inputs remain null. The estimate excludes production costs, salvage expenses and insurance. No confidence interval is invented from a point estimate. Hazard defaults are sample assumptions, not inferred damage.

## Advisor grounding

The server supplies a fixed instruction, recent conversation, the latest structured context, calculation, selected hazard checklist, and the existing CROP_RESEARCH reference collection. Latest context takes precedence over old dialogue. Instructions explicitly prohibit claiming photo analysis, live forecasts, field diagnoses or guaranteed results. This is a small evidence collection, not semantic retrieval or a locally reviewed treatment library. Prompt rules reduce risk but cannot guarantee model compliance; live evaluation remains required.

Weather provenance is explicit. Recovery records cover the selected historical window; planning records describe historical planning context. Neither proves the cause of field damage. Photos remain local previews and are never sent to the model. Farm data and recent messages are sent when the user asks a question, as disclosed in the chat interface.

## Path to validated predictions

Collect, with appropriate consent, farm/season identifiers, confirmed location, crop and cultivar, actual planting and harvest dates, stage, crop history, measured soil information, irrigation events, daily weather with quality flags, management/cost records, measured harvested area and yield. Recovery cases additionally need event duration, assessed affected area, independent damage assessment, and subsequent harvest outcomes. Store provenance per field, units, collection time and assessor; do not collapse mapped soil into measured soil.

Implement and review database access policies before collecting real farm records. Keep personally identifying information out of evaluation exports.

Begin with a training-set-only historical yield baseline for each supported crop/locality. Evaluate a seasonal water-balance/crop model against that baseline. AquaCrop is a candidate for water-related yield response, not a universal hazard model. A full-season implementation needs daily weather, soil storage/permeability, crop parameters and management inputs. Calibrate only on training farms/seasons; test on later seasons and farms never used for fitting. Evaluate each crop and hazard separately before expanding coverage.

A qualified local reviewer must define suitability rules, recovery decision conditions and acceptable errors before release. Version those rules and preserve the evidence used. No model should be labeled accurate merely because the UI and arithmetic tests pass.

## Sources

- [FAO AquaCrop inputs](https://www.fao.org/aquacrop/overview/input-requirements/): weather, crop, soil and management requirements.
- [FAO AquaCrop overview](https://www.fao.org/land-water/resources/tools/software/aquacrop/en): scope of water-related crop response modelling.
- Existing source-specific findings and limitations: src/lib/crop-research.ts.
- [Google Gemini API](https://ai.google.dev/gemini-api/docs/openai): direct API authentication and chat compatibility.
