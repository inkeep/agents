---
"@inkeep/agents-api": patch
---

Fix structured-output agents emitting artifact citations as raw <artifact:ref> text. The system prompt now gates artifact instructions on output mode: structured-output agents (data components enabled) are instructed to emit artifacts as structured Artifact/ArtifactCreate_ components, while text-mode agents keep the <artifact:*> tag syntax.
