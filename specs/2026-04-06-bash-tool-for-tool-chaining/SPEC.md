# SPEC: Data Query & Transform for Tool Chaining

**Baseline commit:** a9ad83507  
**Status:** Revised after audit  
**Date:** 2026-04-06  
**Author:** Tim Cardona + Claude

---

## 1. Problem Statement

### Situation
The Inkeep agent system has a tool chaining mechanism: `$tool`/`$artifact` sentinel refs (resolved by `ArtifactParser.resolveArgs()` in `tool-wrapper.ts:161-167`) allow agents to pipe raw tool outputs between tools without the data entering conversation context. The system also provides `_structureHints` — auto-generated structural maps of tool results (paths, types, example selectors) — so the LLM understands the shape of data without reading every byte. The prompt guidance in `PromptConfig.ts:742-813` teaches a pipeline pattern: `tool_a → extract → tool_b`.

### Complication
The `extract` step **does not exist**. When tool results are large:

1. **Compression loops** — fires when context exceeds ~100K tokens. Extra LLM call via `distillConversation()`, detail loss.
2. **Truncation** — text capped at 100K chars (`tool-result-for-model-input.ts:4`), silently dropping data.
3. **Oversized blocking** — artifacts >30% of context window become completely inaccessible (`retrievalBlocked: true`).

JMESPath extraction only runs during artifact creation. The LLM can see data shapes via `_structureHints` but has no way to filter data without pulling it into context.

### Resolution
Two phased capabilities:

**Phase 1 — `$select` selector in `$tool` refs:** Enhance `resolveArgs()` to support inline JMESPath filtering at resolution time. E.g., `{ "$tool": "call_id", "$select": "items[?score > `0.8`].{title: title, url: url}" }`. This filters data before it reaches the downstream tool — no extra tool call, no token cost in system prompts, **zero new dependencies** (uses the existing `jmespath` library already in the codebase). `_structureHints` already generates example JMESPath selectors that the LLM can use directly. Covers the pipeline case (filtering data between tools).

**Phase 2 — Built-in `bash` tool:** A sandboxed shell (via `just-bash`) for exploratory querying — when the agent needs to see the filtered result before deciding what to do. Executes via the existing `SandboxExecutorFactory` (NativeSandboxExecutor for local dev, VercelSandboxExecutor for production). Covers the interactive case. Requires dependency validation spike first.

---

## 2. Goals

1. Enable agents to filter/transform large tool results without data entering conversation context
2. Eliminate unnecessary compression loops caused by large tool results
3. Make the phantom "extract" step in tool chaining guidance real
4. Unlock processing of oversized artifacts that are currently inaccessible
5. Integrate with the existing `$tool`/`$artifact` reference system

## 3. Non-Goals

- **NOT NOW:** Multiple source refs per call (joins/diffs). `$tool` chaining handles multi-step.
- **NOT NOW:** SDK opt-out configuration. Always available for v1.
- **NEVER:** Network access from the bash tool. Data processing only.
- **NEVER:** Python/JavaScript runtimes in bash. Unnecessary weight and attack surface.

---

## 4. Phasing

### Phase 1: `$select` Selector in `$tool` Refs (In Scope)

**What:** Add a `$select` sibling key to the `$tool`/`$artifact` sentinel ref system. When present, the resolved data is filtered through JMESPath before being passed to the tool.

**Why first:**
- Smallest possible change — enhances existing `resolveArgs()`, no new tool
- Zero token cost — no tool schema in system prompt
- **Zero new dependencies** — uses the existing `jmespath` library (already in `agents-api/package.json` and `agents-core/package.json`)
- `_structureHints` already generate JMESPath example selectors (`exampleSelectors`, `deepStructureExamples`) that the LLM can use directly
- `sanitizeJMESPathSelector()` already fixes common LLM JMESPath errors
- Covers the primary use case (pipeline filtering between tools)
- No event loop blocking concern (JMESPath on sub-MB data is <1ms)
- Language-agnostic key name (`$select`) allows upgrading to jq later without changing the API

**Example:**
```typescript
// LLM calls a downstream tool with filtered data:
render_card({
  data: {
    "$tool": "call_search",
    "$select": "items[?score > `0.8`].{title: title, url: url}"
  }
})
// resolveArgs resolves $tool to raw data, applies JMESPath $select filter, passes subset to render_card
```

**What it doesn't cover:** The agent can't SEE the filtered result — it goes straight to the downstream tool. For exploratory querying ("let me inspect this data, then decide what to do"), the agent needs Phase 2.

### Phase 2: Built-in `bash` Tool (Future Work — Explored)

**What:** A sandboxed bash tool powered by `just-bash` for interactive data exploration.

**Prerequisites (must resolve before implementing):**
1. **Dependency spike** — verify `just-bash` installs, builds, and works in the codebase. Measure cold start time including WASM initialization (could be 500ms-2s, not the original 100-200ms estimate).
2. **Token cost measurement** — quantify the bash tool schema token cost (~300-350 tokens per system prompt). Determine if always-on is justified or if conditional injection is needed.
3. **Phase 1 usage data** — does `$select` in refs cover enough use cases? What fraction of cases need the exploratory pattern?

**Design (pending prerequisite resolution):**
- Sandboxed bash via `just-bash` — jq, grep, awk, sort, and ~80 Unix commands
- Data passed via stdin (stateless per call)
- **Execution via `SandboxExecutorFactory`** — the existing dual-path sandbox infrastructure. Routes to `NativeSandboxExecutor` (child process, local dev) or `VercelSandboxExecutor` (Vercel MicroVM, production). This solves the Vercel serverless compatibility issue (audit finding H1) without new infrastructure.
- The bash worker script becomes a sandbox function: receives `{ command, stdin }`, imports just-bash, runs `bash.exec()`, returns `{ stdout, stderr, exitCode }`
- Output cached in `ToolSessionManager` via explicit `recordToolResult()` call — NOT auto-cached by `wrapToolWithStreaming` (audit finding H2)
- Can process oversized artifacts (bypasses `retrievalBlocked`)
- OpenTelemetry spans for tracing (audit finding M4)

---

## 5. Phase 1 Technical Design

### 5.1 `$select` Selector in resolveArgs

Enhance `ArtifactParser.resolveArgs()` (`ArtifactParser.ts:230-284`) to recognize a `$select` key alongside `$tool`/`$artifact`:

```typescript
// New sentinel key in artifact-syntax.ts:
export const SENTINEL_KEY = {
  ARTIFACT: '$artifact',
  TOOL: '$tool',
  SELECT: '$select',  // NEW — JMESPath filter expression
} as const;

// In resolveArgs():
if (typeof args[SENTINEL_KEY.TOOL] === 'string') {
  // Resolve the $tool ref (existing logic)
  let data = /* resolved raw data or artifact data */;

  // NEW: Apply JMESPath $select filter if present
  if (typeof args[SENTINEL_KEY.SELECT] === 'string') {
    const selector = sanitizeJMESPathSelector(args[SENTINEL_KEY.SELECT]);
    data = applySelector(data, selector);
  }

  return data;
}
```

### 5.2 JMESPath Library (Existing)

**No new dependency.** Uses the existing `jmespath` package (`^0.16.0`) already in:
- `agents-api/package.json:91`
- `packages/agents-core/package.json:200`

Already used by `ArtifactService.ts` for artifact extraction. The same `jmespath.search()` function applies here.

Additionally, `sanitizeJMESPathSelector()` (`ArtifactService.ts:848-873`) already fixes common LLM JMESPath errors (double-quoted comparisons, malformed tilde operators, etc.). Reuse this for `$select` expressions.

### 5.3 Source Data Serialization

The `$select` filter operates on the resolved data. Handle different data types:

| Source type | Serialization for jq | Notes |
|-------------|---------------------|-------|
| Object/Array | `JSON.stringify(data)` | Normal case — jq operates on JSON |
| String | Pass as-is (not re-stringified) | Avoid double-quoting: `"hello"` not `"\"hello\""` |
| MCP content array | Unwrap text parts, concatenate | `{ content: [{type: 'text', text: '...'}] }` → extract text |
| Buffer/binary | Skip jq, return error | jq only works on text/JSON |

### 5.4 Oversized Artifact Processing

When `$tool`+`$artifact` ref resolves to an oversized artifact (`retrievalBlocked: true`):
- `$select` filtering bypasses the retrieval block
- Artifact data fetched via `ArtifactService.getArtifactFull()` with new `{ allowOversized: true }` option
- jq filter applied, producing a subset that fits in context
- Key capability: previously inaccessible data becomes usable

### 5.5 Error Handling

```typescript
function applySelector(data: any, selector: string): any {
  try {
    const sanitized = sanitizeJMESPathSelector(selector);
    const result = jmespath.search(data, sanitized);
    if (result === null || result === undefined) {
      // Selector matched nothing — return empty rather than failing
      return null;
    }
    return result;
  } catch (error) {
    throw new ToolChainResolutionError(
      toolCallId,
      `$select filter failed: ${error.message}. Expression: ${selector}`
    );
  }
}
```

On jq failure, the `ToolChainResolutionError` propagates to the LLM as a tool call error. The LLM can retry with corrected syntax (same pattern as existing artifact resolution errors).

### 5.6 Prompt Guidance Updates

Update `getToolChainingGuidance()` in `PromptConfig.ts:742`:

```
DATA FILTERING WITH $select:
When passing a tool result to another tool, you can filter the data inline using $select.
$select uses JMESPath expressions (the same syntax as _structureHints example selectors).

  tool_a(...)  → large result (call_id: "call_a")
  tool_b({ "input": { "$tool": "call_a", "$select": "items[?score > `0.8`].{title: title, url: url}" } })
  ← tool_b receives only the filtered subset

The $select filter runs BEFORE the data reaches the tool — large results are filtered
without entering conversation context. Use _structureHints exampleSelectors to find the
right JMESPath expression for the data.

Common JMESPath patterns:
  "items[?score > `0.8`]"                     — filter array by condition
  "items[].{title: title, url: url}"           — extract specific fields
  "data | length(@)"                           — count elements
  "records[?status == 'failed']"               — find specific records
  "items[0]"                                   — first element

IMPORTANT: $select filters the data that the downstream tool receives.
You will NOT see the filtered result in conversation — it goes directly to the tool.
If you need to inspect the data first, read it into context.

Use the exampleSelectors from _structureHints — they are ready-to-use JMESPath expressions
for the data you're working with.
```

---

## 6. Integration Points (Phase 1)

### Modified files

| File | Change |
|------|--------|
| `agents-api/src/domains/run/constants/artifact-syntax.ts` | Add `JQ: '$select'` to `SENTINEL_KEY` |
| `agents-api/src/domains/run/artifacts/ArtifactParser.ts:230-284` | Add `$select` handling in `resolveArgs()` |
| `agents-api/src/domains/run/artifacts/ArtifactService.ts` | Add `allowOversized` option to `getArtifactFull()` |
| `agents-api/src/domains/run/agents/versions/v1/PromptConfig.ts:742-813` | Update tool chaining guidance with `$select` examples |
| `agents-api/src/domains/run/agents/generation/tool-result.ts:215-260` | Update `_structureHints` to suggest `$select` usage |
### New files

| File | Purpose |
|------|---------|
| `agents-api/src/domains/run/utils/select-filter.ts` | `applySelector()` function wrapping jmespath + sanitizeJMESPathSelector |
| `agents-api/src/__tests__/run/utils/select-filter.test.ts` | Unit tests for selector filtering |
| `agents-api/src/__tests__/run/artifacts/resolveArgs-select.test.ts` | Integration tests for `$select` in resolveArgs |

### Existing code reuse (no changes needed)

| Component | How it participates |
|-----------|---------------------|
| `resolveArgs()` | Extended (not replaced) — existing `$tool`/`$artifact` logic unchanged |
| `ToolChainResolutionError` | Reused for jq filter errors |
| `tool-wrapper.ts` | No changes — `resolveArgs` is called before tool execution as before |
| `ToolSessionManager` | No changes — downstream tool results still cached normally |

---

## 7. Decision Log

| # | Decision | Status | Type | Confidence | Rationale |
|---|----------|--------|------|------------|-----------|
| D1 | Phase 1: `$select` (JMESPath) in resolveArgs; Phase 2: bash tool | LOCKED | Cross-cutting | HIGH | `$select` is smallest viable change — no new tool, no token cost, zero new deps (uses existing `jmespath`). Bash tool for exploratory cases pending validation. |
| D2 | Queryable sources = session cache + stored artifacts | DIRECTED | Cross-cutting | HIGH | Session cache for current-turn, artifacts for cross-turn |
| D3 | Allow processing oversized artifacts | LOCKED | Cross-cutting | HIGH | Key capability — jq filter operates out-of-context |
| D4 | Phase 2 blocked on: dependency spike, Vercel compat, token cost measurement | DIRECTED | Technical | HIGH | Audit found child process model incompatible with Vercel serverless (H1). Must resolve before Phase 2. |
| D5 | Bash tool must explicitly call `recordToolResult()` | LOCKED | Technical | HIGH | Audit finding H2: `wrapToolWithStreaming` does NOT auto-cache. Each tool type caches explicitly. |
| D6 | Phase 2 execution via SandboxExecutorFactory | DIRECTED | Technical | HIGH | Reuses existing dual-path sandbox (NativeSandboxExecutor local, VercelSandboxExecutor prod). Solves Vercel compat. |
| D7 | Phase 2 injection: conditional (not always-on) pending token cost analysis | INVESTIGATING | Product | MEDIUM | Challenger finding: ~300-350 tokens/call overhead. Need measurement before locking always-on. |
| D8 | Phase 1 uses existing `jmespath` library; `$select` key is language-agnostic for future jq upgrade | LOCKED | Technical | HIGH | Zero new deps. `_structureHints` already generates JMESPath selectors. `sanitizeJMESPathSelector()` fixes LLM errors. |

---

## 8. Open Questions

### Phase 1

*All Phase 1 questions resolved. Using existing `jmespath` library. No spike needed.*

### Phase 2 (must resolve before Phase 2 implementation)

2. **[Technical, P0]** just-bash cold start time including WASM init (sql.js, quickjs-emscripten). Could be 500ms-2s. Spike needed.
3. **[Technical, P0]** Verify just-bash works within SandboxExecutorFactory (both Native and Vercel paths).
4. **[Product, P0]** Token cost of bash tool schema. Quantify before deciding always-on vs conditional.
5. **[Technical, P0]** Observability — need OpenTelemetry spans for bash tool calls (audit finding M4).

---

## 9. Assumptions

| # | Assumption | Confidence | Verification |
|---|-----------|------------|--------------|
| A1 | LLMs can use JMESPath selectors from `_structureHints` reliably | MEDIUM | `_structureHints` generates ready-to-use selectors. `sanitizeJMESPathSelector` fixes errors. Verify with test agents. |
| A2 | JMESPath on sub-MB JSON completes in <1ms | HIGH | JMESPath is pure JS, lightweight. Benchmark during implementation. |
| A3 | `$select` in resolveArgs doesn't break existing `$tool` ref consumers | HIGH | Verify — new key is additive, existing keys unchanged. |

---

## 10. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| LLM writes bad JMESPath expressions | Medium | `sanitizeJMESPathSelector()` auto-fixes common errors. `_structureHints` provide ready-to-use selectors. `ToolChainResolutionError` returns clear error. |
| `$select` in resolveArgs adds latency to all tool calls | Low | Only runs when `$select` key is present. No overhead for normal refs. JMESPath is <1ms. |
| just-bash dependency abandoned (Phase 2) | Medium | Thin wrapper. Can replace with direct jq/grep libs. |
| JMESPath too limiting for complex transforms | Medium | `$select` key is language-agnostic. Can upgrade to jq in Phase 2 without changing the API contract. |

---

## 11. Future Work

| Item | Maturity | Phase |
|------|----------|-------|
| Built-in bash tool | Explored | Phase 2 — pending dependency spike, Vercel compat, token cost analysis |
| Custom bash commands (`defineCommand`) | Identified | Phase 2+ |
| Multiple source refs | Explored | Decided single-source. Revisit if join use cases emerge. |
| `$select` on artifact refs in prompt text (not just tool args) | Noted | Would allow filtering in `<artifact:ref>` tags too |

---

## 12. Acceptance Criteria (Phase 1)

1. `{ "$tool": "call_id", "$select": "items[?score > `0.8`]" }` in a tool argument resolves to the JMESPath-filtered subset of the tool result
2. `{ "$artifact": "id", "$tool": "call_id", "$select": "..." }` resolves to filtered artifact data
3. Oversized artifacts can be filtered via `$select` (bypasses `retrievalBlocked`)
4. JMESPath filter errors produce `ToolChainResolutionError` with the expression and error message
5. Existing `$tool` and `$artifact` refs without `$select` work identically to before (no regression)
6. Non-JSON source data (plain strings) handled correctly (not double-quoted)
7. Prompt guidance teaches `$select` usage with examples
8. `_structureHints` reference `$select` as an option for filtering

---

## 13. Agent Constraints (Phase 1)

**SCOPE:**
- `agents-api/src/domains/run/constants/artifact-syntax.ts`
- `agents-api/src/domains/run/artifacts/ArtifactParser.ts`
- `agents-api/src/domains/run/artifacts/ArtifactService.ts`
- `agents-api/src/domains/run/agents/versions/v1/PromptConfig.ts`
- `agents-api/src/domains/run/agents/generation/tool-result.ts`
- `agents-api/src/domains/run/utils/` (new jq-filter.ts)
- `agents-api/src/__tests__/`
- `agents-api/package.json`

**EXCLUDE:**
- SDK packages — no changes
- UI packages — no changes
- Database schema — no changes
- Child process infrastructure — Phase 2

**STOP_IF:**
- jq library spike shows no viable option for full jq syntax in JS
- `resolveArgs` changes break existing `$tool`/`$artifact` resolution
- Performance testing shows jq adds >50ms to arg resolution

**ASK_FIRST:**
- Changes to `tool-wrapper.ts`
- Changes to `ArtifactParser.ts` beyond the `$select` addition
- Adding dependencies >1MB

---

## 14. Verification Plan (Phase 1)

### Unit tests

**select-filter.ts:**
- [ ] Filter JSON array by condition (`items[?score > `0.8`]`)
- [ ] Extract specific fields (`items[].{title: title, url: url}`)
- [ ] Count/aggregate (`length(items)`)
- [ ] Nested access (`data.results[0].content`)
- [ ] String input — handled correctly (not double-quoted)
- [ ] Invalid expression → clear error message
- [ ] Null/empty input → returns null gracefully
- [ ] `sanitizeJMESPathSelector` applied before execution

**resolveArgs with $select:**
- [ ] `$tool` + `$select` → filtered data
- [ ] `$artifact` + `$tool` + `$select` → filtered artifact data
- [ ] `$tool` without `$select` → unchanged behavior (regression test)
- [ ] `$artifact` + `$tool` without `$select` → unchanged behavior
- [ ] Oversized artifact + `$select` → filtered (bypasses block)
- [ ] Bad JMESPath expression → `ToolChainResolutionError`
- [ ] Nested refs with `$select` at different levels → each resolved independently
- [ ] `$select` that returns null → downstream tool receives null (not error)

### Integration tests
- [ ] Full pipeline: tool_a → tool_b with `$select` filter in args → tool_b receives subset
- [ ] Downstream tool result cached in `ToolSessionManager` normally
- [ ] Structure hints on downstream tool's result are correct
