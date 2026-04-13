import { project } from '@inkeep/agents-sdk';
import { improvementOrchestrator } from './agents/improvement-orchestrator';
import { inkeepManagementTools } from './tools/inkeepManagementTools';

export const improvementProject = project({
  id: 'improvement-agent',
  name: 'Improvement Agent',
  description:
    'System agent that automates the feedback-to-improvement cycle: analyze feedback, propose changes on a branch, validate with evals, and surface for human review.',
  models: {
    base: {
      model: 'anthropic/claude-sonnet-4-5',
    },
  },
  agents: () => [improvementOrchestrator],
  tools: () => [inkeepManagementTools],
});
