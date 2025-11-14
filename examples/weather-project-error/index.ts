import { project } from '@inkeep/agents-sdk';
import { error405WeatherAgent } from './agents/error-405-agent';
import { faultyApiWeatherAgent } from './agents/faulty-api-agent';
import { throwErrorWeatherAgent } from './agents/throw-error-agent';

export const brokenMcpTestProject = project({
  id: 'broken-mcp-test-project',
  name: 'Broken MCP Test Project',
  description: 'Test project with weather agents using broken MCP tools to validate error handling',
  models: {
    base: { model: 'openai/gpt-4o-mini' },
  },
  agents: () => [throwErrorWeatherAgent, error405WeatherAgent, faultyApiWeatherAgent],
});
