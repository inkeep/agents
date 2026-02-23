import { agent } from '@inkeep/agents-sdk';
import { activitiesPlanner } from './sub-agents/activities-planner';
import { activitiesPlannerContext, activitiesPlannerContextHeaders } from '../context-configs/activities-planner-context';

export const activitiesPlannerAgent = agent({
  id: 'activities-planner-agent',
  name: 'Activities Planner Agent',
  prompt: `Current time: ${activitiesPlannerContext.toTemplate("time")} (timezone ${activitiesPlannerContextHeaders.toTemplate("tz")})`,
  defaultSubAgent: activitiesPlanner,
  subAgents: () => [activitiesPlanner],
  contextConfig: activitiesPlannerContext,
});
