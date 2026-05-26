---
"@inkeep/agents-core": minor
"@inkeep/agents-sdk": minor
"@inkeep/agents-api": minor
---

Add sub-agent output contract. A new outputContract field on SubAgentConfig enforces structured-only emission via allowText, list-valued requireComponent/requireArtifact (every named component/artifact must appear), and a boolean requireTransfer (the response must hand off to another sub-agent), with a configurable onViolation policy. The active contract is also surfaced in the sub-agent's system prompt so the model is steered to comply. Opt-in; agents without a contract are unchanged.
