import { type NodeProps, Position } from '@xyflow/react';
import { Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { NODE_WIDTH } from '@/features/agent/domain/deserialize';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import { useAgentErrors } from '@/hooks/use-agent-errors';
import { cn } from '@/lib/utils';
import type { ExternalAgentNodeData } from '../configuration/node-types';
import { externalAgentNodeTargetHandleId } from '../configuration/node-types';
import { ErrorIndicator } from '../error-display/error-indicator';
import { BaseNode, BaseNodeContent, BaseNodeHeader, BaseNodeHeaderTitle } from './base-node';
import { Handle } from './handle';
import { NodeTab } from './node-tab';

export function ExternalAgentNode(props: NodeProps & { data: ExternalAgentNodeData }) {
  const { data, selected, id } = props;
<<<<<<< HEAD
  const { name, description, isExecuting } = data;
  const { externalAgentLookup, subAgentExternalAgentConfigLookup, edges } = useAgentStore(
    (state) => ({
      externalAgentLookup: state.externalAgentLookup,
      subAgentExternalAgentConfigLookup: state.subAgentExternalAgentConfigLookup,
      edges: state.edges,
    })
  );
=======
  const { name, description, isExecuting } = data;
>>>>>>> 05de9ca6 (address feedback)
  const { getNodeErrors, hasNodeErrors } = useAgentErrors();

  // Use the agent ID from node data if available, otherwise fall back to React Flow node ID
  const subAgentId = data.id || id;
  const nodeErrors = getNodeErrors(subAgentId);
  const hasErrors = hasNodeErrors(subAgentId);

  return (
    <div className="relative">
      <NodeTab isSelected={selected}>External</NodeTab>
      <BaseNode
        isSelected={selected || data.isDelegating}
        className={cn(
          'rounded-tl-none',
          hasErrors && 'ring-2 ring-red-300 border-red-300',
          isExecuting && 'node-executing'
        )}
        style={{ width: NODE_WIDTH }}
      >
        <BaseNodeHeader className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Globe className="size-4 text-muted-foreground" />
            <BaseNodeHeaderTitle>{name || 'External Agent'}</BaseNodeHeaderTitle>
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
