import { type NodeProps, Position } from '@xyflow/react';
import { Code, Shield } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProcessedErrors } from '@/hooks/use-processed-errors';
import { cn } from '@/lib/utils';
import { toolPoliciesNeedApproval } from '@/lib/utils/tool-policies';
import { type FunctionToolNodeData, functionToolNodeHandleId } from '../configuration/node-types';
import { ErrorIndicator } from '../error-display/error-indicator';
import { BaseNode, BaseNodeHeader, BaseNodeHeaderTitle } from './base-node';
import { Handle } from './handle';

export function FunctionToolNode({ data, selected }: NodeProps & { data: FunctionToolNodeData }) {
  const { name = 'Function Tool', description } = data;

  const { getNodeErrors, hasNodeErrors } = useAgentErrors();

  const isDelegating = data.status === 'delegating';
  const isInvertedDelegating = data.status === 'inverted-delegating';
  const isExecuting = data.status === 'executing';
  const needsApproval = toolPoliciesNeedApproval(data.tempToolPolicies);
  return (
    <div className="relative">
      <BaseNode
        isSelected={selected || isDelegating}
        className={cn(
          'rounded-4xl min-w-40 max-w-xs',
          hasErrors && 'ring-2 ring-red-300 border-red-300',
          isExecuting && 'node-executing',
          isInvertedDelegating && 'node-delegating-inverted'
        )}
      >
        <BaseNodeHeader className="mb-0 py-3">
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded flex items-center justify-center shrink-0">
                <Code className="w-4 h-4 text-foreground/70" />
              </div>
              <BaseNodeHeaderTitle className="flex-1 truncate">{name}</BaseNodeHeaderTitle>
              {needsApproval && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground"
                      title="Requires approval"
                    >
                      <Shield className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Requires approval</TooltipContent>
                </Tooltip>
              )}
            </div>
            {description && (
              <p className="text-xs text-muted-foreground line-clamp-2 pl-7">{description}</p>
            )}
          </div>
          {hasErrors && (
            <ErrorIndicator errors={processedErrors} className="absolute -top-2 -right-2 w-6 h-6" />
          )}
        </BaseNodeHeader>
        <Handle id={functionToolNodeHandleId} type="target" position={Position.Top} isConnectable />
      </BaseNode>
    </div>
  );
}
