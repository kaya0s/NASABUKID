# FieldShift: demonstration and defense

FieldShift is a crop-planning and damage-documentation prototype for Bukidnon growers. It makes regional historical weather accessible alongside farmer-entered context. It does not predict harvests or diagnose damaged crops.

## Demonstration flow

1. **My farm:** select a location or draw a boundary. Check the area and imported soil estimates; correct them when local information is available.
2. **Damage recovery:** choose the damaged crop, event, and date. Enter area, affected share, expected yield, yield reduction, and price. The displayed amount is gross revenue at risk, excluding costs and insurance. Changing a hazard preserves these assumptions.
3. **Historical context:** open the NASA weather section and request the event window. Show its dates, missing values, exact request, and CSV. Regional rainfall is context, not proof of flooding or crop injury.
4. **Next season:** enter a planting date and drainage condition, then compare three illustrative crop options. Select an option before discussing it with the advisor. Open sources to distinguish research from demo scoring.

## Defensible claims

| Claim | Demonstrable evidence | Limit |
| --- | --- | --- |
| NASA data is accessible | NASA POWER requests, dated observations, tables, CSV, source links | Regional historical data, not field sensors or forecasts |
| Revenue calculation is transparent | Editable operands and displayed multiplication | User assumptions, not assessed loss or insurance valuation |
| Options respond to inputs | Pure typed demo rules and automated checks | Weights and thresholds are not calibrated agronomy |
| Research is traceable | References matched to supported next crops | Studies do not validate these full sequences locally |
| Workflow is simpler | Setup, three recovery sections, expandable details | Farmer usability testing is still needed |

## Judging alignment and remaining evidence

The official [2025 judging guide](https://spaceapps-v2-staging.s3.amazonaws.com/media/documents/Final_Space_Apps_2025_Judging_Guidelines_for_web.pdf) discusses impact, creativity, validity, relevance, and presentation. This is a reference framework, not certification of eligibility for another year.

- **Impact:** show the problem and intended users; do not claim measured yield gains or avoided losses without a pilot.
- **Creativity:** demonstrate the integrated workflow; do not claim it is the first such tool without comparison research.
- **Validity:** show data provenance, tests, missing-data behavior, and scientific limits. Obtain agronomist review and field evaluation before operational recommendations.
- **Relevance:** name the actual challenge and map its requirements to demonstrated features. The selected challenge/year was not supplied, so relevance and eligibility remain unverified.
- **Presentation:** demonstrate one farm and one event, then reveal the source and calculation. Recheck the submission year's format rules and public-link requirements.

## AI and asset disclosure

This implementation includes AI-assisted coding. The optional advisor uses Google Gemini to explain supplied inputs. It does not analyze uploaded photos. No AI-generated data is substituted for unavailable weather. Review the provenance and required labeling of all existing image assets before submission; their authorship was not established in this change.

## Validation boundary

Automated tests cover calculation, invalid inputs, workflow handoffs, hazard changes, data parsing, and source selection. They do not establish agronomic accuracy. A connected browser was unavailable during this revision: desktop/mobile visual inspection, keyboard walkthrough, live provider responses, and live Gemini answers still need verification. See [Evaluation protocol](EVALUATION.md) for the field-pilot and advisor review requirements.
