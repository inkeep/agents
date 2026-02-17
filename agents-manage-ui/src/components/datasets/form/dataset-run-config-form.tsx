'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { useController, useForm } from 'react-hook-form';
import { ComponentSelector } from '@/components/agent/sidepane/nodes/component-selector/component-selector';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  createDatasetRunConfigAction,
  updateDatasetRunConfigAction,
} from '@/lib/actions/dataset-run-configs';
import type { DatasetRunConfigInsert } from '@/lib/api/dataset-run-configs';
import type { Evaluator } from '@/lib/api/evaluators';
import { useAgentsQuery } from '@/lib/query/agents';
import { useEvaluatorsQuery } from '@/lib/query/evaluators';
import { toast } from '@/lib/toast';
import type { Agent } from '@/lib/types/agent-full';
import {
  type DatasetRunConfigFormData,
  datasetRunConfigSchema,
} from './dataset-run-config-validation';

interface DatasetRunConfigFormProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  runConfigId?: string;
  initialData?: {
    name?: string;
    description?: string;
    agentIds?: string[];
    evaluatorIds?: string[];
  };
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function DatasetRunConfigForm({
  tenantId,
  projectId,
  datasetId,
  runConfigId,
  initialData,
  onSuccess,
  onCancel,
}: DatasetRunConfigFormProps) {
  const { data: agents, isFetching: loadingAgents } = useAgentsQuery();
  const { data: evaluators, isFetching: loadingEvaluators } = useEvaluatorsQuery();

  const form = useForm({
    resolver: zodResolver(datasetRunConfigSchema),
    defaultValues: {
      name: initialData?.name || '',
      description: initialData?.description || '',
      agentIds: initialData?.agentIds || [],
      evaluatorIds: initialData?.evaluatorIds || [],
    },
  });

  const { isSubmitting } = form.formState;
  const {
    field: { value: agentIds, onChange: setAgentIds },
  } = useController({
    name: 'agentIds',
    control: form.control,
    defaultValue: [],
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name || '',
        description: initialData.description || '',
        agentIds: initialData.agentIds || [],
        evaluatorIds: initialData?.evaluatorIds || [],
      });
    }
  }, [initialData, form]);

  const agentLookup = useMemo(() => {
    return agents.reduce(
      (acc, agent) => {
        acc[agent.id] = agent;
        return acc;
      },
      {} as Record<string, Agent>
    );
  }, [agents]);

  const evaluatorLookup = useMemo(() => {
    return evaluators.reduce(
      (acc, evaluator) => {
        acc[evaluator.id] = evaluator;
        return acc;
      },
      {} as Record<string, Evaluator>
    );
  }, [evaluators]);

  const onSubmit = async (data: DatasetRunConfigFormData) => {
    console.log('Form submission data:', data);
    console.log('evaluatorIds in form data:', data.evaluatorIds);
    console.log('Form values:', form.getValues());
    console.log('Form watch evaluatorIds:', form.watch('evaluatorIds'));

    try {
      // Ensure evaluatorIds is always included, even if empty
      const payload = {
        name: data.name,
        description: data.description,
        agentIds: data.agentIds || [],
        evaluatorIds: data.evaluatorIds || [],
        ...(runConfigId ? {} : { datasetId }),
      };

      console.log('Payload being sent:', payload);
      console.log('evaluatorIds in payload:', payload.evaluatorIds);
      console.log('Payload JSON:', JSON.stringify(payload));

      const result = runConfigId
        ? await updateDatasetRunConfigAction(tenantId, projectId, runConfigId, payload)
        : await createDatasetRunConfigAction(
            tenantId,
            projectId,
            payload as DatasetRunConfigInsert
          );

      if (result.success) {
        toast.success(
          runConfigId ? 'Run config updated successfully' : 'Run config created successfully'
        );
        onSuccess?.();
      } else {
        toast.error(result.error || 'An error occurred');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      toast.error('An unexpected error occurred');
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <GenericInput
          control={form.control}
          name="name"
          label="Name"
          placeholder="Test Run for Production Agents"
          description="A descriptive name for this run configuration"
          isRequired
        />

        <GenericTextarea
          control={form.control}
          name="description"
          label="Description"
          placeholder="Run this test suite against production agents"
          className="min-h-[80px]"
        />

        <FormField
          control={form.control}
          name="agentIds"
          render={() => (
            <FormItem>
              <div className="flex items-center gap-2">
                <FormLabel isRequired>Agents</FormLabel>
                <Badge variant="count">{(agentIds as string[]).length}</Badge>
              </div>
              {loadingAgents ? (
                <p className="text-sm text-muted-foreground">Loading agents...</p>
              ) : (
                <ComponentSelector
                  label=""
                  componentLookup={agentLookup}
                  selectedComponents={agentIds as string[]}
                  onSelectionChange={(newSelection) => {
                    setAgentIds(newSelection);
                  }}
                  emptyStateMessage="No agents available."
                  emptyStateActionText="Create agent"
                  emptyStateActionHref={`/${tenantId}/projects/${projectId}/agents`}
                  placeholder="Select agents..."
                />
              )}
              <FormDescription>Select which agents to run this test suite against</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="evaluatorIds"
          render={({ field }) => (
            <FormItem>
              {loadingEvaluators ? (
                <p className="text-sm text-muted-foreground">Loading evaluators...</p>
              ) : (
                <ComponentSelector
                  label="Evaluators (Optional)"
                  componentLookup={evaluatorLookup}
                  selectedComponents={field.value || []}
                  onSelectionChange={(newSelection) => {
                    field.onChange(newSelection);
                  }}
                  emptyStateMessage="No evaluators available."
                  emptyStateActionText="Create evaluator"
                  emptyStateActionHref={`/${tenantId}/projects/${projectId}/evaluations?tab=evaluators`}
                  placeholder="Select evaluators..."
                />
              )}
              <FormDescription>
                When evaluators are selected, an evaluation job will automatically run after the
                test suite completes
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex w-full justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? runConfigId
                ? 'Updating...'
                : 'Creating...'
              : runConfigId
                ? 'Update Run Configuration'
                : 'Create Run'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
