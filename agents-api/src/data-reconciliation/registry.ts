import type { EntityEffectRegistry } from '@inkeep/agents-core';
import { agentHandlers } from './handlers/agent';
import { contextConfigsHandlers } from './handlers/context-configs';
import { subAgentsHandlers } from './handlers/sub-agents';
import { toolsHandlers } from './handlers/tools';

export function createEntityEffectRegistry(): EntityEffectRegistry {
  return {
    tools: toolsHandlers,
    context_configs: contextConfigsHandlers,
    agent: agentHandlers,
    sub_agents: subAgentsHandlers,
  };
}
