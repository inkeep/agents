'use client';

import { GitMerge } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { deleteBranchAction, mergeBranchAction } from '@/lib/actions/branches';
import { BranchDiffContent } from './branch-diff-dialog';

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
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent size="3xl" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Merge branch</DialogTitle>
          <DialogDescription>
            Merge <Badge variant="code">{branchName}</Badge> into <Badge variant="code">main</Badge>
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          <BranchDiffContent tenantId={tenantId} projectId={projectId} branchName={branchName} />
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleMerge} disabled={isPending}>
            <GitMerge className="size-4" />
            {isPending ? 'Merging...' : 'Merge into main'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
