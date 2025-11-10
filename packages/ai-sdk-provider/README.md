# @inkeep/ai-sdk-provider

AI SDK provider for Inkeep Agent Framework. This package allows you to use Inkeep agents through the [Vercel AI SDK](https://sdk.vercel.ai/docs).

## Installation

```bash
npm install @inkeep/ai-sdk-provider

```

## Usage

## Basic Usage

### Text Generation

```typescript
import { generateText } from 'ai';
import { createInkeep } from '@inkeep/ai-sdk-provider';

const inkeep = createInkeep({
  baseURL: proccess.env.INKEEP_AGENTS_RUN_API_URL, // Required
  apiKey: <your-agent-api-key>, // Created in the Agents Dashboard
  headers: { // Optional if you are developing locally and dont want to use an api key
    'x-inkeep-agent-id': 'your-agent-id',
    'x-inkeep-tenant-id': 'your-tenant-id',
    'x-inkeep-project-id': 'your-project-id',
  },
});

const { text } = await generateText({
  model: inkeep(),
  prompt: 'What is the weather in NYC?',
});

console.log(text);
```

### Streaming Responses

```typescript
import { streamText } from 'ai';
import { createInkeep } from '@inkeep/ai-sdk-provider';

const inkeep = createInkeep({
  baseURL: proccess.env.INKEEP_AGENTS_RUN_API_URL,
  apiKey: <your-agent-api-key>,
  headers: {
    'x-emit-operations': 'true', // Enable tool event streaming
  },
});

const result = await streamText({
  model: inkeep(),
  prompt: 'Plan an event in NYC',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

```typescript
createInkeep({
  baseURL: string,        // Required. Your agents-run-api URL
  apiKey?: string,        // Optional. Bearer token for authentication
  headers?: Record<string, string>, // Optional. Additional headers
})
```

### Provider Options

Pass options when creating a provider instance:

```typescript
const provider = inkeep({
  conversationId: 'conv-456',
  headers: { 'user-id': 'user-789' },
});
```

### Additional Options

```typescript
import { inkeep } from '@inkeep/ai-sdk-provider';
import { generateText } from 'ai';

const result = await generateText({
  model: inkeep({
    conversationId: 'conv-123',
    headers: {
      'user-id': 'user-456',
    },
  }),
  prompt: 'Hello!',
});
```

## Configuration

### Provider Settings

When creating a custom provider with `createInkeep()`, you can configure:

- `baseURL` - **Required.** The base URL of your Inkeep agents API (can also be set via `INKEEP_AGENTS_RUN_API_URL` environment variable)
- `apiKey` - Your Inkeep API key (can also be set via `INKEEP_API_KEY` environment variable)
- `headers` - Additional headers to include in requests

### Model Options

When creating a model instance, you can configure:

- `conversationId` - Conversation ID for multi-turn conversations
- `headers` - Additional headers for context (validated against agent's context config)

## Environment Variables

- `INKEEP_AGENTS_RUN_API_URL` - Base URL for the Inkeep agents API (unless provided via `baseURL` option)

## Features

- ✅ Text generation (`generateText`)
- ✅ Streaming responses (`streamText`)
- ✅ Multi-turn conversations
- ✅ Custom headers for context
- ✅ Authentication with Bearer tokens
- ✅ Tool call observability (with `x-emit-operations` header)

## API Endpoint

This provider communicates with the `/api/chat` endpoint of your Inkeep Agents Run API.

- **Non-streaming** (`generateText`): Sends `stream: false` parameter - returns complete JSON response
- **Streaming** (`streamText`): Sends `stream: true` parameter - returns Vercel AI SDK data stream

The endpoint supports both streaming and non-streaming modes and uses Bearer token authentication.

### Tool Call Observability

To receive tool call and tool result events in your stream, include the `x-emit-operations: true` header:

```typescript
import { streamText } from 'ai';
import { createInkeep } from '@inkeep/ai-sdk-provider';

const inkeep = createInkeep({
  baseURL: 'https://your-api.example.com',
  apiKey: process.env.INKEEP_API_KEY,
  headers: {
    'x-emit-operations': 'true', // Enable tool event streaming
  },
});

const result = await streamText({
  model: inkeep(),
  prompt: 'Search for recent papers on AI',
});

// Listen for all stream events
for await (const event of result.fullStream) {
  switch (event.type) {
    case 'text-start':
      console.log('📝 Text streaming started');
      break;
    case 'text-delta':
      process.stdout.write(event.delta);
      break;
    case 'text-end':
      console.log('\n📝 Text streaming ended');
      break;
    case 'tool-call':
      console.log(`🔧 Calling tool: ${event.toolName}`);
      console.log(`   Input: ${event.input}`);
      break;
    case 'tool-result':
      console.log(`✅ Tool result from: ${event.toolName}`);
      console.log(`   Output:`, event.result);
      break;
  }
}
```

**Note**: Tool events are only emitted when the `x-emit-operations: true` header is set. Without this header, you'll only receive text lifecycle events (text-start, text-delta, text-end) and the final response.

### Supported Stream Events

The provider emits the following AI SDK v2 stream events:

**Text Events** (always emitted):
- `text-start` - Marks the beginning of a text stream
- `text-delta` - Text content chunks as they arrive
- `text-end` - Marks the end of a text stream

**Tool Events** (requires `x-emit-operations: true` header):
- `tool-call` - Agent is calling a tool
- `tool-result` - Tool execution completed

**Control Events** (always emitted):
- `finish` - Stream completion with usage statistics
- `error` - Stream error occurred
