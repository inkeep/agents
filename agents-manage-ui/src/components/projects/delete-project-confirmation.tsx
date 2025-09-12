'use client';

import { Dialog } from '@radix-ui/react-dialog';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { deleteProjectAction } from '@/lib/actions/projects';

interface DeleteProjectConfirmationProps {
  projectId: string;
  projectName?: string;
  setIsOpen: (isOpen: boolean) => void;
  isOpen: boolean;
}

export function DeleteProjectConfirmation({
  projectId,
  projectName,
  setIsOpen,
  isOpen,
}: DeleteProjectConfirmationProps) {
  const params = useParams();
  const { tenantId } = params as { tenantId: string };
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      const result = await deleteProjectAction(tenantId, projectId);
      if (result.success) {
        toast.success('Project deleted.');
        setIsOpen(false);
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DeleteConfirmation
        itemName={projectName || 'this project'}
        isSubmitting={isSubmitting}
        onDelete={handleDelete}
      />
    </Dialog>
  );
}
