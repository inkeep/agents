'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { useAutoPrefillId } from '@/hooks/use-auto-prefill-id';
import { createAgentAction } from '@/lib/actions/agent-full';
import { idSchema } from '@/lib/validation';
import { GenericInput } from '../form/generic-input';
import { Button } from '../ui/button';
import { Form } from '../ui/form';

const agentSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  id: idSchema,
});

type AgentFormData = z.infer<typeof agentSchema>;

const defaultValues: AgentFormData = {
  name: '',
  id: '',
};

interface NewAgentFormProps {
  tenantId: string;
  projectId: string;
}

export const NewAgentForm = ({ tenantId, projectId }: NewAgentFormProps) => {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(agentSchema),
    defaultValues: defaultValues,
  });

  useAutoPrefillId({
    form,
    nameField: 'name',
    idField: 'id',
  });

  const onSubmit = async (data: AgentFormData) => {
    try {
      const res = await createAgentAction(tenantId, projectId, data);
      if (!res.success) {
        toast.error(res.error || 'Failed to create agent.');
        return;
      }
      if (res.data) {
        const newAgent = res.data;
        toast.success('Agent created!');
        router.push(`/${tenantId}/projects/${projectId}/agents/${newAgent.id}`);
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
          isRequired
        />
        <div className="flex justify-end">
          <Button type="submit">Create agent</Button>
        </div>
      </form>
    </Form>
  );
};
