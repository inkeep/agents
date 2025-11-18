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
import { deleteEvaluationJobConfigAction } from '@/lib/actions/evaluation-job-configs';
import type { EvaluationJobConfig } from '@/lib/api/evaluation-job-configs';

interface DeleteEvaluationJobConfirmationProps {
  tenantId: string;
  projectId: string;
  jobConfig: EvaluationJobConfig;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteEvaluationJobConfirmation({
  tenantId,
  projectId,
  jobConfig,
  isOpen,
  onOpenChange,
}: DeleteEvaluationJobConfirmationProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteEvaluationJobConfigAction(tenantId, projectId, jobConfig.id);
      if (result.success) {
        toast.success('Batch evaluation deleted');
        onOpenChange(false);
      } else {
        toast.error(result.error || 'Failed to delete batch evaluation');
      }
    } catch (error) {
      console.error('Error deleting batch evaluation:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Batch Evaluation</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this batch evaluation? This action cannot be undone.
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
