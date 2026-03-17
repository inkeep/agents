import { type Node, useReactFlow } from '@xyflow/react';
import type { MouseEvent } from 'react';
import { NodeType, nodeTypeMap } from '@/components/agent/configuration/node-types';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { SelectorItem, SelectorItemIcon } from '../selector-item';

const subAgentNodeTypes = [
  NodeType.SubAgent,
  NodeType.ExternalAgentPlaceholder,
  NodeType.TeamAgentPlaceholder,
] as const;

export function SubAgentSelector({ selectedNode }: { selectedNode: Node }) {
  const form = useFullAgentFormContext();
  const { updateNode } = useReactFlow();

  function handleSelect(event: MouseEvent<HTMLButtonElement>) {
    const nodeType = event.currentTarget.id as (typeof subAgentNodeTypes)[number];
    const nodeId = selectedNode.id;

    if (nodeType === NodeType.SubAgent) {
      const all = new Set(Object.values(form.getValues('subAgents')).map((v) => v.id));

      function findName(name: string, index = 0) {
        const myName = `${name}${index || ''}`;
        if (all.has(myName)) {
          return findName(name, index + 1);
        }
        return myName;
      }

      form.setValue(`subAgents.${nodeId}`, {
        id: '',
        name: findName('sub-agent'),
        models: {
          base: {},
          summarizer: {},
          structuredOutput: {},
        },
        canUse: [],
        dataComponents: [],
        artifactComponents: [],
        stopWhen: {},
      });
    }

    updateNode(nodeId, { type: nodeType });
  }

  return (
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
              onClick={handleSelect}
            />
          );
        })}
      </div>
    </div>
  );
}
