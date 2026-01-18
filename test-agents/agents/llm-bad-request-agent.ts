import { agent, subAgent } from '@inkeep/agents-sdk';

export const llmBadRequestAgent = agent({
  id: 'llm-bad-request-agent',
  name: 'LLM Invalid Model',
  description: 'Agent that uses a non-existent model causing 404 errors',
  models: {
    base: {
      model: 'openai/this-model-does-not-exist-and-will-fail',
    },
  },
  defaultSubAgent: subAgent({
    id: 'llm-bad-request-assistant',
    name: 'Invalid Model',
    description: 'Assistant using non-existent model causing errors',
    prompt: `You are a helpful assistant.`,
  }),
});
