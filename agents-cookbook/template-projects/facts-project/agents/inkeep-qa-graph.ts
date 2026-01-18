import { agent } from '@inkeep/agents-sdk';
import { inkeepQaContext } from '../context-configs/inkeep-qa-context';
import { qa } from './sub-agents/qa';

export const inkeepQaGraph = agent({
  id: 'inkeep-qa-graph',
  name: 'Inkeep QA Graph',
  description: 'Customer Support Graph with Inkeep Facts',
  prompt: `You are a customer support agent for ${inkeepQaContext.toTemplate('projectDescription.chatSubjectName')}. You only speak to customers and do not speak to members of the team. You are the team, you must always respond to the customer's question from the perspective of the team.`,
  defaultSubAgent: qa,
  subAgents: () => [qa],
  contextConfig: inkeepQaContext,
  statusUpdates: {
    numEvents: 1,
    timeInSeconds: 1,
  },
});
