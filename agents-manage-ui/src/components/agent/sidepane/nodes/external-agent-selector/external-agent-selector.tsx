import { type Node, useReactFlow } from '@xyflow/react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchExternalAgents } from '@/lib/api/external-agents';
import type { ExternalAgent } from '@/lib/types/external-agents';
import { NodeType } from '../../../configuration/node-types';
import { EmptyState } from '../empty-state';
import { ExternalAgentItem } from './external-agent-item';
import { ExternalAgentSelectorLoading } from './loading';

interface ExternalAgentSelectorState {
  externalAgents: ExternalAgent[];
  isLoading: boolean;
  error: string | null;
}

const useFetchAvailableExternalAgents = (): ExternalAgentSelectorState => {
  const [externalAgents, setExternalAgents] = useState<ExternalAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  useEffect(() => {
    const loadExternalAgents = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const agents = await fetchExternalAgents(tenantId, projectId);
        setExternalAgents(agents);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load external agents';
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    loadExternalAgents();
  }, [tenantId, projectId]);

  return { externalAgents, isLoading, error };
};

export function ExternalAgentSelector({ selectedNode }: { selectedNode: Node }) {
  const { updateNode } = useReactFlow();
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  const { externalAgents, isLoading, error } = useFetchAvailableExternalAgents();

  const handleSelect = (externalAgent: ExternalAgent) => {
    updateNode(selectedNode.id, {
      type: NodeType.ExternalAgent,
      data: {
        id: externalAgent.id,
        name: externalAgent.name,
        description: externalAgent.description,
        baseUrl: externalAgent.baseUrl,
        createdAt: externalAgent.createdAt,
        updatedAt: externalAgent.updatedAt,
        credentialReferenceId: externalAgent.credentialReferenceId,
        relationshipId: null, // Will be set after saving to database
        tempHeaders: null,
      },
    });
  };

  if (isLoading) {
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

  if (!externalAgents?.length) {
    return (
      <EmptyState
        message="No external agents found."
        actionText="Create external agent"
        actionHref={`/${tenantId}/projects/${projectId}/external-agents/new`}
      />
    );
  }

  return (
    <div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium mb-2">Select external agent</h3>
        <div className="flex flex-col gap-2 min-w-0 min-h-0">
          {externalAgents.map((externalAgent: ExternalAgent) => (
            <ExternalAgentItem
              key={externalAgent.id}
              externalAgent={externalAgent}
              onClick={handleSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
