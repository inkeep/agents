'use client';

import { type FC, type FocusEvent, type MouseEvent, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { NodeType, nodeTypeMap } from '../configuration/node-types';
import { CopilotTrigger } from './copilot-trigger';
import { NodeItem } from './node-item';

const nodeTypes = [
  nodeTypeMap[NodeType.TeamAgentPlaceholder],
  nodeTypeMap[NodeType.ExternalAgentPlaceholder],
  nodeTypeMap[NodeType.MCPPlaceholder],
  nodeTypeMap[NodeType.FunctionTool],
];

export const NodeLibrary: FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleBlur = useCallback((event: FocusEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsExpanded(false);
    }
  }, []);

  const handleExpanded = useCallback((event: MouseEvent | FocusEvent) => {
    const isEntering = event.type === 'mouseenter' || event.type === 'focus';
    setIsExpanded(isEntering);
  }, []);

  return (
    <div
      role="group"
      onMouseLeave={handleExpanded}
      onBlur={handleBlur}
      className="flex flex-col gap-2 w-40"
    >
      <div role="group" onMouseEnter={handleExpanded} onFocus={handleExpanded}>
        <NodeItem node={nodeTypeMap[NodeType.SubAgent]} />
        <div
          className={cn(
            'flex flex-col gap-2 transition-all duration-300',
            isExpanded ? 'max-h-100 opacity-100 pt-2' : 'max-h-0 opacity-0 pointer-events-none'
          )}
        >
          {nodeTypes.map((node) => (
            <NodeItem key={node.type} node={node} />
          ))}
        </div>
      </div>
      <CopilotTrigger />
    </div>
  );
};
