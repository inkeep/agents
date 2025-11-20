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
import { deleteEvaluatorAction } from '@/lib/actions/evaluators';
import type { Evaluator } from '@/lib/api/evaluators';

interface DeleteEvaluatorConfirmationProps {
  tenantId: string;
  projectId: string;
  evaluator: Evaluator;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteEvaluatorConfirmation({
  tenantId,
  projectId,
  evaluator,
  isOpen,
  onOpenChange,
}: DeleteEvaluatorConfirmationProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteEvaluatorAction(tenantId, projectId, evaluator.id);
      if (result.success) {
        toast.success('Evaluator deleted');
        onOpenChange(false);
      } else {
        toast.error(result.error || 'Failed to delete evaluator');
      }
    } catch (error) {
      console.error('Error deleting evaluator:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Evaluator</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &quot;{evaluator.name}&quot;? This action cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
