'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { deleteExternalAgentAction } from '@/lib/actions/external-agents';

interface DeleteExternalAgentConfirmationProps {
  externalAgentId: string;
  externalAgentName?: string;
  setIsOpen: (isOpen: boolean) => void;
  redirectOnDelete?: boolean;
}

export function DeleteExternalAgentConfirmation({
  externalAgentId,
  externalAgentName,
  setIsOpen,
  redirectOnDelete = false,
}: DeleteExternalAgentConfirmationProps) {
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      const result = await deleteExternalAgentAction(tenantId, projectId, externalAgentId);
      if (result.success) {
        setIsOpen(false);
        toast.success('External agent deleted.');
        if (redirectOnDelete) {
          router.push(`/${tenantId}/projects/${projectId}/external-agents`);
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
      itemName={externalAgentName || 'this external agent'}
      isSubmitting={isSubmitting}
      onDelete={handleDelete}
    />
  );
}
