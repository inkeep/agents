import { useFormState } from 'react-hook-form';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';

const EMPTY_OBJ = {};

export function useGroupedAgentErrors() {
  const { control } = useFullAgentFormContext();
  const { errors } = useFormState({ control });
  const {
    subAgents = EMPTY_OBJ,
    functionTools,
    functions,
    externalAgents = EMPTY_OBJ,
    teamAgents = EMPTY_OBJ,
    tools,
    mcpRelations = EMPTY_OBJ,
    defaultSubAgentId,
    ...agentSettings
  } = errors;

  return {
    subAgents,
    functionTools: {
      ...functionTools,
      ...functions,
    },
    externalAgents,
    teamAgents,
    tools: {
      ...tools,
      // clean node id which will not open sidepane
      ...Object.fromEntries(
        Object.entries(mcpRelations).map(([_key, value]) => ['', value as Record<string, unknown>])
      ),
    },
    agentSettings,
    other: defaultSubAgentId ? { defaultSubAgentId } : EMPTY_OBJ,
  };
}
