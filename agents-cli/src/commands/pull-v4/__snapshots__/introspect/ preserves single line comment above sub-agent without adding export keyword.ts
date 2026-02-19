import { agent, subAgent } from '@inkeep/agents-sdk';
import { supportContext } from '../context-configs/support-context';
import { toolSummary } from '../status-components/tool-summary';
import { githubWebhook } from './triggers/github-webhook';

/**
 * Tier-one routing helper.
 */
// Knowledge Base Q&A Agent
const tierOneCustom = subAgent({
  id: 'tier-one',
  name: 'Tier One'
});

export const supportAgent = agent({
  id: 'support-agent',
  name: 'Support Agent',
  defaultSubAgent: tierOneCustom,
  subAgents: () => [tierOneCustom],
  contextConfig: supportContext,
  triggers: () => [githubWebhook],
  statusUpdates: {
    numEvents: 1,
    statusComponents: [toolSummary.config]
  }
});
