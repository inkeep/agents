import { agent, subAgent } from '@inkeep/agents-sdk';

export const llm404Agent = agent({
  id: 'llm-404-agent',
  name: 'LLM Invalid Provider Endpoint',
  description: 'Agent that points to invalid endpoint causing 404 errors',
  models: {
    base: {
      model: 'openai/gpt-4.1-nano',
      providerOptions: {
        baseURL: 'https://api.openai.com/invalid-endpoint',
      },
    },
  },
  defaultSubAgent: subAgent({
    id: 'llm-404-assistant',
    name: 'Invalid Endpoint',
    description: 'Assistant pointing to wrong endpoint',
    prompt: `You are a helpful assistant.`,
  }),
});

