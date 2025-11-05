import type { Dataset } from '@/lib/api/evaluations-client';
import { DatasetItem } from './dataset-item';
import { NewDatasetItem } from './new-dataset-item';

interface DatasetsListProps {
  tenantId: string;
  datasets: Dataset[];
}

export function DatasetsList({ tenantId, datasets }: DatasetsListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
      <NewDatasetItem tenantId={tenantId} />
      {datasets?.map((dataset: Dataset) => (
        <DatasetItem key={dataset.id} {...dataset} tenantId={tenantId} />
      ))}
    </div>
  );
}

