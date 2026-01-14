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
import { deleteEvaluationRunConfigAction } from '@/lib/actions/evaluation-run-configs';
import type { EvaluationRunConfig } from '@/lib/api/evaluation-run-configs';

interface DeleteEvaluationRunConfigConfirmationProps {
  tenantId: string;
  projectId: string;
  runConfig: EvaluationRunConfig;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DeleteEvaluationRunConfigConfirmation({
  tenantId,
  projectId,
  runConfig,
  isOpen,
  onOpenChange,
  onSuccess,
}: DeleteEvaluationRunConfigConfirmationProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteEvaluationRunConfigAction(tenantId, projectId, runConfig.id);
      if (result.success) {
        toast.success('Continuous test deleted');
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(result.error || 'Failed to delete continuous test');
      }
    } catch (error) {
      console.error('Error deleting evaluation run config:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Continuous Test</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &quot;{runConfig.name}&quot;? This action cannot be
            undone. Evaluations will no longer be automatically triggered for matching
            conversations.
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
