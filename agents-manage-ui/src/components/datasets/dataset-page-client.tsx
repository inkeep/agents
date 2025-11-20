'use client';

import { useState } from 'react';
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
  const [activeTab, setActiveTab] = useState('items');

  return (
    <DatasetTabs
      tenantId={tenantId}
      projectId={projectId}
      datasetId={datasetId}
      items={items}
      defaultTab={activeTab}
      onTabChange={setActiveTab}
    />
  );
}
