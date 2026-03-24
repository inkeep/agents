import { agent } from '@inkeep/agents-sdk';
import { tierOne } from './sub-agents/tier-one';
import { supportContext } from '../context-configs/support-context';
import { githubWebhookTrigger } from './triggers/git-hub-webhook';
import { toolSummary } from '../status-components/tool_summary';

export const supportAgent = agent({
  id: 'support-agent',
  name: 'Support Agent',
  defaultSubAgent: tierOne,
  subAgents: () => [tierOne],
  contextConfig: supportContext,
  triggers: () => [githubWebhookTrigger],
  statusUpdates: {
    numEvents: 1,
    statusComponents: [toolSummary.config],
  },
});
