---
title: SSE Stream Infrastructure — Injection Points & Protocol
description: Traces the SSE stream lifecycle in both chat routes, identifies injection windows for history emission, and documents Vercel data stream v2 protocol capabilities.
created: 2026-03-19
last-updated: 2026-03-19
---

## 1. Stream Lifecycle — Chat SSE Route (`chat.ts`)

**Source:** `agents-api/src/domains/run/routes/chat.ts:373-492`
**Confidence:** CONFIRMED

```
Line 373: streamSSE(c, async (stream) => { ... })    ← SSE response begins
Line 382: createSSEStreamHelper(stream, requestId)    ← helper created
Line 384: await sseHelper.writeRole()                  ← FIRST event: role='assistant'
  ─────── INJECTION WINDOW ───────                     ← history could be emitted here
Line 492: ExecutionHandler.execute()                   ← agent generation starts
```

The window between `writeRole()` (line 384) and `ExecutionHandler.execute()` (line 492) is ~100 lines of setup code (registering stream helper, creating execution context). This is where history messages could be emitted.

## 2. Stream Lifecycle — Vercel Data Stream Route (`chatDataStream.ts`)

**Source:** `agents-api/src/domains/run/routes/chatDataStream.ts:439-512`
**Confidence:** CONFIRMED

```
Line 439: createUIMessageStream({ execute: async ({ writer }) => { ... } })
Line 441: writer.write({ type: 'start', messageId })  ← message start event
Line 443: createVercelStreamHelper(writer)              ← helper created
  ─────── INJECTION WINDOW ───────                     ← history could be emitted here
Line 512: ExecutionHandler.execute()                   ← agent generation starts
```

Same pattern — clean window between stream setup and execution.

## 3. Vercel Data Stream v2 Protocol — Supported Event Types

**Source:** Web fetch of ai-sdk.dev docs + code inspection
**Confidence:** CONFIRMED

Native event types:
- `start` / `finish` / `abort` — message lifecycle
- `text-start` / `text-delta` / `text-end` — text streaming
- `reasoning-start` / `reasoning-delta` / `reasoning-end` — reasoning
- `tool-input-start` / `tool-input-delta` / `tool-input-available` — tool calls
- `tool-output-available` / `tool-output-error` — tool results
- `source-url` / `source-document` — source references
- `file` — file attachment: `{ url, mediaType }`
- `data-*` — arbitrary structured data with custom type suffix
- `error` — error message

**No "history-message" or "prior-message" event type exists.** The protocol is designed for streaming new assistant responses, not replaying conversation history.

## 4. Vercel AI SDK `useChat` Hook — Message Lifecycle

**Source:** Web fetch of ai-sdk.dev useChat reference
**Confidence:** CONFIRMED

- `initialMessages?: UIMessage[]` — hydrate with existing messages on mount
- `setMessages(messages)` — update messages state without triggering API call
- `sendMessage({ text })` — send new message, triggers stream
- `onData?: (dataPart: DataUIPart) => void` — callback for custom data events

**Key limitation:** The hook processes stream events and constructs a SINGLE new assistant message. It does NOT reconstruct multiple user/assistant message pairs from stream events. History would need to be handled via `onData` callback + custom `setMessages` logic.

## 5. StreamHelper Interface — Available Methods

**Source:** `agents-api/src/domains/run/stream/stream-helpers.ts:13-48`
**Confidence:** CONFIRMED

```typescript
interface StreamHelper {
  writeRole(role?: string): Promise<void>;
  writeContent(content: string): Promise<void>;
  streamData(data: any): Promise<void>;
  streamText(text: string, delayMs?: number): Promise<void>;
  writeError(error: string | ErrorEvent): Promise<void>;
  complete(): Promise<void>;
  writeData(type: string, data: any): Promise<void>;
  writeOperation(operation: OperationEvent): Promise<void>;
  writeSummary(summary: SummaryEvent): Promise<void>;
  // ... tool streaming methods
}
```

No file or history-specific methods. `writeData(type, data)` is the generic escape hatch for custom event types.

## 6. VercelDataStreamHelper — Custom Data Emission

**Source:** `agents-api/src/domains/run/stream/stream-helpers.ts:415-928`
**Confidence:** CONFIRMED

The Vercel helper writes events via `writer.write({ type, ...fields })`. Custom data uses `data-*` prefix convention. The `file` type is a native protocol event with `{ url, mediaType }`.

For history, we could use either:
- Native `file` events for file parts within history (correct shape natively)
- `data-*` events for full message objects (custom protocol extension)

## 7. Conversation History — Current Loading Pattern

**Source:** `agents-api/src/domains/run/agents/generation/conversation-history.ts:14-78`
**Confidence:** CONFIRMED

History is loaded DURING agent generation as a compressed string, embedded in the model prompt. It is never emitted to the stream. The loading uses:
- `getConversationHistoryWithCompression()` for 'full' mode
- `getScopedHistory()` for 'scoped' mode
- Returns `{ conversationHistory: string, contextBreakdown }` — text only, no file parts

## 8. Current Manage UI — Conversation Loading

**Source:** `agents-manage-ui/src/hooks/use-chat-activities-polling.ts`, `agents-manage-ui/src/components/agent/playground/playground.tsx`
**Confidence:** CONFIRMED

The playground uses polling to `/api/traces/conversations/{id}` (which proxies to the manage API), NOT the Vercel `useChat` hook for conversation loading. The SDK guide shows `useChat` for new conversations only — no `initialMessages` pattern for loading existing ones.

## 9. SDK Guide — External Consumer Pattern

**Source:** `agents-manage-ui/src/components/agent/ship/sdk-guide.tsx`
**Confidence:** CONFIRMED

The guide shows a simple `useChat` setup with no `conversationId` or `initialMessages`:
```tsx
const { messages, sendMessage } = useChat({
  transport: new DefaultChatTransport({
    api: "{apiUrl}",
    headers: { Authorization: "Bearer INKEEP_APP_SECRET" },
  }),
});
```

No existing pattern for loading conversation history into `useChat`. Consumers would need to implement this themselves.
