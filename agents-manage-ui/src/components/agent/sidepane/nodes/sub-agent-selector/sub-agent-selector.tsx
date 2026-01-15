import { type Node, useReactFlow } from '@xyflow/react';
import {
  NodeType,
  newNodeDefaults,
  nodeTypeMap,
} from '@/components/agent/configuration/node-types';
import { SelectorItem, SelectorItemIcon } from '../selector-item';

const subAgentNodeTypes = [
  NodeType.SubAgent,
  NodeType.ExternalAgentPlaceholder,
  NodeType.TeamAgentPlaceholder,
] as const;

export function SubAgentSelector({ selectedNode }: { selectedNode: Node }) {
  const { updateNode } = useReactFlow();

  const handleSelect = (nodeType: (typeof subAgentNodeTypes)[number]) => {
    const defaults = newNodeDefaults[nodeType];
    updateNode(selectedNode.id, {
      type: nodeType,
      data: {
        ...defaults,
      },
    });
  };

  return (
    <div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium mb-2">Select agent type</h3>
        <div className="flex flex-col gap-2 min-w-0 min-h-0">
          {subAgentNodeTypes.map((nodeType) => {
            const { name, Icon, description } = nodeTypeMap[nodeType];
            return (
              <SelectorItem
                key={nodeType}
                id={nodeType}
                name={name}
                description={description}
                icon={
                  <SelectorItemIcon>
                    <Icon className="size-4 text-muted-foreground" />
                  </SelectorItemIcon>
                }
                onClick={() => handleSelect(nodeType)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
