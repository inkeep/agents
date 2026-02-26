'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fetchProjectPermissions } from '@/lib/api/projects';
import { ProjectForm } from './form/project-form';
import type { ProjectInput } from './form/validation';

interface EditProjectDialogProps {
  tenantId: string;
  projectData: ProjectInput;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export function EditProjectDialog({
  tenantId,
  projectData,
  isOpen,
  setIsOpen,
}: EditProjectDialogProps) {
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    const loadPermissions = async () => {
      setLoading(true);
      try {
        const { canEdit } = await fetchProjectPermissions(tenantId, projectData.id);
        setCanEdit(canEdit);
      } finally {
        setLoading(false);
      }
    };

    loadPermissions();
  }, [isOpen, tenantId, projectData.id]);

  const handleSuccess = () => {
    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const readOnly = loading || !canEdit;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl!">
        <DialogHeader>
          <DialogTitle>{readOnly ? '' : 'Edit project'}</DialogTitle>
          <DialogDescription className="sr-only">
            {readOnly ? 'View project details.' : 'Edit project details.'}
          </DialogDescription>
        </DialogHeader>
        <ProjectForm
          projectId={projectData.id}
          initialData={projectData}
          tenantId={tenantId}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
          readOnly={readOnly}
        />
      </DialogContent>
    </Dialog>
  );
}
