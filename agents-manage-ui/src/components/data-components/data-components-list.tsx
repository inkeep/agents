import type { DataComponent } from '@/lib/api/data-components';
import { DataComponentItem } from './data-component-item';

interface DataComponentsListProps {
  tenantId: string;
  projectId: string;
  dataComponents: DataComponent[];
}

export async function DataComponentsList({
  tenantId,
  projectId,
  dataComponents,
}: DataComponentsListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
      {dataComponents?.map((dataComponent: DataComponent) => (
        <DataComponentItem
          key={dataComponent.id}
          {...dataComponent}
          tenantId={tenantId}
          projectId={projectId}
        />
      ))}
    </div>
  );
}
