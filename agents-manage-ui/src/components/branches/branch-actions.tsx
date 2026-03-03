'use client';

import { useState } from 'react';
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
import { deleteBranchAction, mergeBranchAction } from '@/lib/actions/branches';

interface DeleteBranchConfirmationProps {
  tenantId: string;
  projectId: string;
  branchName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export function DeleteBranchConfirmation({
  tenantId,
  projectId,
  branchName,
  isOpen,
  onOpenChange,
  onDeleted,
}: DeleteBranchConfirmationProps) {
  const [isPending, setIsPending] = useState(false);

  const handleDelete = async () => {
    setIsPending(true);
    try {
      const result = await deleteBranchAction(tenantId, projectId, branchName);
      if (result.success) {
        toast.success(`Branch '${branchName}' deleted`);
        onOpenChange(false);
        onDeleted?.();
      } else {
        toast.error(result.error || 'Failed to delete branch');
      }
    } catch {
      toast.error('An unexpected error occurred');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete branch</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <strong>{branchName}</strong>? This action cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isPending} variant="destructive">
            {isPending ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface MergeBranchConfirmationProps {
  tenantId: string;
  projectId: string;
  branchName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged?: () => void;
}

export function MergeBranchConfirmation({
  tenantId,
  projectId,
  branchName,
  isOpen,
  onOpenChange,
  onMerged,
}: MergeBranchConfirmationProps) {
  const [isPending, setIsPending] = useState(false);

  const handleMerge = async () => {
    setIsPending(true);
    try {
      const result = await mergeBranchAction(tenantId, projectId, branchName);
      if (result.success) {
        if (result.data?.hasConflicts) {
          toast.error('Merge has conflicts. Please resolve them before merging.');
        } else {
          toast.success(`Branch '${branchName}' merged into main`);
          onOpenChange(false);
          onMerged?.();
        }
      } else {
        toast.error(result.error || 'Failed to merge branch');
      }
    } catch {
      toast.error('An unexpected error occurred');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Merge branch</AlertDialogTitle>
          <AlertDialogDescription>
            Merge <strong>{branchName}</strong> into <strong>main</strong>? This will apply all
            changes from this branch to the main configuration.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleMerge} disabled={isPending}>
            {isPending ? 'Merging...' : 'Merge'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
