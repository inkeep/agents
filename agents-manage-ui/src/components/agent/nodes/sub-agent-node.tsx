import { type NodeProps, Position } from '@xyflow/react';
import { Bot, Component, Library, type LucideIcon } from 'lucide-react';
import { TruncateBadge } from '@/components/agent/nodes/mcp-node';
import { AnthropicIcon } from '@/components/icons/anthropic';
import { GoogleIcon } from '@/components/icons/google';
import { OpenAIIcon } from '@/components/icons/openai';
import { Badge } from '@/components/ui/badge';
import { STATIC_LABELS } from '@/constants/theme';
import { useProject } from '@/contexts/project';
import { NODE_WIDTH } from '@/features/agent/domain/deserialize';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import { useAgentErrors } from '@/hooks/use-agent-errors';
import { useArtifactComponentsQuery } from '@/lib/query/artifact-components';
import { useDataComponentsQuery } from '@/lib/query/data-components';
import { cn, createLookup } from '@/lib/utils';
import type { AgentNodeData } from '../configuration/node-types';
import { agentNodeSourceHandleId, agentNodeTargetHandleId } from '../configuration/node-types';
import { ErrorIndicator } from '../error-display/error-indicator';
import { BaseNode, BaseNodeContent, BaseNodeHeader, BaseNodeHeaderTitle } from './base-node';
import { Handle } from './handle';
import { NodeTab } from './node-tab';

const ListSection = ({
  title,
  items,
  Icon,
}: {
  title: string;
  items: string[];
  Icon: LucideIcon;
}) => {
  return (
    <div className="flex flex-col gap-3 pt-2">
      <div className="flex items-center justify-start gap-2">
        <Icon className="size-3 text-xs text-muted-foreground" />
        <div className="text-xs uppercase font-mono text-muted-foreground">{title}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {items?.map((name) => (
          <TruncateBadge key={name}>{name}</TruncateBadge>
        ))}
      </div>
    </div>
  );
};

export function SubAgentNode({ data, selected, id }: NodeProps & { data: AgentNodeData }) {
  'use memo';
  const { name, isDefault, description, status } = data;
  const { data: artifactComponents } = useArtifactComponentsQuery();

  const agentModel = useAgentStore((state) => state.metadata.models);
  const { project } = useProject();
  const projectModel = project.models;
  const modelName = (data.models ?? agentModel ?? projectModel).base?.model ?? '';

  const { data: dataComponents } = useDataComponentsQuery();
  const dataComponentsById = createLookup(dataComponents);
  const artifactComponentsById = createLookup(artifactComponents);
  const { getNodeErrors, hasNodeErrors } = useAgentErrors();

  // Use the agent ID from node data if available, otherwise fall back to React Flow node ID
  const subAgentId = data.id || id;
  const nodeErrors = getNodeErrors(subAgentId);
  const hasErrors = hasNodeErrors(subAgentId);

  const dataComponentNames =
    data.dataComponents?.map((id) => dataComponentsById[id]?.name).filter(Boolean) || [];
  const artifactComponentNames =
    data.artifactComponents?.map((id) => artifactComponentsById[id]?.name).filter(Boolean) || [];
  const isDelegating = status === 'delegating';
  const isInvertedDelegating = status === 'inverted-delegating';
  const isExecuting = status === 'executing';

  const [modelSlug] = modelName.split('/', 1);

  const ModelIcon = {
    openai: OpenAIIcon,
    anthropic: AnthropicIcon,
    google: GoogleIcon,
  }[modelSlug];

  return (
    <div className="relative">
      {isDefault && <NodeTab isSelected={selected || isDelegating}>Default</NodeTab>}
      <BaseNode
        isSelected={selected || isDelegating}
        className={cn(
          isDefault && 'rounded-tl-none',
          hasErrors && 'ring-2 ring-red-300 border-red-300',
          isExecuting && 'node-executing',
          isInvertedDelegating && 'node-delegating-inverted'
        )}
        style={{ width: NODE_WIDTH }}
      >
        <BaseNodeHeader className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Bot className="size-4 text-muted-foreground" />
            <BaseNodeHeaderTitle>{name || 'Sub Agent'}</BaseNodeHeaderTitle>
          </div>
          <Badge variant="primary" className="text-xs uppercase">
            Sub Agent
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
          <Badge className="text-xs max-w-full" variant="code">
            {ModelIcon && <ModelIcon className="size-3 shrink-0" />}
            <span className="truncate">{modelName}</span> {!data.models && '(inherited)'}
          </Badge>
          {dataComponentNames?.length > 0 && (
            <ListSection
              title={STATIC_LABELS.components}
              items={dataComponentNames}
              Icon={Component}
            />
          )}
          {artifactComponentNames?.length > 0 && (
            <ListSection
              title={STATIC_LABELS.artifacts}
              items={artifactComponentNames}
              Icon={Library}
            />
          )}
        </BaseNodeContent>
        <Handle id={agentNodeTargetHandleId} type="source" position={Position.Top} isConnectable />
        <Handle
          id={agentNodeSourceHandleId}
          type="source"
          position={Position.Bottom}
          isConnectable
        />
      </BaseNode>
    </div>
  );
}
