'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AgentForm, type AgentInput } from './agent-form';

interface EditAgentDialogProps {
  tenantId: string;
  projectId: string;
  agentData: AgentInput;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export function EditAgentDialog({
  tenantId,
  projectId,
  agentData,
  isOpen,
  setIsOpen,
}: EditAgentDialogProps) {
  const handleSuccess = () => {
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="!max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit agent</DialogTitle>
          <DialogDescription className="sr-only">Edit agent details.</DialogDescription>
        </DialogHeader>
        <AgentForm
          projectId={projectId}
          agentId={agentData.id}
          defaultValues={agentData}
          tenantId={tenantId}
          onSuccess={handleSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}
