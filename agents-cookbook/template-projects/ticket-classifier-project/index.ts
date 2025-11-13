import { project } from '@inkeep/agents-sdk';
import { ticketClassifierAgent } from './agents/ticket-classifier-agent';
import { inkeepFactsTool } from './tools/inkeep-facts';

export const ticketClassifierProject = project({
  id: 'ticket-classifier-project',
  name: 'Datadog Ticket Classifier',
  description: 'Simple ticket classification agent for Datadog Zendesk integration testing.',
  models: {
    base: {
      model: 'openai/gpt-5-2025-08-07',
    },
    structuredOutput: {
      model: 'openai/gpt-5-2025-08-07',
    },
    summarizer: {
      model: 'openai/gpt-5-2025-08-07',
    },
  },
  agents: () => [ticketClassifierAgent],
  tools: () => [inkeepFactsTool],
  dataComponents: () => [],
});
