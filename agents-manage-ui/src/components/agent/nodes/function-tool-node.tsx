import { type NodeProps, Position } from '@xyflow/react';
import { Code } from 'lucide-react';
import { useAgentErrors } from '@/hooks/use-agent-errors';
import { cn } from '@/lib/utils';
import { type FunctionToolNodeData, functionToolNodeHandleId } from '../configuration/node-types';
import { ErrorIndicator } from '../error-display/error-indicator';
import { BaseNode, BaseNodeHeader, BaseNodeHeaderTitle } from './base-node';
import { Handle } from './handle';

export function FunctionToolNode(props: NodeProps & { data: FunctionToolNodeData }) {
  const { data, selected, id } = props;

  const name = String(data.name || 'Function Tool');
  const description = String(data.description || '');

  const { getNodeErrors, hasNodeErrors } = useAgentErrors();

  const functionToolId = data.toolId || data.functionToolId || id;
  const nodeErrors = getNodeErrors(functionToolId);
  const hasErrors = hasNodeErrors(functionToolId);

  return (
    <div className="relative">
      <BaseNode
        isSelected={selected || data.isDelegating}
        className={cn(
          'rounded-4xl min-w-40 max-w-xs',
          hasErrors && 'ring-2 ring-red-300 border-red-300',
          data.isExecuting && 'node-executing'
        )}
      >
        <BaseNodeHeader className="mb-0 py-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0">
                <Code className="w-4 h-4 text-foreground/70" />
              </div>
              <BaseNodeHeaderTitle className="flex-1 truncate">{name}</BaseNodeHeaderTitle>
            </div>
            {description?.trim() ? (
              <p className="text-xs text-muted-foreground line-clamp-2 pl-7">{description}</p>
            ) : null}
          </div>
          {hasErrors && (
            <ErrorIndicator errors={nodeErrors} className="absolute -top-2 -right-2 w-6 h-6" />
          )}
        </BaseNodeHeader>
        <Handle id={functionToolNodeHandleId} type="target" position={Position.Top} isConnectable />
      </BaseNode>
    </div>
  );
}
