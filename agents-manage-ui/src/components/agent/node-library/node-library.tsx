'use client';

import { useState, type FC } from 'react';
import { NodeType, nodeTypeMap } from '../configuration/node-types';
import { CopilotTrigger } from './copilot-trigger';
import { NodeItem } from './node-item';
import { cn } from '@/lib/utils';

const secondaryNodes = [
  nodeTypeMap[NodeType.TeamAgentPlaceholder],
  nodeTypeMap[NodeType.ExternalAgentPlaceholder],
  nodeTypeMap[NodeType.MCPPlaceholder],
  nodeTypeMap[NodeType.FunctionTool],
];

export const NodeLibrary: FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleBlur: React.FocusEventHandler<HTMLDivElement> = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsExpanded(false);
    }
  };

  return (
    <div
      className="flex flex-col gap-2 w-40"
      onMouseLeave={() => setIsExpanded(false)}
      onBlur={handleBlur}
      role="group"
    >
      <div
        className="flex flex-col gap-1"
        onMouseEnter={() => setIsExpanded(true)}
        onFocus={() => setIsExpanded(true)}
        role="group"
      >
        <NodeItem node={nodeTypeMap[NodeType.SubAgent]} />
        <div
          className={cn(
            'flex flex-col gap-2',
            'transition-all duration-300',
            isExpanded
              ? 'max-h-100 opacity-100 translate-y-0 pt-1 pointer-events-auto'
              : 'max-h-0 opacity-0 -translate-y-1 pt-0 pointer-events-none'
          )}
        >
          {secondaryNodes.map((node) => (
            <NodeItem key={node.type} node={node} />
          ))}
        </div>
      </div>
      <CopilotTrigger />
    </div>
  );
};
