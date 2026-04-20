---
"@inkeep/agents-core": minor
---

Add `TemplateEngine.renderPrompt()` with `PromptRenderOptions` for prompt-time resolution of built-in template variables. The new method accepts a `runtimeBuiltins` option that lets callers inject runtime values (e.g. `{ $conversation: { id } }`) to be resolved inside `{{$...}}` expressions before falling through to the existing `$env.*` handling. Existing `render()` behavior and the three non-prompt callers (delegation headers, context-fetcher URLs, MCP credential templating) are unchanged.
