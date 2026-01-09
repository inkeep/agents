'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { DatasetRunConfigForm } from './form/dataset-run-config-form';

interface DatasetRunConfigFormDialogProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  runConfigId?: string;
  initialData?: {
    name?: string;
    description?: string;
    agentIds?: string[];
    evaluationRunConfigIds?: string[];
    evaluationRunConfigs?: Array<{ id: string; enabled: boolean }>;
    triggerEvaluations?: boolean;
  };
  trigger?: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DatasetRunConfigFormDialog({
  tenantId,
  projectId,
  datasetId,
  runConfigId,
  initialData,
  trigger,
  isOpen: controlledIsOpen,
  onOpenChange,
  onSuccess,
}: DatasetRunConfigFormDialogProps) {
  const router = useRouter();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = trigger ? internalIsOpen : (controlledIsOpen ?? false);
  const setIsOpen = trigger ? setInternalIsOpen : (onOpenChange ?? (() => {}));

  const handleSuccess = () => {
    // Close dialog
    if (trigger) {
      setInternalIsOpen(false);
    } else {
      onOpenChange?.(false);
    }
    // Refresh the page to get updated data from server
    router.refresh();
    // Call custom success callback if provided
    onSuccess?.();
  };

  const handleCancel = () => {
    setIsOpen(false);
    if (trigger) {
      setInternalIsOpen(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {runConfigId ? 'Edit Test Suite Run Configuration' : 'Create Test Suite Run'}
          </DialogTitle>
          <DialogDescription>
            Configure when and how to run this test suite against your agents
          </DialogDescription>
        </DialogHeader>
        <DatasetRunConfigForm
          tenantId={tenantId}
          projectId={projectId}
          datasetId={datasetId}
          runConfigId={runConfigId}
          initialData={initialData}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </DialogContent>
    </Dialog>
  );
}
