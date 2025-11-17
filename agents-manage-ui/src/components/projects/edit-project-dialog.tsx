'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProjectForm } from './form/project-form';
import type { ProjectFormData } from './form/validation';

interface EditProjectDialogProps {
  tenantId: string;
  projectData: ProjectFormData;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  ref?: string;
}

export function EditProjectDialog({
  tenantId,
  projectData,
  isOpen,
  setIsOpen,
  ref,
}: EditProjectDialogProps) {
  const handleSuccess = () => {
    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="!max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription className="sr-only">Edit project details.</DialogDescription>
        </DialogHeader>
        <ProjectForm
          projectId={projectData.id}
          initialData={projectData}
          tenantId={tenantId}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
          ref={ref}
        />
      </DialogContent>
    </Dialog>
  );
}
