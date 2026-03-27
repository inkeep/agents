import { agent } from '@inkeep/agents-sdk';
import { test4 } from './sub-agents/test4-pv622222';
import { entrypoint } from './sub-agents/entrypoint';
import { testTrigger } from './triggers/test';
import { testTrigger as testTrigger1 } from './triggers/test-1';
import { githubTrigger } from './triggers/github';
import { myScheduledTrigger } from './scheduled-triggers/my-scheduled-trigger';

export const linearTicketFiler = agent({
  id: 'linear-ticket-filer',
  name: 'Linear Ticket Filer',
  defaultSubAgent: test4,
  subAgents: () => [test4, entrypoint],
  triggers: () => [testTrigger, testTrigger1, githubTrigger],
  scheduledTriggers: () => [myScheduledTrigger],
});
