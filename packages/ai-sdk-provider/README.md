# @inkeep/ai-sdk-provider

AI SDK provider for Inkeep Agent Framework. This package allows you to use Inkeep agents through the [Vercel AI SDK](https://sdk.vercel.ai/docs).

## Installation

```bash
npm install @inkeep/ai-sdk-provider
# or
pnpm add @inkeep/ai-sdk-provider
# or
yarn add @inkeep/ai-sdk-provider
```

## Usage

### Basic Usage

```typescript
import { inkeep } from '@inkeep/ai-sdk-provider';
import { generateText } from 'ai';

const result = await generateText({
  model: inkeep('agent-123'),
  prompt: 'Hello, how can you help me?',
});

console.log(result.text);
```

### Streaming Responses

```typescript
import { inkeep } from '@inkeep/ai-sdk-provider';
import { streamText } from 'ai';

const result = await streamText({
  model: inkeep('agent-123'),
  prompt: 'Tell me about your capabilities',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

### Custom Configuration

```typescript
import { createInkeep } from '@inkeep/ai-sdk-provider';

const inkeep = createInkeep({
  baseURL: 'https://your-agents-api.example.com',
  apiKey: process.env.INKEEP_API_KEY,
  headers: {
    'X-Custom-Header': 'value',
  },
});

const model = inkeep('agent-123');
```

### Additional Options

```typescript
import { inkeep } from '@inkeep/ai-sdk-provider';
import { generateText } from 'ai';

const result = await generateText({
  model: inkeep('agent-123', {
    maxTokens: 1000,
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

- `baseURL` - **Required.** The base URL of your Inkeep agents API (can also be set via `INKEEP_BASE_URL` environment variable)
- `apiKey` - Your Inkeep API key (can also be set via `INKEEP_API_KEY` environment variable)
- `headers` - Additional headers to include in requests
- `fetch` - Custom fetch implementation

### Model Options

When creating a model instance, you can configure:

- `maxTokens` - Maximum tokens to generate
- `conversationId` - Conversation ID for multi-turn conversations
- `headers` - Additional headers for context (validated against agent's context config)
- `runConfig` - Run configuration options

## Environment Variables

- `INKEEP_BASE_URL` - **Required.** Base URL for the Inkeep agents API (unless provided via `baseURL` option)
- `INKEEP_API_KEY` - Your Inkeep API key

## Features

- ✅ Text generation (`generateText`)
- ✅ Streaming responses (`streamText`)
- ✅ Multi-turn conversations
- ✅ Custom headers for context
- ✅ Authentication with Bearer tokens
- ✅ Tool call observability (with `x-emit-operations` header)

## API Endpoint

This provider communicates with the `/api/chat` endpoint of your Inkeep agents API.

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
  model: inkeep('agent-123'),
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

## Model Identification

Models are identified by agent ID in the format:
- `agent-123` - Direct agent ID
- `inkeep/agent-123` - With provider prefix (when used with custom factories)

## TypeScript

This package is written in TypeScript and includes full type definitions.

```typescript
import type {
  InkeepProvider,
  InkeepProviderSettings,
  InkeepChatOptions,
} from '@inkeep/ai-sdk-provider';
```

## Examples

See the [examples directory](../../examples) for complete working examples.

## License

See LICENSE.md file for license information.

## Links

- [Inkeep Agent Framework Documentation](../../agents-docs)
- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
