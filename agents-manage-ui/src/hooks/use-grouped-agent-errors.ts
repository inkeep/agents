import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { useFormState } from 'react-hook-form';

const EMPTY_OBJ = {};

export function useGroupedAgentErrors() {
  const { control } = useFullAgentFormContext();
  const { errors } = useFormState({ control });
  const {
    subAgents = EMPTY_OBJ,
    functionTools = EMPTY_OBJ,
    externalAgents = EMPTY_OBJ,
    teamAgents = EMPTY_OBJ,
    tools = EMPTY_OBJ,
    defaultSubAgentId,
    ...agentSettings
  } = errors;

  return {
    subAgents,
    functionTools,
    externalAgents,
    teamAgents,
    tools,
    agentSettings,
    other: defaultSubAgentId ? { defaultSubAgentId } : EMPTY_OBJ,
  };
}
