'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { Dialog } from '@/components/ui/dialog';
import { deleteAppAction } from '@/lib/actions/apps';

interface DeleteAppConfirmationProps {
  appId: string;
  appName: string;
  setIsOpen: (isOpen: boolean) => void;
}

export function DeleteAppConfirmation({ appId, appName, setIsOpen }: DeleteAppConfirmationProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  async function handleDelete() {
    setIsSubmitting(true);
    const result = await deleteAppAction(tenantId, projectId, appId);
    if (result.success) {
      setIsOpen(false);
      toast.success('App deleted.');
    } else {
      toast.error(result.error);
    }
    setIsSubmitting(false);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && setIsOpen(false)}>
      <DeleteConfirmation itemName={appName} isSubmitting={isSubmitting} onDelete={handleDelete} />
    </Dialog>
  );
}
