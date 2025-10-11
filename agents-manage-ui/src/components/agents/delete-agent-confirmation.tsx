'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { deleteFullGraphAction } from '@/lib/actions/agent-full';

interface DeleteGraphConfirmationProps {
  agentId: string;
  graphName?: string;
  setIsOpen: (isOpen: boolean) => void;
}

export function DeleteGraphConfirmation({
  agentId,
  graphName,
  setIsOpen,
}: DeleteGraphConfirmationProps) {
  const params = useParams();
  const { tenantId, projectId } = params as {
    tenantId: string;
    projectId: string;
  };
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      const result = await deleteFullGraphAction(tenantId, projectId, agentId);
      if (result.success) {
        toast.success('Agent deleted.');
        setIsOpen(false);
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DeleteConfirmation
      itemName={graphName || 'this agent'}
      isSubmitting={isSubmitting}
      onDelete={handleDelete}
    />
  );
}
