'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatasetItemFormDialog } from './dataset-item-form-dialog';

interface NewItemButtonProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
}

export function NewItemButton({ tenantId, projectId, datasetId }: NewItemButtonProps) {
  return (
    <DatasetItemFormDialog
      tenantId={tenantId}
      projectId={projectId}
      datasetId={datasetId}
      isOpen={false}
      onOpenChange={() => {}}
      trigger={
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New item
        </Button>
      }
    />
  );
}
