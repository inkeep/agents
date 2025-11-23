import { agent } from '@inkeep/agents-sdk';
import { companyResearch } from './sub-agents/company-research';
import { meetingFinder } from './sub-agents/meeting-finder';
import { meetingPrepCoordinator } from './sub-agents/meeting-prep-coordinator';

export const meetingAssistant = agent({
  id: 'meeting-prep-agent',
  name: 'Meeting prep agent',
  defaultSubAgent: meetingPrepCoordinator,
  subAgents: () => [
    companyResearch,
    meetingFinder,
    meetingPrepCoordinator
  ]
});
