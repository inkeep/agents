'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { DuplicateAgentRequestSchema } from '@inkeep/agents-core/client-exports';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FieldLabel } from '@/components/agent/sidepane/form-components/label';
import { GenericInput } from '@/components/form/generic-input';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Form } from '@/components/ui/form';
import { useAutoPrefillId } from '@/hooks/use-auto-prefill-id';
import { duplicateAgentAction } from '@/lib/actions/agent-full';
import { useAgentsListQuery } from '@/lib/query/agents';
import { isRequired } from '@/lib/utils';

const DuplicateAgentFormSchema = DuplicateAgentRequestSchema.extend({
  newAgentName: z
    .union([DuplicateAgentRequestSchema.shape.newAgentName, z.literal('')])
    .transform((value) => (value === '' ? undefined : value)),
});

type DuplicateAgentInput = z.input<typeof DuplicateAgentFormSchema>;

const initialData: DuplicateAgentInput = {
  newAgentId: '',
  newAgentName: '',
};

interface DuplicateAgentSectionProps {
  tenantId: string;
  projectId: string;
  isOpen: boolean;
  onSuccess?: () => void;
}

export function DuplicateAgentSection({
  tenantId,
  projectId,
  isOpen,
  onSuccess,
}: DuplicateAgentSectionProps) {
  'use memo';
  const router = useRouter();
  const [sourceAgentId, setSourceAgentId] = useState('');
  const form = useForm<
    DuplicateAgentInput,
    unknown,
    z.output<typeof DuplicateAgentFormSchema>
  >({
    resolver: zodResolver(DuplicateAgentFormSchema),
    defaultValues: initialData,
    mode: 'onChange',
  });

  const { isSubmitting } = form.formState;
  const {
    data: agents,
    isFetching: agentsLoading,
    isError: agentsError,
  } = useAgentsListQuery({
    tenantId,
    projectId,
    enabled: isOpen,
  });

  const selectedAgent = agents.find((agent) => agent.id === sourceAgentId);

  useAutoPrefillId({
    form,
    nameField: 'newAgentName',
    idField: 'newAgentId',
  });

  useEffect(() => {
    if (!isOpen) {
      setSourceAgentId('');
      form.reset(initialData);
    }
  }, [form, isOpen]);

  function handleSourceAgentSelect(agentId: string) {
    const sourceAgent = agents.find((agent) => agent.id === agentId);

    setSourceAgentId(agentId);
    form.reset({
      newAgentId: '',
      newAgentName: sourceAgent ? `${sourceAgent.name} (Copy)` : '',
    });
  }

  const onSubmit = form.handleSubmit(async (data) => {
    if (!sourceAgentId) {
      return;
    }

    try {
      const result = await duplicateAgentAction(tenantId, projectId, sourceAgentId, data);

      if (!result.success) {
        toast.error(result.error || 'Failed to duplicate agent.');
        return;
      }

      toast.success('Agent duplicated!');
      onSuccess?.();
      router.push(`/${tenantId}/projects/${projectId}/agents/${result.data.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to duplicate agent.';
      toast.error(errorMessage);
    }
  });

  if (agentsError) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Could not load agents from this project. Try again.
      </div>
    );
  }

  if (agentsLoading) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Loading agents...
      </div>
    );
  }

  if (!agents.length) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Create your first agent before duplicating one.
      </div>
    );
  }

  return (
    <Form {...form}>
      <form className="space-y-8" onSubmit={onSubmit}>
        <div className="space-y-2">
          <FieldLabel label="Source agent" />
          <Combobox
            options={agents.map((agent) => ({
              value: agent.id,
              selectedLabel: agent.name,
              label: (
                <div className="min-w-0">
                  <div className="truncate font-medium">{agent.name}</div>
                  {agent.description && (
                    <div className="truncate text-xs text-muted-foreground">
                      {agent.description}
                    </div>
                  )}
                </div>
              ),
              searchBy: `${agent.name} ${agent.description ?? ''}`,
            }))}
            onSelect={handleSourceAgentSelect}
            defaultValue={sourceAgentId}
            placeholder="Select an existing agent"
            searchPlaceholder="Search agents..."
            notFoundMessage="No agents found."
            triggerClassName="w-full"
            className="w-(--radix-popover-trigger-width)"
          />
        </div>

        {selectedAgent && (
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="text-sm font-medium">Source agent</div>
            <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
              <div className="space-y-1">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{selectedAgent.name}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-muted-foreground">ID</dt>
                <dd className="font-medium">{selectedAgent.id}</dd>
              </div>
              <div className="space-y-1 md:col-span-2">
                <dt className="text-muted-foreground">Description</dt>
                <dd>{selectedAgent.description || 'No description provided.'}</dd>
              </div>
              <div className="space-y-1 md:col-span-2">
                <dt className="text-muted-foreground">What gets copied</dt>
                <dd>Agent-scoped configuration is duplicated. Triggers are not copied.</dd>
              </div>
            </dl>
          </div>
        )}

        <GenericInput
          control={form.control}
          name="newAgentName"
          label="New name"
          placeholder={selectedAgent ? `${selectedAgent.name} (Copy)` : 'Copied agent'}
          description="Optional. Leave blank to use the default copied name."
        />
        <GenericInput
          control={form.control}
          name="newAgentId"
          label="New id"
          placeholder={selectedAgent ? `${selectedAgent.id}-copy` : 'copied-agent'}
          description="Required. This becomes the new agent URL and identifier."
          isRequired={isRequired(DuplicateAgentFormSchema, 'newAgentId')}
        />

        <div className="flex justify-end">
          <Button disabled={!sourceAgentId || isSubmitting} type="submit">
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Duplicating...
              </>
            ) : (
              'Duplicate agent'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
