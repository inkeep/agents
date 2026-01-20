'use client';

import { OrgRoles } from '@inkeep/agents-core/client-exports';
import { Dialog } from '@radix-ui/react-dialog';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthClient } from '@/contexts/auth-client';
import { deleteProjectAction } from '@/lib/actions/projects';

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
  const authClient = useAuthClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [canDelete, setCanDelete] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setCanDelete(null);
    async function checkPermission() {
      try {
        const memberResult = await authClient.organization.getActiveMember();
        if (memberResult.data) {
          const role = memberResult.data.role;
          // Only owners and admins can delete projects
          setCanDelete(role === OrgRoles.OWNER || role === OrgRoles.ADMIN);
        } else {
          setCanDelete(false);
        }
      } catch {
        setCanDelete(false);
      }
    }
    checkPermission();
  }, [authClient, isOpen]);

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

  const isLoading = canDelete === null;
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
