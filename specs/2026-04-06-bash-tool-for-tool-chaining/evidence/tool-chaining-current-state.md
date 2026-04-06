---
title: Tool Chaining Current State
type: evidence
sources:
  - agents-api/src/domains/run/agents/versions/v1/PromptConfig.ts
  - agents-api/src/domains/run/artifacts/ArtifactParser.ts
  - agents-api/src/domains/run/agents/tools/tool-wrapper.ts
  - agents-api/src/domains/run/constants/artifact-syntax.ts
---

## $tool / $artifact Sentinel Reference System

Two sentinel keys defined in `artifact-syntax.ts`:
- `$tool` — references a tool call ID, resolves to the raw cached result from `ToolSessionManager`
- `$artifact` — combined with `$tool`, references a stored artifact, resolves to full artifact data from DB

Resolution happens in `ArtifactParser.resolveArgs()` (lines 230-284), called by `tool-wrapper.ts:165-167` **before** tool execution. Recursive — handles nested refs in objects and arrays.

## Tool Result Caching

All tool results are cached in `ToolSessionManager` (singleton, in-memory Map):
- Keyed by `toolCallId`
- 5-minute TTL (`SESSION_TOOL_RESULT_CACHE_TIMEOUT_MS: 300_000`)
- Cleanup every 60s

Recording happens in tool-wrapper after execution:
- MCP tools: `mcp-tools.ts:182-188`
- Function tools: `function-tools.ts:139-145`
- Relation tools: `relationTools.ts:482-491`

## Prompt Guidance (Phantom Extract Step)

`PromptConfig.ts:742-813` teaches a pipeline pattern:
```
tool_a(...)  → large result (call_a)
extract({ "source": { "$tool": "call_a" }, ... })  → subset (call_b)
tool_b({ "input": { "$tool": "call_b" } })
```

The `extract` step is referenced but no built-in tool exists for it. Agents must rely on available MCP tools or read data into context.

## Structure Hints

`enhanceToolResultWithStructureHints()` in `tool-result.ts:11-268`:
- Analyzes tool result structure
- Adds `_structureHints` with: terminalPaths, arrayPaths, objectPaths, commonFields, exampleSelectors, deepStructureExamples
- Includes `artifactGuidance` with JMESPath syntax help
- Applied to all tool results automatically

## Tool Loading Pipeline

`tool-loading.ts:14-79` assembles all tools:
```
Promise.all([getMcpTools, getFunctionTools, getRelationTools, getDefaultTools])
  → merge → sanitizeToolsForAISDK → pass to AI SDK
```

Default tools (`default-tools.ts:133-194`) are always injected:
- `get_reference_artifact` — conditional on artifacts or compression
- `load_skill` — conditional on on-demand skills
- `compress_context` — always on
