'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { deleteApiKeyAction } from '@/lib/actions/api-keys';

interface DeleteApiKeyConfirmationProps {
  apiKeyId: string;
  apiKeyName?: string;
  setIsOpen: (isOpen: boolean) => void;
}

export function DeleteApiKeyConfirmation({
  apiKeyId,
  apiKeyName,
  setIsOpen,
}: DeleteApiKeyConfirmationProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      const result = await deleteApiKeyAction(tenantId, projectId, apiKeyId);
      if (result.success) {
        setIsOpen(false);
        toast.success('API key deleted.');
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DeleteConfirmation
      itemName={apiKeyName || 'this API key'}
      isSubmitting={isSubmitting}
      onDelete={handleDelete}
    />
  );
}
