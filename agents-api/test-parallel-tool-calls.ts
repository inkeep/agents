#!/usr/bin/env tsx

/**
 * Script to test if the Vercel AI SDK supports parallel tool execution
 */

import { anthropic } from '@ai-sdk/anthropic';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is required');
  console.error('Please set it in your environment or .env file');
  process.exit(1);
}

// Use inputSchema like the actual codebase does
const slowTool1 = tool({
  description: 'A slow tool that takes 2 seconds',
  inputSchema: z.object({
    message: z.string(),
  }),
  execute: async (input: { message: string }) => {
    const start = Date.now();
    console.log(`[${new Date().toISOString()}] Tool 1 started: "${input.message}"`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] Tool 1 done in ${duration}ms`);
    return `Tool1 result for: ${input.message}`;
  },
});

const slowTool2 = tool({
  description: 'Another slow tool that takes 2 seconds',
  inputSchema: z.object({
    message: z.string(),
  }),
  execute: async (input: { message: string }) => {
    const start = Date.now();
    console.log(`[${new Date().toISOString()}] Tool 2 started: "${input.message}"`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] Tool 2 done in ${duration}ms`);
    return `Tool2 result for: ${input.message}`;
  },
});

const slowTool3 = tool({
  description: 'A third slow tool that takes 2 seconds',
  inputSchema: z.object({
    message: z.string(),
  }),
  execute: async (input: { message: string }) => {
    const start = Date.now();
    console.log(`[${new Date().toISOString()}] Tool 3 started: "${input.message}"`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] Tool 3 done in ${duration}ms`);
    return `Tool3 result for: ${input.message}`;
  },
});

async function testParallelToolExecution() {
  console.log('\n=== Testing Parallel Tool Execution ===\n');
  console.log('Asking AI to call all 3 slow tools (each takes 2 seconds)');
  console.log('PARALLEL execution: ~2-3 seconds total');
  console.log('SEQUENTIAL execution: ~6+ seconds total\n');

  const overallStart = Date.now();

  try {
    const result = await generateText({
      model: anthropic('claude-3-haiku-20240307', {
        apiKey: ANTHROPIC_API_KEY,
      }),
      prompt:
        'Call slowTool1, slowTool2, and slowTool3 each with the message "test". You must call all three tools.',
      tools: {
        slowTool1,
        slowTool2,
        slowTool3,
      },
      maxSteps: 3,
    });

    const totalDuration = Date.now() - overallStart;

    console.log('\n=== Results ===\n');
    console.log('Response:', result.text);
    console.log(`\nTotal time: ${totalDuration}ms`);
    console.log(`Steps: ${result.steps?.length || 0}`);

    if (result.steps) {
      result.steps.forEach((step: any, i: number) => {
        console.log(`\nStep ${i + 1}:`);
        if ('toolCalls' in step && step.toolCalls) {
          console.log(`  Tool calls: ${step.toolCalls.length}`);
          step.toolCalls.forEach((tc: any) => {
            console.log(`    - ${tc.toolName}(${JSON.stringify(tc.args)})`);
          });
        }
      });
    }

    console.log('\n=== Conclusion ===\n');
    if (totalDuration < 4000) {
      console.log('✅ PARALLEL EXECUTION CONFIRMED');
      console.log(`   All tools completed in ${totalDuration}ms (< 4 seconds)`);
      console.log('   This proves tools executed in parallel!');
    } else if (totalDuration > 5500) {
      console.log('❌ SEQUENTIAL EXECUTION DETECTED');
      console.log(`   Tools took ${totalDuration}ms (> 5.5 seconds)`);
      console.log('   This suggests sequential execution');
    } else {
      console.log('⚠️  UNCLEAR - middle range');
      console.log(`   Execution took ${totalDuration}ms`);
    }
  } catch (error) {
    console.error('\nError during test:', error);
    throw error;
  }
}

testParallelToolExecution()
  .then(() => {
    console.log('\n✅ Test completed\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed');
    process.exit(1);
  });
