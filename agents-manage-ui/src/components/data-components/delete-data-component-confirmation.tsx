'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { useCurrentRef } from '@/hooks/use-current-ref';
import { deleteDataComponentAction } from '@/lib/actions/data-components';

interface DeleteDataComponentConfirmationProps {
  dataComponentId: string;
  dataComponentName?: string;
  setIsOpen: (isOpen: boolean) => void;
  redirectOnDelete?: boolean;
}

export function DeleteDataComponentConfirmation({
  dataComponentId,
  dataComponentName,
  setIsOpen,
  redirectOnDelete = false,
}: DeleteDataComponentConfirmationProps) {
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  const ref = useCurrentRef();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      const result = await deleteDataComponentAction(tenantId, projectId, dataComponentId, ref);
      if (result.success) {
        setIsOpen(false);
        toast.success('Component deleted.');
        if (redirectOnDelete) {
          router.push(`/${tenantId}/projects/${projectId}/components`);
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
      itemName={dataComponentName || 'this component'}
      isSubmitting={isSubmitting}
      onDelete={handleDelete}
    />
  );
}
