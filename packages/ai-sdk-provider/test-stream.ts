import { streamText } from 'ai';
import { createInkeep } from './src/inkeep-provider';

async function testStream() {
  const inkeepProvider = createInkeep({
    // apiKey: 'sk_UYw7KBoayipw.dxlVehPO6M_RIEPRrJNSOS-lVI0_l5agCXWc5hbHbJk',
    baseURL: 'http://localhost:3003',
    headers: {
      'x-emit-operations': 'true', // Enable tool events and other operations
      'x-inkeep-agent-id': 'event-planner',
      'x-inkeep-tenant-id': 'default',
      'x-inkeep-project-id': 'event-planner',
    },
  });

  // console.log('Starting stream test...\n');

  // const response = await streamText({
  //   model: inkeepProvider('agent-123'),
  //   prompt: 'Hello, how are you?',
  // });

  // console.log('Stream response object:', response);
  // console.log('\n--- Streaming text chunks: ---\n');

  // // Option 1: Stream text chunks
  // for await (const chunk of response.textStream) {
  //   console.log(chunk);
  // }

  console.log('\n\n--- Full stream events: ---\n');

  // Option 2: Stream full events (use a new request)
  const response2 = await streamText({
    model: inkeepProvider('agent-123'),
    prompt: 'what the weather in nyc',
  });

  let text = '';
  let toolCallCount = 0;
  let toolResultCount = 0;

  for await (const event of response2.fullStream) {
    switch (event.type) {
      case 'text-start':
        console.log(`\n[text-start] ID: ${event.id}`);
        break;
      case 'text-delta':
        // Skip logging individual deltas to avoid spam
        text += event.delta;
        break;
      case 'text-end':
        console.log(`[text-end] ID: ${event.id}`);

        break;
      case 'tool-call':
        toolCallCount++;
        console.log(`\n🔧 [tool-call #${toolCallCount}]`);
        console.log(`   Tool: ${event.toolName}`);
        console.log(`   ID: ${event.toolCallId}`);
        console.log(`   Input: ${event.input}`);
        break;
      case 'tool-result':
        toolResultCount++;
        console.log(`\n✅ [tool-result #${toolResultCount}]`);
        console.log(`   Tool: ${event.toolName}`);
        console.log(`   ID: ${event.toolCallId}`);
        console.log(`   Result:`, JSON.stringify(event.output, null, 2));
        break;
      case 'finish':
        console.log(`\n[finish] Reason: ${event.finishReason}`);
        console.log(`Total tool calls: ${toolCallCount}, Total tool results: ${toolResultCount}`);
        if (event.usage) {
          console.log('Usage:', event.usage);
        }
        break;
      default:
        console.log('Event:', JSON.stringify(event, null, 2));
    }
  }

  console.log('\n--- Done ---');
}

testStream().catch(console.error);
