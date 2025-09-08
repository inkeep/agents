'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
  triggerButton?: React.ReactNode;
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function NewProjectDialog({
  tenantId,
  triggerButton,
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
    router.push(`/${tenantId}/projects/${projectId}/graphs`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {(children || triggerButton) && (
        <DialogTrigger asChild>
          {children || triggerButton || (
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          )}
        </DialogTrigger>
      )}
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
