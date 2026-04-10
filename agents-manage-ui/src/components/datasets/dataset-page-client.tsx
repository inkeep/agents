'use client';

import { DatasetAgentPicker } from '@/components/datasets/dataset-agent-picker';
import { DatasetTabs } from '@/components/datasets/dataset-tabs';
import type { DatasetItem } from '@/lib/api/dataset-items';

interface DatasetPageClientProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  items: DatasetItem[];
}

export function DatasetPageClient({
  tenantId,
  projectId,
  datasetId,
  items,
}: DatasetPageClientProps) {
  return (
    <div className="space-y-6">
      <DatasetAgentPicker tenantId={tenantId} projectId={projectId} datasetId={datasetId} />
      <DatasetTabs tenantId={tenantId} projectId={projectId} datasetId={datasetId} items={items} />
    </div>
  );
}
