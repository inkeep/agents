---
"@inkeep/agents-manage-ui": patch
---

New projects created in the Manage UI now default their summarizer model to `google/gemini-3.1-flash-lite` instead of `anthropic/claude-sonnet-4-5`. Base and structured-output models are unchanged (still `anthropic/claude-sonnet-4-5`). The create-project form's default-model constants are also renamed from provider-scoped (`DEFAULT_ANTHROPIC_*`) to role-scoped (`DEFAULT_BASE_MODEL`, `DEFAULT_STRUCTURED_OUTPUT_MODEL`, `DEFAULT_SUMMARIZER_MODEL`), and the unused per-provider preset constants were removed.
