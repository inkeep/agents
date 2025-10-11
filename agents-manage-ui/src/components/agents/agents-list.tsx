import type { Agent } from '@/lib/types/agent-full';
import { AgentItem } from './agent-item';
import { NewAgentItem } from './new-agent-item';

interface AgentListProps {
  tenantId: string;
  projectId: string;
  agent: Agent[];
}

export async function AgentList({ tenantId, projectId, agent }: AgentListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
      <NewAgentItem tenantId={tenantId} projectId={projectId} />
      {agent?.map((agent: Agent) => (
        <AgentItem key={agent.id} {...agent} tenantId={tenantId} projectId={projectId} />
      ))}
    </div>
  );
}
