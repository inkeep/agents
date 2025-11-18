import type { Dataset } from '@/lib/api/datasets';
import { DatasetItem } from './dataset-item';
import { NewDatasetItem } from './new-dataset-item';

interface DatasetsListProps {
  tenantId: string;
  projectId: string;
  datasets: Dataset[];
}

export async function DatasetsList({ tenantId, projectId, datasets }: DatasetsListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
      <NewDatasetItem tenantId={tenantId} projectId={projectId} />
      {datasets?.map((dataset: Dataset) => (
        <DatasetItem key={dataset.id} {...dataset} tenantId={tenantId} projectId={projectId} />
      ))}
    </div>
  );
}
