'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { DatasetItem } from '@/lib/api/dataset-items';
import { DatasetItemCard } from './dataset-item-card';
import { DatasetItemFormDialog } from './dataset-item-form-dialog';

interface DatasetItemsListProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  items: DatasetItem[];
}

export function DatasetItemsList({ tenantId, projectId, datasetId, items }: DatasetItemsListProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Dataset Items</h2>
          <p className="text-sm text-muted-foreground">Test cases for evaluating agent responses</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Item
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <p className="text-sm text-muted-foreground mb-4">No dataset items yet</p>
          <Button variant="outline" onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create First Item
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <DatasetItemCard
              key={item.id}
              tenantId={tenantId}
              projectId={projectId}
              datasetId={datasetId}
              item={item}
            />
          ))}
        </div>
      )}

      <DatasetItemFormDialog
        tenantId={tenantId}
        projectId={projectId}
        datasetId={datasetId}
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />
    </div>
  );
}
