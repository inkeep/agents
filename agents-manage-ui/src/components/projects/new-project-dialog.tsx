'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ProjectForm } from './form/project-form';

interface NewProjectDialogProps {
  tenantId: string;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function NewProjectDialog({
  tenantId,
  children,
  open: controlledOpen,
  onOpenChange,
}: NewProjectDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const router = useRouter();

  // Use controlled state if provided, otherwise use uncontrolled
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = onOpenChange || setUncontrolledOpen;

  const handleSuccess = (projectId: string) => {
    setOpen(false);
    router.push(`/${tenantId}/projects/${projectId}/agents`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="!max-w-2xl">
        <DialogTitle>Create new project</DialogTitle>
        <DialogDescription>
          Create a new project to organize your agents, tools, and resources.
        </DialogDescription>
        <ProjectForm
          tenantId={tenantId}
          onSuccess={handleSuccess}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
