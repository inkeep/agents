'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatasetRunConfigFormDialog } from './dataset-run-config-form-dialog';

interface NewRunConfigButtonProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  onSuccess?: () => void;
}

export function NewRunConfigButton({
  tenantId,
  projectId,
  datasetId,
  onSuccess,
}: NewRunConfigButtonProps) {
  return (
    <DatasetRunConfigFormDialog
      tenantId={tenantId}
      projectId={projectId}
      datasetId={datasetId}
      onSuccess={onSuccess}
      trigger={
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New run configuration
        </Button>
      }
    />
  );
}
