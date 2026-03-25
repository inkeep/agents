import { useFormState } from 'react-hook-form';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { findFunctionToolIdsForFunctionId } from '@/features/agent/domain';

type ErrorGroup = Record<string, Record<string, unknown> | undefined>;

const EMPTY_GROUP: ErrorGroup = {};

export function useGroupedAgentErrors() {
  const form = useFullAgentFormContext();
  const { errors } = useFormState({ control: form.control });
  const {
    subAgents = EMPTY_GROUP,
    functionTools,
    functions = EMPTY_GROUP,
    externalAgents = EMPTY_GROUP,
    teamAgents = EMPTY_GROUP,
    tools,
    mcpRelations = EMPTY_GROUP,
    defaultSubAgentNodeId,
    ...agentSettings
  } = errors;
  const functionToolFormData = form.getValues('functionTools');

  const functionErrorsByToolId = Object.fromEntries(
    Object.entries(functions).flatMap(([functionId, value]) => {
      const toolIds = findFunctionToolIdsForFunctionId(functionId, functionToolFormData);

      return toolIds.map((toolId) => [toolId, value]);
    })
  );

  return {
    subAgents,
    functionTools: {
      ...functionTools,
      ...functionErrorsByToolId,
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
    other: defaultSubAgentNodeId ? { defaultSubAgentNodeId } : EMPTY_GROUP,
  };
}
