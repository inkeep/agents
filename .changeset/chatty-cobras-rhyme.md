---
"@inkeep/create-agents": patch
"@inkeep/agents-core": patch
"@inkeep/agents-sdk": patch
"@inkeep/agents-manage-ui": patch
"@inkeep/agents-api": patch
"@inkeep/agents-cli": patch
---

Remove structuredOutput model configuration option

**Breaking Change**: The `structuredOutput` model configuration has been removed from the `Models` type. All code generation now uses the `base` model configuration.

**Migration**: Remove any `structuredOutput` configurations from your projects, agents, and sub-agents. The framework will automatically use the `base` model for all operations, including data components.

Before:
```typescript
models: {
  base: { model: "anthropic/claude-sonnet-4-5" },
  structuredOutput: { model: "openai/gpt-4.1-mini" },
  summarizer: { model: "anthropic/claude-haiku-4-5" }
}
```

After:
```typescript
models: {
  base: { model: "anthropic/claude-sonnet-4-5" },
  summarizer: { model: "anthropic/claude-haiku-4-5" }
}
```
