import type { Policy } from '@/lib/types/policies';
import { PolicyItem } from './policy-item';

interface PolicyListProps {
  tenantId: string;
  projectId: string;
  policies: Policy[];
}

export function PolicyList({ tenantId, projectId, policies }: PolicyListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
      {policies.map((policy) => (
        <PolicyItem key={policy.id} {...policy} tenantId={tenantId} projectId={projectId} />
      ))}
    </div>
  );
}
