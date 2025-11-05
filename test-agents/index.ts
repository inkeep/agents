import { project } from '@inkeep/agents-sdk';
import { badCredentialWeatherAgent } from './agents/bad-credential-403-agent';
import { faultyApiWeatherAgent } from './agents/faulty-api-agent';
import { invalidMcpWeatherAgent } from './agents/invalid-mcp';
import { llmBadRequestAgent } from './agents/llm-bad-request-agent';
import { llm404Agent } from './agents/llm-invalid-endpoint';
import { llmTimeoutAgent } from './agents/llm-timeout-agent';
import { slowToolWeatherAgent } from './agents/slow-tool-agent';

export const testAgentsProject = project({
  id: "test-agents",
  name: 'Test Agents',
  description:
    'Test project with agents that simulate various error scenarios',
  models: {
    base: { model: 'openai/gpt-4o-mini' },
  },
  agents: () => [
    faultyApiWeatherAgent,
    invalidMcpWeatherAgent,
    badCredentialWeatherAgent,
    slowToolWeatherAgent,
    llmTimeoutAgent,
    llm404Agent,
    llmBadRequestAgent,
  ],
});
