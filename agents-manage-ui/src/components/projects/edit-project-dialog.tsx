'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchProjectPermissions } from '@/lib/api/projects';
import { ProjectForm } from './form/project-form';
import type { ProjectFormData } from './form/validation';

interface EditProjectDialogProps {
  tenantId: string;
  projectData: ProjectFormData;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export function EditProjectDialog({
  tenantId,
  projectData,
  isOpen,
  setIsOpen,
}: EditProjectDialogProps) {
  const [canEdit, setCanEdit] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkPermissions() {
      if (!isOpen || !projectData.id) return;
      setCanEdit(null);
      try {
        const permissions = await fetchProjectPermissions(tenantId, projectData.id);
        setCanEdit(permissions.canEdit);
      } catch {
        setCanEdit(false);
      }
    }
    checkPermissions();
  }, [isOpen, tenantId, projectData.id]);

  const handleSuccess = () => {
    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const isLoading = canEdit === null;
  const readOnly = canEdit === false;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl!">
        <DialogHeader>
          <DialogTitle>{readOnly ? '' : 'Edit project'}</DialogTitle>
          <DialogDescription className="sr-only">
            {readOnly ? 'View project details.' : 'Edit project details.'}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <ProjectForm
            projectId={projectData.id}
            initialData={projectData}
            tenantId={tenantId}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
            readOnly={readOnly}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
