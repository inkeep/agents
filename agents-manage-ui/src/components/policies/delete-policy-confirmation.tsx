'use client';

import { useRouter } from 'next/navigation';
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
import { deletePolicyAction } from '@/lib/actions/policies';

interface DeletePolicyConfirmationProps {
  tenantId: string;
  projectId: string;
  policyId: string;
  policyName: string;
  setIsOpen: (open: boolean) => void;
  redirectOnDelete?: boolean;
}

export function DeletePolicyConfirmation({
  tenantId,
  projectId,
  policyId,
  policyName,
  setIsOpen,
  redirectOnDelete = true,
}: DeletePolicyConfirmationProps) {
  const router = useRouter();

  const handleDelete = async () => {
    const result = await deletePolicyAction(tenantId, projectId, policyId);
    if (!result.success) {
      toast.error(result.error || 'Failed to delete policy');
      return;
    }

    toast.success(`Policy "${policyName}" deleted.`);
    setIsOpen(false);
    if (redirectOnDelete) {
      router.push(`/${tenantId}/projects/${projectId}/policies`);
    }
  };

  return (
    <AlertDialog open onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete policy?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove "{policyName}" policy. Sub-agents referencing this policy will lose the
            association.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
