## 2026-03-16

### Changes
- **Spec created:** Initial intake and world model built
- **evidence/current-system-behavior.md:** Created — traces write path, read path, tool call flow, image handling
- **Prior work:** US-001/002/003 already fixed kind/type mismatch, added data+file part read support, fixed pagination count

### Pending (carried forward)
- D1: Where to capture tool calls (tool-wrapper vs AgentSession vs proxy) — proposed: AgentSession
- D2: Write path strategy — proposed: preserve-all
- D3: Blob URI resolution in read path — proposed: out of scope
- Q1: Should tool results be persisted alongside tool calls? — SDK requires both input+output for state:'result'

## 2026-03-16 (session 2)

### Changes
- **Vercel SDK UIMessage types verified** from @ai-sdk/ui-utils source types
- **Critical bug discovered:** Current `toVercelMessage()` tool-invocation format is wrong — uses `{ args, state }` instead of SDK's `{ toolInvocation: { state, toolCallId, toolName, input, output } }`
- **Critical bug discovered:** File parts use `{ data, metadata: { mimeType } }` instead of SDK's `{ mimeType, data }`
- **Q3 resolved:** Audited 10 internal consumers — all safe, filter by explicit kind values
- **A2 confirmed:** Internal consumers won't break with new part kinds
- **FR5, FR6 added:** SDK conformance requirements for tool-invocation and file parts
- **Q1 updated:** SDK requires both input+output for completed tool invocations

### Pending (carried forward)
- Q1: Awaiting user decision on storing tool results (recommended: yes, SDK requires it)
- Q2: Blob URI resolution — deferred
- Ready for implementation pending user decisions

## 2026-03-17 (session 3)

### Changes
- **Root cause of widget rendering failure identified:** GET endpoint returns `{ type: 'data' }` but streaming protocol uses `{ type: 'data-component' }` / `{ type: 'data-artifact' }`. Widget only handles the streaming types.
- **FR5 added:** Data parts must use streaming protocol type names (`data-component` / `data-artifact`)
- **Changes 3-6 restructured:** Data part type fix is now Change 3 (highest priority — fixes the immediate visual bug)
- **SSE stream evidence:** User provided actual SSE output showing `data-component` type used during streaming

### Pending (carried forward)
- Q1: Store tool results? (SDK requires it) → deferred to PRD-6319
- Q2: Blob URI resolution — deferred

## 2026-03-17 (session 4)

### Changes
- **Write path preserve-all RE-EVALUATED:** Investigation found `StreamPart` type is literally `{ kind: 'text' | 'data' }`. responseParts never contains file parts. No data loss today. Demoted from Must to Could.
- **evidence/write-path-part-kinds.md:** Created — documents that only text+data flow through write path
- **FR1 demoted:** From Must to Could (forward-compat only)
- **In Scope updated:** Reflects what's actually implemented vs deferred
- **Future Work restructured:** Tool call persistence and write path preserve-all moved to Explored tier with full context
- **PRD-6319 filed:** Linear ticket for tool result persistence investigation
- **data-component fix implemented and committed:** GET endpoint now uses streaming protocol type names
