# SPEC: Echo AI Provider & Run Route Integration Tests

## Problem

The run domain API endpoints (`/v1/chat/completions`, `/api/chat`, A2A, MCP, webhooks) require a real AI provider API key (Anthropic, OpenAI, etc.) to produce any response. This creates two gaps:

1. **Local dev experience** — Developers cannot validate the run pipeline works after `pnpm setup-dev` without manually obtaining and configuring an AI provider API key. The app starts fine, `/ready` reports healthy, but the first chat request fails with HTTP 500.

2. **CI/CD test coverage** — Run route integration tests don't exist. CI uses fake keys (`sk-ant-test-key-for-ci-testing`) and mocks the entire AI SDK. The full pipeline (auth → context resolution → agent config → model creation → streaming → DB persistence) is never exercised end-to-end in CI.

### Evidence

- `agents-api/src/env.ts`: `ANTHROPIC_API_KEY` is defined but not validated at startup — lazy-loaded by AI SDK at request time.
- `agents-api/vitest.config.ts`: Sets `ANTHROPIC_API_KEY: 'test-api-key'` — fake key that can't make real calls.
- `agents-api/vitest.integration.config.ts`: Only includes `manage/integration/**/*.test.ts` — no run route integration tests exist.
- `packages/agents-core/src/utils/model-factory.ts`: Provider switch handles `anthropic`, `openai`, `google`, `azure`, `openrouter`, `gateway`, `nim`, `custom` — no echo/test provider.
- CI workflow (`.github/workflows/ci.yml`): Falls back to `sk-ant-test-key-for-ci-testing` — tests can't make real AI calls.

## Goals

1. **Echo AI provider** — A new `echo` provider in ModelFactory that returns deterministic, structured responses without any API key or external HTTP calls. Available in all environments. Supports streaming.

2. **Run route integration tests** — A test suite that exercises the full run pipeline end-to-end using the echo provider, proving auth, context resolution, streaming, conversation history, and DB persistence all work correctly.

## Non-goals

- Health check enhancement (dropped — echo provider solves the core problem; health check for provider config is a separate, lower-priority concern that should be behind authentication if added later)
- Mocking tool call behavior (tool execution has its own unit tests)
- Replacing existing unit test mocks (those test specific code paths; integration tests verify the pipeline)
- Adding a rich/configurable mock provider with error injection or latency simulation (future work if needed)
- Changing the model selector UI to show or hide echo models (the architecture already handles this — see Design)
- MCP integration tests (MCP has 1080 lines of existing unit tests; execution handler is 100% shared with chat; defer to future work)
- Passing conversationId to the echo provider via providerOptions (low effort but not needed — message count proves pipeline correctness; can add later via `providerOptions.inkeep` convention if there's a concrete need)
- Adding any new environment variables

## Design

### 1. Echo AI Provider

#### Implementation: `LanguageModelV2` interface

The echo provider implements the Vercel AI SDK's `LanguageModelV2` interface (the current version in AI SDK v5) — the same interface used by `@ai-sdk/anthropic`, `@ai-sdk/openai`, etc. This means it plugs into the existing pipeline with zero changes to Agent.ts, ExecutionHandler, or streaming infrastructure.

**Location:** `packages/agents-core/src/utils/echo-provider.ts`

**Registration:** Add `echo` case to `ModelFactory.createModel()` in `packages/agents-core/src/utils/model-factory.ts`.

**Model string format:** `echo/default` (follows the existing `provider/model` convention). Any model name under the `echo/` prefix is accepted (e.g., `echo/fast`, `echo/verbose`).

**Response content (structured, deterministic):**
```
Echo response.
Model: echo/{modelName}
Input messages: {count}
Last user message: "{truncated to 200 chars}"
Timestamp: {ISO timestamp}
```

**Streaming behavior:**
- `doStream()` yields the response in multiple chunks (line by line) with ~5ms delays between chunks
- This exercises the full streaming pipeline: SSE encoding, Vercel data stream wrapping, stream registry, buffering
- `doGenerate()` returns the full response immediately (for non-streaming callers like A2A `message/send`)

**No API key required.** The provider operates entirely in-process.

**Finish reason:** Always returns `stop` (no tool calls, no length limit).

**Token usage:** Returns synthetic usage stats: `promptTokens` = character count of input / 4, `completionTokens` = character count of output / 4. This exercises any token-tracking code in the pipeline.

#### Why NOT add to model constants

`packages/agents-core/src/constants/models.ts` defines `ANTHROPIC_MODELS`, `OPENAI_MODELS`, `GOOGLE_MODELS`. These constants are imported by:
- `agents-manage-ui/src/components/agent/configuration/model-options.tsx` (UI dropdown)
- `agents-cli/src/utils/model-config.ts` (CLI model selector)

By NOT adding echo to these constants, the echo provider:
- Is invisible in the Visual Agent Builder dropdown (no-code users never see it)
- Is invisible in the CLI model selector
- CAN still be used by anyone who types `echo/default` via API, SDK, or CLI push
- Shows as `"echo/default (custom)"` in the UI if someone manually configured it (graceful fallback behavior already exists in `model-selector.tsx` lines 66-96)

#### Production warning

When `ENVIRONMENT=production` and the echo provider is invoked, log a warning:
```
[WARN] Echo provider invoked in production environment. Model: echo/{modelName}
```
This catches accidental production deployment of echo-configured agents without preventing intentional use.

### 2. Run Route Integration Tests

**Location:** `agents-api/src/__tests__/run/integration/`

**Vitest config update:** Add `src/__tests__/run/integration/**/*.test.ts` to the appropriate vitest config include patterns.

**Test infrastructure:**
- Each test worker uses PGlite (in-memory database) with full manage + runtime migrations applied
- Tests seed a project and agent configured with `model: "echo/default"` via the data-access layer
- Tests use `INKEEP_AGENTS_RUN_API_BYPASS_SECRET` for auth bypass (already supported in test env)
- No AI SDK mocking — the echo provider handles model calls in-process

**Test cases:**

#### T1: Basic chat completion (SSE streaming)
- `POST /v1/chat/completions` with agent configured with `echo/default`
- Assert: SSE stream received with valid OpenAI-format chunks
- Assert: Response contains structured echo content (message count, last user message)
- Assert: Conversation and messages persisted in runtime DB

#### T2: Chat completion with conversation history
- Send message 1 → get echo response
- Send message 2 to same conversation
- Assert: Echo response for message 2 reports higher `Input messages` count (system + user1 + assistant1 + user2)
- Assert: Both messages and responses persisted in DB

#### T3: Vercel AI SDK data stream
- `POST /api/chat` with echo agent
- Assert: Vercel data stream format received
- Assert: Response content matches structured echo format

#### T4: Non-streaming request
- `POST /v1/chat/completions` with `stream: false`
- Assert: Full JSON response (not SSE) with echo content

#### T5: A2A message/send
- `POST /agents/a2a` with `message/send` method targeting echo agent
- Assert: JSON-RPC response with task containing echo response
- Assert: Task lifecycle (submitted → working → completed) tracked correctly

#### T6: A2A message/stream
- `POST /agents/a2a` with `message/stream` method targeting echo agent
- Assert: SSE stream with JSON-RPC formatted chunks

#### T7: Auth validation
- `POST /v1/chat/completions` without auth headers
- Assert: 401 response (auth required even for echo agents)

#### T8: Any echo model name accepted
- Configure agent with `echo/anything`
- Assert: Still works (echo provider accepts any model name under `echo/` prefix)

## Acceptance Criteria

1. `echo/default` model string works in chat completions and data stream endpoints without any API key configured
2. Echo responses are streamed (multiple SSE chunks) for streaming endpoints
3. Echo responses contain structured debugging info (message count, last user message, timestamp)
4. Integration tests pass in CI without real AI provider keys
5. Echo provider is NOT visible in the manage UI model dropdown
6. Echo provider logs a warning when used in production environment
7. No changes to existing unit tests or mocking patterns
8. All existing tests continue to pass

## Test Plan

See "Test cases" section above (T1-T8). All tests run in CI using PGlite (no external database or AI provider needed).

**Manual verification (Tier 2 — post-implementation):**
- Start local dev with no AI provider keys configured
- Hit `POST /v1/chat/completions` with echo agent → verify streaming response
- Open agent in manage UI → verify `"echo/default (custom)"` display (no crash)
- Send follow-up message → verify conversation history loaded correctly

## Surface Area Impact

### Product surfaces touched
| Surface | Change | Risk |
|---|---|---|
| Run API (Chat Completions) | New model provider (additive) | None — existing models unaffected |
| Chat API (Vercel Data Stream) | Same | None |
| A2A Protocol | Same | None |
| Documentation | New page for echo provider | Required |

### Product surfaces NOT touched
- Visual Agent Builder (echo not added to model constants)
- Chat Widget (no change)
- SDK/CLI (works automatically — no code change needed)
- Evaluations (works automatically)
- Health Endpoints (no change)
- MCP Protocol (works automatically, tests deferred)
- Templates/Cookbook (optional future enhancement)

### Internal surfaces touched
| Surface | Change |
|---|---|
| ModelFactory (`model-factory.ts`) | New `echo` case |
| New file: `echo-provider.ts` | LanguageModelV2 implementation |
| Vitest config | Include run integration tests |
| New test files: `run/integration/*.test.ts` | Integration tests |

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Echo accidentally used in prod agents | Low | Production warning log. Model name (`echo/`) is obviously non-real. Not shown in UI dropdown. |
| Echo provider behavior diverges from real providers | Medium | Echo implements the same `LanguageModelV2` interface. Tests verify the pipeline works the same way. |
| Integration tests become flaky | Low | Echo is deterministic (no network calls). PGlite is in-process. No external dependencies. |

## Future Work (out of scope)

- Health check enhancement for AI provider configuration (should be behind authentication if added)
- Rich mock provider with configurable responses, error injection, latency simulation
- Tool call simulation in echo provider
- MCP integration tests
- ConversationId in echo response via `providerOptions.inkeep` convention
- Echo model visibility controls (feature flags, RBAC)
- Performance benchmarking using echo (baseline latency without AI provider overhead)
- Eval infrastructure tests using echo
