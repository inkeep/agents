import type { Graph } from '@/lib/types/graph-full';
import { GraphItem } from './graph-item';
import { NewGraphItem } from './new-graph-item';

interface GraphListProps {
  tenantId: string;
  projectId: string;
  graphs: Graph[];
}

export async function GraphList({ tenantId, projectId, graphs }: GraphListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
      <NewGraphItem tenantId={tenantId} projectId={projectId} />
      {graphs?.map((graph: Graph) => (
        <GraphItem key={graph.id} {...graph} tenantId={tenantId} projectId={projectId} />
      ))}
    </div>
  );
}
