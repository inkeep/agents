import { streamText } from 'ai';
import { createInkeep } from './src/inkeep-provider';

async function testToolEvents() {
  const inkeepProvider = createInkeep({
    apiKey: 'sk_UYw7KBoayipw.dxlVehPO6M_RIEPRrJNSOS-lVI0_l5agCXWc5hbHbJk',
    baseURL: 'http://localhost:3003',
    headers: {
      'x-emit-operations': 'true', // Enable tool event streaming
    },
  });

  console.log('Starting tool event test with x-emit-operations enabled...\n');
  console.log('This will show tool calls and results as they happen.\n');
  console.log('='.repeat(60));

  const response = await streamText({
    model: inkeepProvider('agent-123'),
    prompt: 'Use tools to help me plan an event',
  });

  console.log('\n--- Streaming events: ---\n');

  let toolCallCount = 0;
  let toolResultCount = 0;

  for await (const event of response.fullStream) {
    switch (event.type) {
      case 'text-start':
        console.log(`\n📝 Text stream starting (ID: ${event.id})...\n`);
        break;

      case 'text-delta':
        process.stdout.write(event.delta);
        break;

      case 'text-end':
        console.log(`\n\n📝 Text stream ended (ID: ${event.id})`);
        break;

      case 'tool-call':
        toolCallCount++;
        console.log(`\n🔧 Tool Call #${toolCallCount}`);
        console.log(`   Name: ${event.toolName}`);
        console.log(`   ID: ${event.toolCallId}`);
        console.log(`   Input: ${event.input}`);
        break;

      case 'tool-result':
        toolResultCount++;
        console.log(`\n✅ Tool Result #${toolResultCount}`);
        console.log(`   Name: ${event.toolName}`);
        console.log(`   ID: ${event.toolCallId}`);
        console.log(`   Output:`, JSON.stringify(event.result, null, 2));
        break;

      case 'finish':
        console.log('\n\n--- Stream finished ---');
        console.log(`Finish reason: ${event.finishReason}`);
        console.log(`Total tool calls: ${toolCallCount}`);
        console.log(`Total tool results: ${toolResultCount}`);
        if (event.usage) {
          console.log(`Token usage:`, event.usage);
        }
        break;

      case 'error':
        console.error('\n❌ Error:', event.error);
        break;

      default:
        console.log(`\n[${event.type}]`);
    }
  }

  console.log('\n\n='.repeat(60));
  console.log('Test complete!');
}

testToolEvents().catch(console.error);
