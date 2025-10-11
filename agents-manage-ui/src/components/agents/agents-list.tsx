import type { Agent } from '@/lib/types/agent-full';
import { GraphItem } from './agent-item';
import { NewGraphItem } from './new-agent-item';

interface GraphListProps {
  tenantId: string;
  projectId: string;
  agent: Agent[];
}

export async function GraphList({ tenantId, projectId, agent }: GraphListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
      <NewGraphItem tenantId={tenantId} projectId={projectId} />
      {agent?.map((agent: Agent) => (
        <GraphItem key={agent.id} {...agent} tenantId={tenantId} projectId={projectId} />
      ))}
    </div>
  );
}
