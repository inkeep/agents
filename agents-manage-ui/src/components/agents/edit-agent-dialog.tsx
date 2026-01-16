'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AgentForm, type AgentFormData } from './agent-form';

interface EditAgentDialogProps {
  tenantId: string;
  projectId: string;
  agentData: AgentFormData;
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
  console.log('agentData', agentData);
  const handleSuccess = () => {
    setIsOpen(false);
  };
  console.log('agentData', agentData);

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
          initialData={agentData}
          tenantId={tenantId}
          onSuccess={handleSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}
