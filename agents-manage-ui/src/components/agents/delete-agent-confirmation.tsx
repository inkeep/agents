'use client';

import { Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { deleteFullAgentAction } from '@/lib/actions/agent-full';

interface DeleteAgentConfirmationProps {
  agentId: string;
  agentName: string;
  setIsOpen: (isOpen: boolean) => void;
}

export function DeleteAgentConfirmation({
  agentId,
  agentName,
  setIsOpen,
}: DeleteAgentConfirmationProps) {
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const displayName = agentName;

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      const result = await deleteFullAgentAction(tenantId, projectId, agentId);
      if (result.success) {
        toast.success('Agent deleted.');
        setIsOpen(false);
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogContent>
      <DialogTitle>Delete {displayName}</DialogTitle>
      <DialogDescription asChild>
        <div className="space-y-3">
          <p>
            Are you sure you want to delete <strong>{displayName}</strong>? This will permanently
            remove the agent and all associated resources, including:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Conversation history and tasks</li>
            <li>API keys scoped to this agent</li>
            <li>Slack channel and workspace configurations</li>
          </ul>
          <p className="text-sm font-medium">This action cannot be undone.</p>
        </div>
      </DialogDescription>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Deleting...
            </>
          ) : (
            'Delete'
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
