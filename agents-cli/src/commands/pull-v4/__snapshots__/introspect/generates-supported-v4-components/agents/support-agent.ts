import { agent } from '@inkeep/agents-sdk';

export const supportAgent = agent({
  id: 'support-agent',
  name: 'Support Agent',
  defaultSubAgent: tierOne,
  subAgents: () => [tierOne],
  contextConfig: supportContext,
  triggers: () => [githubWebhook],
});
