import { generateText } from 'ai';
import { createInkeep } from './src/inkeep-provider';

async function testGenerate() {
  const inkeepProvider = createInkeep({
    apiKey: 'sk_UYw7KBoayipw.dxlVehPO6M_RIEPRrJNSOS-lVI0_l5agCXWc5hbHbJk',
    baseURL: 'http://localhost:3003',
  });

  console.log('Starting generateText test...\n');

  const response = await generateText({
    model: inkeepProvider('agent-123'),
    prompt: 'Hello, how are you?',
  });

  console.log('Full response object:', JSON.stringify(response, null, 2));
  console.log('\n--- Text output: ---');
  console.log(response.text);
  console.log('\n--- Usage: ---');
  console.log(response.usage);
  console.log('\n--- Finish reason: ---');
  console.log(response.finishReason);
}

testGenerate().catch(console.error);
