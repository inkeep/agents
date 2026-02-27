import { subAgent } from '@inkeep/agents-sdk';
import { activitiesPlannerContext, activitiesPlannerContextHeaders } from '../../context-configs/activities-planner-context';

export const activitiesPlanner = subAgent({
  id: 'activities-planner',
  prompt: `Use ${activitiesPlannerContext.toTemplate("time")} in timezone ${activitiesPlannerContextHeaders.toTemplate("tz")}`,
  name: 'Activities Planner',
});
