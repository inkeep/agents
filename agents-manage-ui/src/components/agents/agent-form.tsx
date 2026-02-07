'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useAutoPrefillId } from '@/hooks/use-auto-prefill-id';
import { createAgentAction, updateAgentAction } from '@/lib/actions/agent-full';
import { isRequired } from '@/lib/utils';
import { type AgentInput, AgentSchema } from '@/lib/validation';
import { GenericInput } from '../form/generic-input';
import { GenericTextarea } from '../form/generic-textarea';
import { Button } from '../ui/button';
import { Form } from '../ui/form';

const defaultValues: AgentInput = {
  name: '',
  id: '',
  description: '',
};

interface AgentFormProps {
  tenantId: string;
  projectId: string;
  onSuccess?: () => void;
  initialData?: AgentInput;
  agentId?: string;
}

export const AgentForm = ({
  tenantId,
  projectId,
  agentId,
  onSuccess,
  initialData = defaultValues,
}: AgentFormProps) => {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(AgentSchema),
    defaultValues: initialData,
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

  const onSubmit = form.handleSubmit(async (data) => {
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
  });

  return (
    <Form {...form}>
      <form className="space-y-8" onSubmit={onSubmit}>
        <GenericInput
          control={form.control}
          name="name"
          label="Name"
          placeholder="My agent"
          isRequired={isRequired(AgentSchema, 'name')}
        />
        <GenericInput
          control={form.control}
          name="id"
          label="Id"
          placeholder="my-agent"
          disabled={!!agentId}
          isRequired={isRequired(AgentSchema, 'id')}
        />
        <GenericTextarea
          control={form.control}
          name="description"
          label="Description"
          placeholder="This agent is used to..."
          className="min-h-[100px]"
          isRequired={isRequired(AgentSchema, 'description')}
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
