import { useFormState, useWatch } from 'react-hook-form';
import type { Node } from '@xyflow/react';
import { isNodeType, NodeType } from '@/components/agent/configuration/node-types';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { findFunctionToolIdsForFunctionId, getNodeGraphKey } from '@/features/agent/domain';
import { useAgentStore } from '@/features/agent/state/use-agent-store';

type ErrorGroup = Record<string, Record<string, unknown> | undefined>;
type GraphKeyEntry = [string, string];

const EMPTY_GROUP: ErrorGroup = {};

function getGraphKeyEntries(key: string, node: Node): GraphKeyEntry[] {
  const graphKey = getNodeGraphKey(node);
  return graphKey ? [[key, graphKey]] : [];
}

function useErrors(control: ReturnType<typeof useFullAgentFormContext>['control']) {
  'use no memo';

  // RHF field errors come from proxy-backed formState. Read them inside a no-memo boundary.
  const { errors } = useFormState({ control });
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
  return {
    subAgents,
    functionTools,
    functions,
    externalAgents,
    teamAgents,
    tools,
    mcpRelations,
    defaultSubAgentNodeId,
    agentSettings,
  };
}

export function useGroupedAgentErrors() {
  const { control } = useFullAgentFormContext();
  const nodes = useAgentStore((state) => state.nodes);
  const {
    subAgents,
    functionTools,
    functions,
    externalAgents,
    teamAgents,
    tools,
    mcpRelations,
    defaultSubAgentNodeId,
    agentSettings,
  } = useErrors(control);

  const functionToolFormData = useWatch({ control, name: 'functionTools' });
  const nodeGraphKeysByNodeId = new Map(nodes.flatMap((node) => getGraphKeyEntries(node.id, node)));
  const functionToolGraphKeysByToolId = new Map(
    nodes.flatMap((node) =>
      isNodeType(node, NodeType.FunctionTool) ? getGraphKeyEntries(node.data.toolId, node) : []
    )
  );
  const externalAgentGraphKeysById = new Map(
    nodes.flatMap((node) =>
      isNodeType(node, NodeType.ExternalAgent)
        ? getGraphKeyEntries(node.data.externalAgentId, node)
        : []
    )
  );
  const teamAgentGraphKeysById = new Map(
    nodes.flatMap((node) =>
      isNodeType(node, NodeType.TeamAgent) ? getGraphKeyEntries(node.data.teamAgentId, node) : []
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

  const firstSubAgentNode = nodes.find((node) => isNodeType(node, NodeType.SubAgent));
  const firstSubAgentKey = firstSubAgentNode ? (getNodeGraphKey(firstSubAgentNode) ?? '') : '';
  const defaultSubAgentErrors: ErrorGroup = defaultSubAgentNodeId
    ? { [firstSubAgentKey]: { defaultSubAgentNodeId } }
    : EMPTY_GROUP;

  return {
    subAgents: {
      ...remapErrorGroup(subAgents, (nodeId) => nodeGraphKeysByNodeId.get(nodeId)),
      ...defaultSubAgentErrors,
    },
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
  };
}
