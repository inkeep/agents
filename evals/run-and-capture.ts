import { weatherAgent } from '../examples/weather-project/agents/weather-agent';

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
}

interface EvalInput {
  agentDefinition: any;
  userMessage: string;
  trace: PrettifiedTrace;
}

function formatConversationAsPrettifiedTrace(conversation: any): PrettifiedTrace {
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
    timeline: (conversation.activities || []).map((activity: any) => {
      const { id: _id, timestamp: _timestamp, ...rest } = activity;
      return rest;
    }),
  };
}

async function runAndCaptureForEval(userMessage: string): Promise<EvalInput> {
  console.log('📊 Step 1: Serializing agent definition...\n');
  const agentDefinition = await weatherAgent.toFullAgentDefinition();
  console.log(`✅ Agent serialized: ${agentDefinition.name} (${Object.keys(agentDefinition.subAgents).length} sub-agents)\n`);

  console.log('💬 Step 2: Sending message to chat endpoint...\n');
  console.log(`   Message: "${userMessage}"\n`);
  const baseURL = 'http://localhost:3003';
  const conversationId = `eval-${Date.now()}`;
  console.log(`   Conversation ID: ${conversationId}\n`);
  
  const response = await fetch(`${baseURL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-inkeep-tenant-id': 'default',
      'x-inkeep-project-id': 'my-weather-project',
      'x-inkeep-agent-id': 'weather-agent',
    },
    body: JSON.stringify({
      conversationId: conversationId,  // Send conversationId in body
      model: 'claude-sonnet-4-20250514',
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat endpoint failed: ${response.status} ${response.statusText}`);
  }

  console.log('✅ Chat endpoint responded, streaming...\n');

  // Parse stream and wait for completion event (same as UI does)
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let isComplete = false;

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('0:"')) {
          // Vercel AI SDK data stream format
          try {
            const jsonStr = line.slice(2, -1).replace(/\\"/g, '"');
            const parsed = JSON.parse(jsonStr);
            
            // Check for completion operation (same as UI does)
            if (parsed.type === 'data-operation' && parsed.data?.type === 'completion') {
              isComplete = true;
              process.stdout.write('✓');
              break;
            }
          } catch (e) {
            // Skip parse errors
          }
        }
        process.stdout.write('.');
      }
      
      if (isComplete) break;
    }
  }

  console.log('\n\n✅ Assistant message complete\n');

  console.log('📋 Step 3: Fetching OTEL trace...\n');
  
  // Wait a bit for traces to be written to SigNoz
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Fetch trace data from the manage UI API endpoint
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

  // Format trace using the same formatter as "Copy Trace" feature
  const prettifiedTrace = formatConversationAsPrettifiedTrace(conversationDetail);

  const evalInput: EvalInput = {
    agentDefinition,
    userMessage,
    trace: prettifiedTrace,
  };

  console.log('💾 Step 4: Packaging eval input...\n');
  return evalInput;
}

async function main() {
  const userMessage = process.argv[2] || 'What is the weather in San Francisco?';

  console.log('🚀 Running agent and capturing for eval\n');
  console.log('=' .repeat(60));
  console.log('\n');

  try {
    const evalInput = await runAndCaptureForEval(userMessage);

    console.log('📦 EVAL INPUT READY:\n');
    console.log(JSON.stringify(evalInput, null, 2));

    // Save to file
    const filename = `evals/captured-eval-${Date.now()}.json`;
    const fs = await import('fs/promises');
    await fs.writeFile(filename, JSON.stringify(evalInput, null, 2));
    console.log(`\n💾 Saved to: ${filename}`);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();

