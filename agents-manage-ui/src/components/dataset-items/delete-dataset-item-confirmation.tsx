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
import { deleteDatasetItemAction } from '@/lib/actions/dataset-items';

interface DeleteDatasetItemConfirmationProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  itemId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteDatasetItemConfirmation({
  tenantId,
  projectId,
  datasetId,
  itemId,
  isOpen,
  onOpenChange,
}: DeleteDatasetItemConfirmationProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteDatasetItemAction(tenantId, projectId, datasetId, itemId);
      if (result.success) {
        toast.success('Dataset item deleted');
        onOpenChange(false);
      } else {
        toast.error(result.error || 'Failed to delete dataset item');
      }
    } catch (error) {
      console.error('Error deleting dataset item:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Dataset Item</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this dataset item? This action cannot be undone.
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
