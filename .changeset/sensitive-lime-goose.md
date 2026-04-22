---
"@inkeep/agents-api": minor
---

Capture intermediate text in structured-output generation via dual-stream consumption; post-stream fallback walks all steps' text when the final structured object fails to emit; new `mixed_generation` value on `generationType` when a response contains both text and data parts; extend `AgentGenerateData.parts[].type` and `AgentReasoningData.parts[].type` unions to include `data_component` and `data_artifact` so data parts are accurately labeled rather than mislabeled as `tool_result`; WARN log on structured-output generation failure
