import { agent, subAgent } from '@inkeep/agents-sdk';
import { supportContext } from '../context-configs/support-context';
import { githubWebhook } from './triggers/github-webhook';
import { toolSummary } from '../status-components/tool-summary';

/**
 * Keeps routing instructions for tier one support.
 */
const tierOneCustom = subAgent({
  id: 'tier-one',
  name: 'Tier One'
});

/**
 * Keeps top-level documentation for this agent.
 */
export const supportAgent = agent({
  id: 'support-agent',
  name: 'Support Agent',
  defaultSubAgent: tierOneCustom,
  subAgents: () => [tierOneCustom],
  contextConfig: supportContext,
  triggers: () => [githubWebhook],
  statusUpdates: {
    numEvents: 1,
    statusComponents: [toolSummary.config],
  }
});
