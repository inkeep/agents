import { agent, subAgent } from '@inkeep/agents-sdk';

export const llmTimeoutAgent = agent({
  id: 'llm-timeout-agent',
  name: 'LLM Connection Timeout',
  description: 'Agent that points to non-existent endpoint causing connection timeout',
  models: {
    base: {
      model: 'openai/gpt-4.1-nano',
      providerOptions: {
        baseURL: 'http://10.255.255.1:9999/v1',
      },
    },
  },
  defaultSubAgent: subAgent({
    id: 'llm-timeout-assistant',
    name: 'Connection Timeout',
    description: 'Assistant pointing to unreachable endpoint',
    prompt: `You are a helpful assistant.`,
  }),
});
