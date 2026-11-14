# Prediction and recovery improvements

## Implemented

- Advisor requests carry the latest ten non-error conversation messages, workflow, farm profile, event date, current crop planting date, stage, duration, observations, loss operands and photo-analysis status.
- Recovery weather is separate from planning weather. Loaded records include their time range, source URL, missing-data count and rainfall sum. Missing rainfall remains null. Event/location changes invalidate recovery weather.
- Zod validates structured requests. Actual request bytes are capped at 80 KB, regardless of Content-Length. Only user/assistant history roles are accepted.
- The server recomputes gross revenue at risk using the same pure demo calculation as the UI. Missing operands produce no estimate; impossible totals are rejected.
- The prompt prioritizes the question, current workflow, up to three relevant steps, uncertainty, and one useful missing question. It matches the user's language and treats context/history as untrusted data.
- Responses have room for explanation instead of a two-sentence limit. Failed requests are excluded from conversation context. Incomplete model responses are rejected.
- Requests use Lovable's AI gateway and server-only LOVABLE_API_KEY. The configured model is google/gemini-3.8-flash. No direct Google key is used.
- Recovery steps now differ for flooding, drought, typhoon and heat. They are cautious documentation/assessment checklists, not expert-approved treatments.
- Actual planting of the damaged crop is separate from planned next planting. Optional event fields start unknown.
- Source labels distinguish sample defaults from edited, unverified assumptions. Edited status does not imply that all values were changed or verified. Saved farm data remains explicitly unverified.
- Planning displays missing-evidence review flags before the existing demo comparison. These flags are not scientific crop exclusions.
- Added pure offline yield evaluation metrics and contract tests. No dependencies, database migrations or generated files changed.

## Operational setup

Enable/provision AI through Lovable and expose its managed LOVABLE_API_KEY to this server runtime. Do not commit a key. Verify the configured model is enabled in the project's gateway. The previous GEMINI_API_KEY will not configure this implementation.

The repository has no durable authentication/rate-limit service for this endpoint. Configure deployment-level access controls and request budgets before broad public use. The byte limit and browser cross-site check do not provide authentication or a spending limit.

## Not completed by code alone

No local expert has signed off on the guidance. No real farm outcomes were supplied. Therefore no calibrated yield model, verified suitability rules, validated loss ranges, or agricultural accuracy claim is introduced. See METHODOLOGY.md and EVALUATION.md for the implementation and release gates. Existing research is passed as reference evidence, with its limitations, rather than presented as approved recovery protocols.

No photo diagnosis, model training, database collection, deployment, or live gateway verification was performed. Event details and conversation are session state; they are not a durable farm-outcome database. Database implementation must be requested through Lovable, per AGENTS.md.
