// Import builders from management-api

// Import context functions from core
import { contextConfig, createRequestSchema } from '@inkeep/agents-core';
import { agent, agentGraph } from '@inkeep/agents-sdk';
import { z } from 'zod';

/**
 * Simple Context Test Graph
 *
 * Tests that context is properly passed to agents by embedding
 * a name from the context into the agent's instructions.
 *
 * To test:
 * 1. Push this graph: inkeep push examples/simple-context-graph.ts
 * 2. Start chat: inkeep chat simple-context-graph
 * 3. Ask: "What is your name?" or "Who are you?"
 */

// Main agent that will receive context in its instructions
const contextAwareAgent = agent({
  id: 'context-aware-agent',
  name: 'Context Aware Agent',
  description: 'An AI assistant with a specific identity',
  prompt: `You are an AI assistant with a specific identity.
  
  Your name is: {{requestContext.headers.username}}
  
  If someone asks "What is your name?", respond with your name.
  
  Be friendly and helpful in all interactions.`,
});

const requestSchema = createRequestSchema({
  headers: z
    .object({
      username: z.string(),
    })
    .loose(),
});

const testContextConfig = contextConfig({
  id: 'simple-context-config',
  name: 'Simple Context Test Config',
  description: 'Tests context resolution by embedding context values into agent instructions',
  requestContextSchema: requestSchema,
});

// Create and export the graph with context configuration
export const graph = agentGraph({
  id: 'simple-context-graph',
  name: 'Simple Context Test Graph',
  description: 'Tests context resolution by embedding context values into agent instructions',
  defaultAgent: contextAwareAgent,
  agents: () => [contextAwareAgent],
  contextConfig: testContextConfig,
});

/**
 * Test Questions:
 *
 * 1. "What is your name?"
 *    - Should respond with TestBot-[tenantId]
 *
 * 2. "Who are you?"
 *    - Should describe itself with name and role
 *
 * 3. "What is your role?"
 *    - Should say "Context Testing Assistant"
 *
 * 4. "Where are you located?"
 *    - Should show tenant and session info
 *
 * This tests that:
 * - Context is resolved in the Execution API
 * - Context values are properly embedded into agent instructions
 * - The {{name}}, {{role}}, and {{location}} placeholders are replaced
 */
