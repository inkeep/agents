'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FC, useState } from 'react';
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
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await deleteCredentialAction(tenantId, projectId, credentialId);
    if (!result.success) {
      toast.error(result.error ?? 'Failed to delete credential');
      return;
    }

    toast.success(`Deleted credential for "${toolName}" successfully.`);
    setIsOpen(false);
    router.refresh();
    setIsDeleting(false);
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
          <AlertDialogAction onClick={handleDelete} variant="destructive" disabled={isDeleting}>
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
