'use client';

import { Dialog } from '@radix-ui/react-dialog';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsOrgAdmin } from '@/hooks/use-is-org-admin';
import { deleteProjectAction } from '@/lib/actions/projects';
import { toast } from '@/lib/toast';

interface DeleteProjectConfirmationProps {
  projectId: string;
  projectName?: string;
  setIsOpen: (isOpen: boolean) => void;
  isOpen: boolean;
}

export function DeleteProjectConfirmation({
  projectId,
  projectName,
  setIsOpen,
  isOpen,
}: DeleteProjectConfirmationProps) {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { isAdmin: canDelete, isLoading } = useIsOrgAdmin();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      const result = await deleteProjectAction(tenantId, projectId);
      if (result.success) {
        setIsOpen(false);
        toast.success('Project deleted.');
      } else {
        toast.error(result.error || 'Failed to delete project.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const itemName = projectName || 'this project';

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {isLoading ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project</DialogTitle>
            <DialogDescription className="sr-only">Checking permissions...</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-10 w-full" />
          </div>
        </DialogContent>
      ) : !canDelete ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cannot delete project</DialogTitle>
            <DialogDescription>You don't have permission to delete this project.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      ) : (
        <DeleteConfirmation
          itemName={itemName}
          isSubmitting={isSubmitting}
          onDelete={handleDelete}
        />
      )}
    </Dialog>
  );
}
