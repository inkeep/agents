import type { Agent } from '@/lib/types/agent-full';
import { AgentItem } from './agent-item';
import { NewAgentItem } from './new-agent-item';

interface AgentListProps {
  tenantId: string;
  projectId: string;
  agent: Agent[];
  canEdit?: boolean;
}

export async function AgentList({ tenantId, projectId, agent, canEdit = false }: AgentListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
      {canEdit && <NewAgentItem tenantId={tenantId} projectId={projectId} />}
      {agent?.map((agent: Agent) => (
        <AgentItem
          key={agent.id}
          {...agent}
          tenantId={tenantId}
          projectId={projectId}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}
