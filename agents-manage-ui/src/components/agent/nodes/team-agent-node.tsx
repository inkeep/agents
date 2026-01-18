import { type NodeProps, Position } from '@xyflow/react';
import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { NODE_WIDTH } from '@/features/agent/domain/deserialize';
import { useAgentErrors } from '@/hooks/use-agent-errors';
import { cn } from '@/lib/utils';
import type { TeamAgentNodeData } from '../configuration/node-types';
import { teamAgentNodeTargetHandleId } from '../configuration/node-types';
import { ErrorIndicator } from '../error-display/error-indicator';
import { BaseNode, BaseNodeContent, BaseNodeHeader, BaseNodeHeaderTitle } from './base-node';
import { Handle } from './handle';
import { NodeTab } from './node-tab';

export function TeamAgentNode(props: NodeProps & { data: TeamAgentNodeData }) {
  const { data, selected, id } = props;
  const { name, description } = data;
  const { getNodeErrors, hasNodeErrors } = useAgentErrors();

  // Use the agent ID from node data if available, otherwise fall back to React Flow node ID
  const subAgentId = data.id || id;
  const nodeErrors = getNodeErrors(subAgentId);
  const hasErrors = hasNodeErrors(subAgentId);

  return (
    <div className="relative">
      <NodeTab isSelected={selected}>Team</NodeTab>
      <BaseNode
        isSelected={selected}
        className={cn('rounded-tl-none', hasErrors && 'ring-2 ring-red-300 border-red-300')}
        style={{ width: NODE_WIDTH }}
      >
        <BaseNodeHeader className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="size-4 text-muted-foreground" />
            <BaseNodeHeaderTitle>{name || 'Team Agent'}</BaseNodeHeaderTitle>
          </div>
          <Badge variant="primary" className="text-xs uppercase">
            Team Agent
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
          id={teamAgentNodeTargetHandleId}
          type="target"
          position={Position.Top}
          isConnectable
        />
      </BaseNode>
    </div>
  );
}
