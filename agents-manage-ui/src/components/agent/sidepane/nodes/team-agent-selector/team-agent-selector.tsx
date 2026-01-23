import { type Node, useReactFlow } from '@xyflow/react';
import { useParams } from 'next/navigation';
import { useAgentsQuery } from '@/lib/query/agents';
import type { Agent } from '@/lib/types/agent-full';
import { NodeType } from '../../../configuration/node-types';
import { EmptyState } from '../empty-state';
import { TeamAgentSelectorLoading } from './loading';
import { TeamAgentItem } from './team-agent-item';

export function TeamAgentSelector({ selectedNode }: { selectedNode: Node }) {
  'use memo';
  const { updateNode } = useReactFlow();
  const { tenantId, projectId, agentId } = useParams<{
    tenantId: string;
    projectId: string;
    agentId: string;
  }>();
  const { data: agents, isFetching, isError } = useAgentsQuery();
  // Filter out the current agent to prevent self-selection
  const availableAgents = agentId ? agents.filter((agent) => agent.id !== agentId) : agents;

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

  if (isFetching) {
    return <TeamAgentSelectorLoading title="Select team agent" />;
  }

  if (isError) {
    return (
      <EmptyState
        message="Something went wrong."
        actionText="Create agent"
        actionHref={`/${tenantId}/projects/${projectId}/agents/`}
      />
    );
  }

  if (!availableAgents.length) {
    return (
      <EmptyState
        message="No agents found."
        actionText="Create agent"
        actionHref={`/${tenantId}/projects/${projectId}/agents/`}
      />
    );
  }

  return (
    <div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium mb-2">Select team agent</h3>
        <div className="flex flex-col gap-2 min-w-0 min-h-0">
          {availableAgents.map((agent) => (
            <TeamAgentItem key={agent.id} agent={agent} onClick={handleSelect} />
          ))}
        </div>
      </div>
    </div>
  );
}
