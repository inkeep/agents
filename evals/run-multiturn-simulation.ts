import crypto from 'node:crypto';
import { weatherAgent } from '../examples/weather-project/agents/weather-agent';
import {
  createLLMSimulatedUser,
  runMultiturnSimulation,
  type ChatMessage,
  type MultiTurnApp,
} from './multi-turn-simulator';
import type { CapturedEval } from './types';

interface PrettifiedTrace {
  metadata: {
    conversationId: string;
    traceId?: string;
    agentId?: string;
    agentName?: string;
    exportedAt: string;
  };
  timing: {
    startTime: string;
    endTime: string;
    durationMs: number;
  };
  timeline: any[];
  hashes?: Record<string, string>;
}

function hashString(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 12);
}

function formatConversationAsPrettifiedTrace(conversation: any): PrettifiedTrace {
  const stringCounts = new Map<string, number>();
  const stringToHash = new Map<string, string>();

  function countStrings(value: any): void {
    if (typeof value === 'string' && value.length >= 500) {
      stringCounts.set(value, (stringCounts.get(value) || 0) + 1);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        countStrings(item);
      }
    } else if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        countStrings(value[key]);
      }
    }
  }

  function maybeHash(value: any): any {
    if (typeof value !== 'string') {
      if (Array.isArray(value)) {
        return value.map(maybeHash);
      }
      if (value && typeof value === 'object') {
        const result: Record<string, any> = {};
        for (const key of Object.keys(value)) {
          result[key] = maybeHash(value[key]);
        }
        return result;
      }
      return value;
    }

    if (value.length < 500) return value;

    const count = stringCounts.get(value) || 0;
    if (count <= 1) return value;

    if (!stringToHash.has(value)) {
      stringToHash.set(value, hashString(value));
    }

    return `__hash:${stringToHash.get(value)}`;
  }

  const activities = (conversation.activities || []).map((activity: any) => {
    const { id: _id, timestamp: _timestamp, ...rest } = activity;
    return rest;
  });

  for (const activity of activities) {
    countStrings(activity);
  }

  const timeline = activities.map(maybeHash);

  const hashesObject: Record<string, string> = {};
  for (const [content, hash] of stringToHash.entries()) {
    hashesObject[hash] = content;
  }

  return {
    metadata: {
      conversationId: conversation.conversationId,
      traceId: conversation.traceId,
      agentName: conversation.agentName,
      agentId: conversation.agentId,
      exportedAt: new Date().toISOString(),
    },
    timing: {
      startTime: conversation.conversationStartTime || '',
      endTime: conversation.conversationEndTime || '',
      durationMs: conversation.duration,
    },
    timeline,
    hashes: Object.keys(hashesObject).length > 0 ? hashesObject : undefined,
  };
}

async function callAgentAPI(
  conversationId: string,
  messages: ChatMessage[],
  model: string
): Promise<string> {
  const baseURL = 'http://localhost:3003';
  
  const response = await fetch(`${baseURL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-inkeep-tenant-id': 'default',
      'x-inkeep-project-id': 'my-weather-project',
      'x-inkeep-agent-id': 'weather-agent',
    },
    body: JSON.stringify({
      conversationId,
      model,
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat endpoint failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let assistantContent = '';
  let isComplete = false;

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('0:"')) {
          try {
            const jsonStr = line.slice(2, -1).replace(/\\"/g, '"');
            const parsed = JSON.parse(jsonStr);
            
            if (parsed.type === 'text-delta' && parsed.textDelta) {
              assistantContent += parsed.textDelta;
            }
            
            if (parsed.type === 'data-operation' && parsed.data?.type === 'completion') {
              isComplete = true;
              break;
            }
          } catch (e) {
          }
        }
      }
      
      if (isComplete) break;
    }
  }

  return assistantContent;
}

async function runMultiturnAndCaptureForEval(
  initialMessage: string,
  userPersona: string,
  model: string,
  maxTurns: number = 5
): Promise<CapturedEval> {
  console.log('📊 Step 1: Serializing agent definition...\n');
  const agentDefinition = await weatherAgent.toFullAgentDefinition();
  console.log(`✅ Agent serialized: ${agentDefinition.name} (${Object.keys(agentDefinition.subAgents).length} sub-agents)\n`);

  console.log('🎭 Step 2: Setting up multi-turn simulation...\n');
  console.log(`   User Persona: "${userPersona}"`);
  console.log(`   Initial Message: "${initialMessage}"`);
  console.log(`   Model: ${model}`);
  console.log(`   Max Turns: ${maxTurns}\n`);

  const conversationId = `eval-multiturn-${Date.now()}`;
  const messageHistory: ChatMessage[] = [];

  const app: MultiTurnApp = async (message: ChatMessage, context: { threadId: string }) => {
    messageHistory.push(message);
    const assistantContent = await callAgentAPI(context.threadId, messageHistory, model);
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: assistantContent,
    };
    messageHistory.push(assistantMessage);
    return assistantMessage;
  };

  const user = createLLMSimulatedUser({
    system: userPersona,
    model: 'claude-3-5-sonnet-20241022',
    fixedResponses: [
      { role: 'user', content: initialMessage },
    ],
  });

  console.log('🔄 Step 3: Running multi-turn simulation...\n');
  const simulationResult = await runMultiturnSimulation(app, user, {
    maxTurns,
    conversationId,
  });

  console.log(`\n✅ Simulation complete: ${simulationResult.metadata.turns} turns\n`);

  console.log('📋 Step 4: Fetching OTEL trace...\n');
  
  await new Promise(resolve => setTimeout(resolve, 30000));

  const manageUIUrl = 'http://localhost:3000';
  console.log(`   Fetching from: ${manageUIUrl}/api/signoz/conversations/${conversationId}\n`);
  
  let traceResponse;
  try {
    traceResponse = await fetch(`${manageUIUrl}/api/signoz/conversations/${conversationId}`);
  } catch (error) {
    throw new Error(`Failed to connect to Manage UI at ${manageUIUrl}. Is it running? Error: ${error}`);
  }
  
  if (!traceResponse.ok) {
    throw new Error(`Failed to fetch trace: ${traceResponse.status} ${traceResponse.statusText}`);
  }

  const conversationDetail = (await traceResponse.json()) as any;
  console.log(`✅ Trace captured: ${conversationDetail.activities?.length || 0} activities\n`);

  const prettifiedTrace = formatConversationAsPrettifiedTrace(conversationDetail);

  const evalInput: CapturedEval = {
    agentDefinition,
    userMessage: initialMessage,
    trace: prettifiedTrace,
  };

  console.log('💾 Step 5: Packaging eval input...\n');
  return evalInput;
}

async function main() {
  const initialMessage = process.argv[2] || 'What is the weather in San Francisco?';
  const userPersona = process.argv[3] || 'You are a curious user interested in weather information. You ask follow-up questions based on the responses you receive.';
  const model = process.argv[4] || 'claude-sonnet-4-20250514';
  const maxTurns =2;

  console.log('🚀 Running multi-turn simulation and capturing for eval\n');
  console.log('='.repeat(80));
  console.log(`📝 Initial Message: "${initialMessage}"`);
  console.log(`🎭 User Persona: "${userPersona}"`);
  console.log(`🤖 Model: ${model}`);
  console.log(`🔄 Max Turns: ${maxTurns}`);
  console.log('='.repeat(80));
  console.log('\n');

  try {
    const evalInput = await runMultiturnAndCaptureForEval(initialMessage, userPersona, model, maxTurns);

    console.log('📦 MULTI-TURN EVAL INPUT READY:\n');
    console.log(`Initial Message: ${evalInput.userMessage}`);
    console.log(`Timeline Activities: ${evalInput.trace.timeline.length}\n`);

    const modelSlug = model.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const filename = `captured-multiturn-eval-${modelSlug}-${Date.now()}.json`;
    const fs = await import('fs/promises');
    await fs.writeFile(filename, JSON.stringify(evalInput, null, 2));
    console.log(`\n💾 Saved to: ${filename}`);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();

