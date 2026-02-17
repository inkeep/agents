import { agent } from '@inkeep/agents-sdk';
import { tierOne } from './sub-agents/tier-one';

export const supportAgent = agent({
  id: 'support-agent',
  name: 'Support Agent',
  defaultSubAgent: tierOne,
  subAgents: () => [tierOne],
  contextConfig: supportContext,
  triggers: () => [githubWebhook]
});
