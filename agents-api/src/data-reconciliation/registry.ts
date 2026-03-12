import type { EntityEffectRegistry } from '@inkeep/agents-core';
import { agentHandlers } from './handlers/agent';
import { contextConfigsHandlers } from './handlers/context-configs';
import { scheduledTriggersHandlers } from './handlers/scheduled-triggers';
import { subAgentsHandlers } from './handlers/sub-agents';
import { toolsHandlers } from './handlers/tools';

export function createEntityEffectRegistry(): EntityEffectRegistry {
  return {
    scheduled_triggers: scheduledTriggersHandlers,
    tools: toolsHandlers,
    context_configs: contextConfigsHandlers,
    agent: agentHandlers,
    sub_agents: subAgentsHandlers,
  };
}
