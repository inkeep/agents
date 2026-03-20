'use client';

import type { FC } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { deleteCredentialAction } from '@/lib/actions/credentials';

interface DisconnectCredentialConfirmationProps {
  tenantId: string;
  projectId: string;
  credentialId: string;
  toolName: string;
  setIsOpen: (open: boolean) => void;
}

export const DisconnectCredentialConfirmation: FC<DisconnectCredentialConfirmationProps> = ({
  tenantId,
  projectId,
  credentialId,
  toolName,
  setIsOpen,
}) => {
  const handleDelete = async () => {
    const result = await deleteCredentialAction(tenantId, projectId, credentialId);
    if (!result.success) {
      toast.error(result.error ?? 'Failed to delete credential');
      return;
    }

    toast.success(`Deleted credential for "${toolName}" successfully.`);
    setIsOpen(false);
    window.location.reload();
  };

  return (
    <AlertDialog open onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete credential?</AlertDialogTitle>
          <AlertDialogDescription>
            This will delete the credential for &ldquo;{toolName}&rdquo;. The server will need to be
            re-authenticated before it can be used again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} variant="destructive">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
