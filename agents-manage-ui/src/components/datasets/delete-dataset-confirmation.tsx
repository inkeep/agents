'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { deleteDatasetAction } from '@/lib/actions/datasets';

interface DeleteDatasetConfirmationProps {
  datasetId: string;
  datasetName?: string;
  setIsOpen: (isOpen: boolean) => void;
  redirectOnDelete?: boolean;
}

export function DeleteDatasetConfirmation({
  datasetId,
  datasetName,
  setIsOpen,
  redirectOnDelete = false,
}: DeleteDatasetConfirmationProps) {
  const params = useParams();
  const router = useRouter();
  const { tenantId, projectId } = params as {
    tenantId: string;
    projectId: string;
  };
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      const result = await deleteDatasetAction(tenantId, projectId, datasetId);
      if (result.success) {
        toast.success('Test suite deleted.');
        setIsOpen(false);
        if (redirectOnDelete) {
          router.push(`/${tenantId}/projects/${projectId}/datasets`);
        }
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DeleteConfirmation
      itemName={datasetName || 'this test suite'}
      isSubmitting={isSubmitting}
      onDelete={handleDelete}
    />
  );
}
