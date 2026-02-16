'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAutoPrefillId } from '@/hooks/use-auto-prefill-id';
import { createAgentAction, updateAgentAction } from '@/lib/actions/agent-full';
import { toast } from '@/lib/toast';
import { idSchema } from '@/lib/validation';
import { GenericInput } from '../form/generic-input';
import { GenericTextarea } from '../form/generic-textarea';
import { Button } from '../ui/button';
import { Form } from '../ui/form';

const agentSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  id: idSchema,
  description: z.string().optional(),
});

export type AgentFormData = z.infer<typeof agentSchema>;

const defaultValues: AgentFormData = {
  name: '',
  id: '',
  description: '',
};

interface AgentFormProps {
  tenantId: string;
  projectId: string;
  onSuccess?: () => void;
  initialData?: AgentFormData;
  agentId?: string;
}

export const AgentForm = ({
  tenantId,
  projectId,
  agentId,
  onSuccess,
  initialData,
}: AgentFormProps) => {
  const router = useRouter();
  const form = useForm<AgentFormData>({
    resolver: zodResolver(agentSchema),
    defaultValues: initialData ?? defaultValues,
  });

  const { isSubmitting } = form.formState;

  const buttonText = isSubmitting
    ? agentId
      ? 'Updating...'
      : 'Creating...'
    : agentId
      ? 'Update agent'
      : 'Create agent';

  useAutoPrefillId({
    form,
    nameField: 'name',
    idField: 'id',
    isEditing: !!agentId,
  });

  const onSubmit = async (data: AgentFormData) => {
    try {
      if (agentId) {
        const res = await updateAgentAction(tenantId, projectId, agentId, data);
        if (!res.success) {
          toast.error(res.error || 'Failed to update agent.');
          return;
        }
        toast.success('Agent updated!');
        onSuccess?.();
      } else {
        const res = await createAgentAction(tenantId, projectId, data);
        if (!res.success) {
          toast.error(res.error || 'Failed to create agent.');
          return;
        }
        if (res.data) {
          toast.success('Agent created!');
          onSuccess?.();
          router.push(`/${tenantId}/projects/${projectId}/agents/${res.data.id}`);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
      toast.error(errorMessage);
    }
  };

  return (
    <Form {...form}>
      <form className="space-y-8" onSubmit={form.handleSubmit(onSubmit)}>
        <GenericInput
          control={form.control}
          name="name"
          label="Name"
          placeholder="My agent"
          isRequired
        />
        <GenericInput
          control={form.control}
          name="id"
          label="Id"
          placeholder="my-agent"
          disabled={!!agentId}
          isRequired
        />
        <GenericTextarea
          control={form.control}
          name="description"
          label="Description"
          placeholder="This agent is used to..."
          className="min-h-[100px]"
        />
        <div className="flex justify-end">
          <Button disabled={isSubmitting} type="submit">
            {buttonText}
          </Button>
        </div>
      </form>
    </Form>
  );
};
