import { agent } from '@inkeep/agents-sdk';
import { tierOne } from './sub-agents/tier-one';
import { supportContext } from '../context-configs/support-context';
import { githubWebhook } from './triggers/github-webhook';
import { toolSummary } from '../status-components/tool-summary';

export const supportAgent = agent({
  id: 'support-agent',
  name: 'Support Agent',
  defaultSubAgent: tierOne,
  subAgents: () => [tierOne],
  contextConfig: supportContext,
  triggers: () => [githubWebhook],
  statusUpdates: {
    numEvents: 1,
    statusComponents: [toolSummary.config]
  }
});

