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
    mcpRelations,
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
      ...mcpRelations,
    },
    agentSettings,
    other: defaultSubAgentId ? { defaultSubAgentId } : EMPTY_OBJ,
  };
}
