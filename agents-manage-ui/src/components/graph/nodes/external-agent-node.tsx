import { type NodeProps, Position } from '@xyflow/react';
import { BotMessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { NODE_WIDTH } from '@/features/graph/domain/deserialize';
import { useGraphErrors } from '@/hooks/use-graph-errors';
import type { AgentNodeData } from '../configuration/node-types';
import { externalAgentNodeTargetHandleId } from '../configuration/node-types';
import { ErrorIndicator } from '../error-display/error-indicator';
import { BaseNode, BaseNodeContent, BaseNodeHeader, BaseNodeHeaderTitle } from './base-node';
import { Handle } from './handle';
import { NodeTab } from './node-tab';

export function ExternalAgentNode(props: NodeProps & { data: AgentNodeData }) {
  const { data, selected, id } = props;
  const { name, description } = data;
  const { getNodeErrors, hasNodeErrors } = useGraphErrors();

  // Use the agent ID from node data if available, otherwise fall back to React Flow node ID
  const agentId = data.id || id;
  const nodeErrors = getNodeErrors(agentId);
  const hasErrors = hasNodeErrors(agentId);

  return (
    <div className="relative">
      <NodeTab selected={selected}>External</NodeTab>
      <BaseNode
        isSelected={selected}
        className={`rounded-tl-none ${hasErrors ? 'ring-2 ring-red-300 border-red-300' : ''}`}
        style={{ width: NODE_WIDTH }}
      >
        <BaseNodeHeader className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <BotMessageSquare className="size-4 text-muted-foreground" />
            <BaseNodeHeaderTitle>{name || 'External agent'}</BaseNodeHeaderTitle>
          </div>
          <Badge variant="primary" className="text-xs uppercase">
            Agent
          </Badge>
          {hasErrors && (
            <ErrorIndicator errors={nodeErrors} className="absolute -top-2 -right-2 w-6 h-6" />
          )}
        </BaseNodeHeader>
        <BaseNodeContent>
          <div
            className={`text-sm ${description ? ' text-muted-foreground' : 'text-muted-foreground/50'}`}
          >
            {description || 'No description'}
          </div>
        </BaseNodeContent>
        <Handle
          id={externalAgentNodeTargetHandleId}
          type="target"
          position={Position.Top}
          isConnectable
        />
      </BaseNode>
    </div>
  );
}
