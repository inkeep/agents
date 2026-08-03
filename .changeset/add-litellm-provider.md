---
"@inkeep/agents-core": patch
"@inkeep/agents-manage-ui": patch
---

Add LiteLLM as a built-in OpenAI-compatible model provider. Use the `litellm/` prefix (e.g. `litellm/anthropic/claude-sonnet-4-5`) to route through a LiteLLM proxy; the base URL resolves from `providerOptions.baseURL`, then `LITELLM_API_BASE`, then `http://localhost:4000/v1`, and `LITELLM_API_KEY` is sent as a bearer token when set.
