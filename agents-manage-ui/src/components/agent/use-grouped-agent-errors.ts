import { useFormState } from 'react-hook-form';
import { isNodeType, NodeType } from '@/components/agent/configuration/node-types';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { findFunctionToolIdsForFunctionId, getNodeGraphKey } from '@/features/agent/domain';
import { useAgentStore } from '@/features/agent/state/use-agent-store';

type ErrorGroup = Record<string, Record<string, unknown> | undefined>;
type GraphKeyEntry = [string, string];

const EMPTY_GROUP: ErrorGroup = {};

function getGraphKeyEntries(key: string, graphKey?: string | null): GraphKeyEntry[] {
  return graphKey ? [[key, graphKey]] : [];
}

export function useGroupedAgentErrors() {
  const form = useFullAgentFormContext();
  const { errors } = useFormState({ control: form.control });
  const nodes = useAgentStore((state) => state.nodes);
  const {
    subAgents = EMPTY_GROUP,
    functionTools,
    functions = EMPTY_GROUP,
    externalAgents = EMPTY_GROUP,
    teamAgents = EMPTY_GROUP,
    tools,
    mcpRelations = EMPTY_GROUP,
    ...agentSettings
  } = errors;
  const functionToolFormData = form.getValues('functionTools');
  const nodeGraphKeysByNodeId = new Map(
    nodes.flatMap((node) => getGraphKeyEntries(node.id, getNodeGraphKey(node)))
  );
  const functionToolGraphKeysByToolId = new Map(
    nodes.flatMap((node) =>
      isNodeType(node, NodeType.FunctionTool)
        ? getGraphKeyEntries(node.data.toolId, getNodeGraphKey(node))
        : []
    )
  );
  const externalAgentGraphKeysById = new Map(
    nodes.flatMap((node) =>
      isNodeType(node, NodeType.ExternalAgent)
        ? getGraphKeyEntries(node.data.externalAgentId, getNodeGraphKey(node))
        : []
    )
  );
  const teamAgentGraphKeysById = new Map(
    nodes.flatMap((node) =>
      isNodeType(node, NodeType.TeamAgent)
        ? getGraphKeyEntries(node.data.teamAgentId, getNodeGraphKey(node))
        : []
    )
  );
  const remapErrorGroup = (
    group: ErrorGroup,
    getGraphKey: (key: string) => string | null | undefined
  ): ErrorGroup =>
    Object.fromEntries(
      Object.entries(group).map(([key, value]) => [getGraphKey(key) ?? '', value])
    );

  const functionErrorsByToolId = Object.fromEntries(
    Object.entries(functions).flatMap(([functionId, value]) => {
      const toolIds = findFunctionToolIdsForFunctionId(functionId, functionToolFormData);

      return toolIds.map((toolId) => [functionToolGraphKeysByToolId.get(toolId) ?? '', value]);
    })
  );

  return {
    subAgents: remapErrorGroup(subAgents, (nodeId) => nodeGraphKeysByNodeId.get(nodeId)),
    functionTools: {
      ...remapErrorGroup(functionTools ?? EMPTY_GROUP, (toolId) =>
        functionToolGraphKeysByToolId.get(toolId)
      ),
      ...functionErrorsByToolId,
    },
    externalAgents: remapErrorGroup(externalAgents, (externalAgentId) =>
      externalAgentGraphKeysById.get(externalAgentId)
    ),
    teamAgents: remapErrorGroup(teamAgents, (teamAgentId) =>
      teamAgentGraphKeysById.get(teamAgentId)
    ),
    tools: {
      ...tools,
      ...remapErrorGroup(mcpRelations, (nodeId) => nodeGraphKeysByNodeId.get(nodeId)),
    },
    agentSettings,
    other: EMPTY_GROUP,
  };
}
