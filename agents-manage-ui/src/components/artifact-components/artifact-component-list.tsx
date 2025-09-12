import type { ArtifactComponent } from '@/lib/api/artifact-components';
import { ArtifactComponentItem } from './artifact-component-item';

interface ArtifactComponentsListProps {
  tenantId: string;
  projectId: string;
  artifacts: ArtifactComponent[];
}

export async function ArtifactComponentsList({
  tenantId,
  projectId,
  artifacts,
}: ArtifactComponentsListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
      {artifacts?.map((artifact: ArtifactComponent) => (
        <ArtifactComponentItem
          key={artifact.id}
          {...artifact}
          tenantId={tenantId}
          projectId={projectId}
        />
      ))}
    </div>
  );
}
