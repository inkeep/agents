import { type Node, useReactFlow } from '@xyflow/react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchAgents } from '@/lib/api/agent-full-client';
import type { Agent } from '@/lib/types/agent-full';
import { NodeType } from '../../../configuration/node-types';
import { EmptyState } from '../empty-state';
import { TeamAgentSelectorLoading } from './loading';
import { TeamAgentItem } from './team-agent-item';

interface TeamAgentSelectorState {
  agents: Agent[];
  isLoading: boolean;
  error: string | null;
}

const useFetchAvailableAgents = (): TeamAgentSelectorState => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { tenantId, projectId, agentId } = useParams<{
    tenantId: string;
    projectId: string;
    agentId: string;
  }>();

  useEffect(() => {
    const loadAgents = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetchAgents(tenantId, projectId);
        // Filter out the current agent to prevent self-selection
        const filteredAgents = agentId
          ? response.data.filter((agent) => agent.id !== agentId)
          : response.data;
        setAgents(filteredAgents);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load agents';
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    loadAgents();
  }, [tenantId, projectId, agentId]);

  return { agents, isLoading, error };
};

export function TeamAgentSelector({ selectedNode }: { selectedNode: Node }) {
  const { updateNode } = useReactFlow();
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  const { agents, isLoading, error } = useFetchAvailableAgents();

  const handleSelect = (agent: Agent) => {
    updateNode(selectedNode.id, {
      type: NodeType.TeamAgent,
      data: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        relationshipId: null, // Will be set after saving to database
      },
    });
  };

  if (isLoading) {
    return <TeamAgentSelectorLoading title="Select team agent" />;
  }

  if (error) {
    return (
      <EmptyState
        message="Something went wrong."
        actionText="Create agent"
        actionHref={`/${tenantId}/projects/${projectId}/agents/new`}
      />
    );
  }

  if (!agents?.length) {
    return (
      <EmptyState
        message="No agents found."
        actionText="Create agent"
        actionHref={`/${tenantId}/projects/${projectId}/agents/new`}
      />
    );
  }

  return (
    <div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium mb-2">Select team agent</h3>
        <div className="flex flex-col gap-2 min-w-0 min-h-0">
          {agents.map((agent: Agent) => (
            <TeamAgentItem key={agent.id} agent={agent} onClick={handleSelect} />
          ))}
        </div>
      </div>
    </div>
  );
}
