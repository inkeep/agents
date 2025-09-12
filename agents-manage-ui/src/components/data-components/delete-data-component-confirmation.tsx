'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { deleteDataComponentAction } from '@/lib/actions/data-components';

interface DeleteDataComponentConfirmationProps {
  dataComponentId: string;
  dataComponentName?: string;
  setIsOpen: (isOpen: boolean) => void;
}

export function DeleteDataComponentConfirmation({
  dataComponentId,
  dataComponentName,
  setIsOpen,
}: DeleteDataComponentConfirmationProps) {
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      const result = await deleteDataComponentAction(tenantId, projectId, dataComponentId);
      if (result.success) {
        setIsOpen(false);
        toast.success('Data component deleted.');
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DeleteConfirmation
      itemName={dataComponentName || 'this data component'}
      isSubmitting={isSubmitting}
      onDelete={handleDelete}
    />
  );
}
