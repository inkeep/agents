'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { DuplicateAgentRequestSchema } from '@inkeep/agents-core/client-exports';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useAutoPrefillId } from '@/hooks/use-auto-prefill-id';
import { duplicateAgentAction } from '@/lib/actions/agent-full';
import { GenericInput } from '../form/generic-input';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Form } from '../ui/form';

const duplicateAgentFormSchema = DuplicateAgentRequestSchema.required({
  newAgentName: true,
});

type DuplicateAgentFormData = z.infer<typeof duplicateAgentFormSchema>;

interface DuplicateAgentModalProps {
  tenantId: string;
  projectId: string;
  agentId: string;
  agentName: string;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export function DuplicateAgentModal({
  tenantId,
  projectId,
  agentId,
  agentName,
  isOpen,
  setIsOpen,
}: DuplicateAgentModalProps) {
  const router = useRouter();
  const form = useForm<DuplicateAgentFormData>({
    resolver: zodResolver(duplicateAgentFormSchema),
    defaultValues: {
      newAgentName: `${agentName} (Copy)`,
      newAgentId: '',
    },
  });

  const { isSubmitting } = form.formState;

  useAutoPrefillId({
    form,
    nameField: 'newAgentName',
    idField: 'newAgentId',
    isEditing: false,
  });

  const onSubmit = async (data: DuplicateAgentFormData) => {
    const loadingToast = toast.loading('Duplicating agent...');

    try {
      const result = await duplicateAgentAction(tenantId, projectId, agentId, {
        newAgentId: data.newAgentId,
        newAgentName: data.newAgentName,
      });

      if (!result.success) {
        if (result.code === 'conflict') {
          toast.error('An agent with this ID already exists', { id: loadingToast });
        } else {
          toast.error(result.error || 'Failed to duplicate agent', { id: loadingToast });
        }
        return;
      }

      toast.success('Agent duplicated successfully', { id: loadingToast });
      setIsOpen(false);
      router.push(`/${tenantId}/projects/${projectId}/agents/${result.data.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      toast.error(errorMessage, { id: loadingToast });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="!max-w-2xl">
        <DialogHeader>
          <DialogTitle>Duplicate agent</DialogTitle>
          <DialogDescription>
            This will create a copy of "{agentName}" in the same project.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            <GenericInput
              control={form.control}
              name="newAgentName"
              label="Name"
              placeholder="My agent (Copy)"
              isRequired
            />
            <GenericInput
              control={form.control}
              name="newAgentId"
              label="Id"
              placeholder="my-agent-copy"
              isRequired
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Duplicating...' : 'Duplicate'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
