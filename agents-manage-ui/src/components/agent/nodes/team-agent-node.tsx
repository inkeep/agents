import { type NodeProps, Position } from '@xyflow/react';
import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { NODE_WIDTH } from '@/features/agent/domain/deserialize';
import { useProcessedErrors } from '@/hooks/use-processed-errors';
import { cn } from '@/lib/utils';
import type { TeamAgentNodeData } from '../configuration/node-types';
import { teamAgentNodeTargetHandleId } from '../configuration/node-types';
import { ErrorIndicator } from '../error-display/error-indicator';
import { BaseNode, BaseNodeContent, BaseNodeHeader, BaseNodeHeaderTitle } from './base-node';
import { Handle } from './handle';
import { NodeTab } from './node-tab';

export function TeamAgentNode({ data, selected }: NodeProps & { data: TeamAgentNodeData }) {
  const { name, description } = data;

  // Use the agent ID from node data if available, otherwise fall back to React Flow node ID
  const processedErrors = useProcessedErrors('teamAgents', data.id);
  const hasErrors = processedErrors.length > 0;

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
            <ErrorIndicator errors={processedErrors} className="absolute -top-2 -right-2 w-6 h-6" />
          )}
        </BaseNodeHeader>
        <BaseNodeContent>
          <div className="text-sm text-muted-foreground">
            {description || <i className="text-muted-foreground/50">No description</i>}
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
