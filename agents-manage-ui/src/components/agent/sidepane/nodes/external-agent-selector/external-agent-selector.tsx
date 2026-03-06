import { type Node, useReactFlow } from '@xyflow/react';
import { useParams } from 'next/navigation';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { useExternalAgentsQuery } from '@/lib/query/external-agents';
import type { ExternalAgent } from '@/lib/types/external-agents';
import { NodeType } from '../../../configuration/node-types';
import { EmptyState } from '../empty-state';
import { ExternalAgentItem } from './external-agent-item';
import { ExternalAgentSelectorLoading } from './loading';

export function ExternalAgentSelector({ selectedNode }: { selectedNode: Node }) {
  'use memo';
  const { updateNode } = useReactFlow();
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const { data: externalAgents, isFetching, error } = useExternalAgentsQuery();
  const form = useFullAgentFormContext();

  function handleSelect(data: ExternalAgent) {
    const nodeId = data.id;
    form.setValue(
      `externalAgents.${nodeId}`,
      {
        id: nodeId,
        name: data.name,
        description: data.description,
        baseUrl: data.baseUrl,
      },
      { shouldDirty: true }
    );
    updateNode(selectedNode.id, {
      type: NodeType.ExternalAgent,
      data: {
        id: nodeId,
        relationshipId: null, // Will be set after saving to database
      },
    });
  }

  if (isFetching) {
    return <ExternalAgentSelectorLoading title="Select external agent" />;
  }

  if (error) {
    return (
      <EmptyState
        message="Something went wrong."
        actionText="Create external agent"
        actionHref={`/${tenantId}/projects/${projectId}/external-agents/new`}
      />
    );
  }

  if (!externalAgents.length) {
    return (
      <EmptyState
        message="No external agents found."
        actionText="Create external agent"
        actionHref={`/${tenantId}/projects/${projectId}/external-agents/new`}
      />
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium mb-2">Select external agent</h3>
      <div className="flex flex-col gap-2 min-w-0 min-h-0">
        {externalAgents.map((externalAgent) => (
          <ExternalAgentItem
            key={externalAgent.id}
            externalAgent={externalAgent}
            onClick={handleSelect}
          />
        ))}
      </div>
    </div>
  );
}
