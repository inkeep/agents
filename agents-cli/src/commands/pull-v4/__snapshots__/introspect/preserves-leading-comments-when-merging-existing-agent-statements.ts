import { agent, subAgent } from '@inkeep/agents-sdk';
import { supportContext } from '../context-configs/support-context';
import { toolSummary } from '../status-components/tool-summary';
import { githubWebhook } from './triggers/github-webhook';

/**
 * Keeps routing instructions for tier one support.
 */
export const tierOneCustom = subAgent({
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
    statusComponents: [toolSummary.config]
  }
});
