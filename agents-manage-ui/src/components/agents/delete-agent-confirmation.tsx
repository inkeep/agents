'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { deleteFullAgentAction } from '@/lib/actions/agent-full';

interface DeleteAgentConfirmationProps {
  agentId: string;
  agentName?: string;
  setIsOpen: (isOpen: boolean) => void;
}

export function DeleteAgentConfirmation({
  agentId,
  agentName,
  setIsOpen,
}: DeleteAgentConfirmationProps) {
  const params = useParams();
  const { tenantId, projectId } = params as {
    tenantId: string;
    projectId: string;
  };
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      const result = await deleteFullAgentAction(tenantId, projectId, agentId);
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
      itemName={agentName || 'this agent'}
      isSubmitting={isSubmitting}
      onDelete={handleDelete}
    />
  );
}
