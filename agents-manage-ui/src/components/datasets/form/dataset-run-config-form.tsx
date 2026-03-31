'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useController, useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { fetchDatasetAgents, fetchEvaluatorAgents } from '@/lib/api/agent-relations';
import type { DatasetRunConfigInsert } from '@/lib/api/dataset-run-configs';
import { useAgentsQuery } from '@/lib/query/agents';
import { useEvaluatorsQuery } from '@/lib/query/evaluators';
import { createLookup } from '@/lib/utils';
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

  const [datasetScopedAgentIds, setDatasetScopedAgentIds] = useState<string[] | null>(null);

  useEffect(() => {
    fetchDatasetAgents(tenantId, projectId, datasetId)
      .then((relations) => {
        if (relations.length > 0) {
          setDatasetScopedAgentIds(relations.map((r) => r.agentId));
        } else {
          setDatasetScopedAgentIds(null);
        }
      })
      .catch(() => toast.error('Failed to load dataset agent scope'));
  }, [tenantId, projectId, datasetId]);

  const filteredAgents = useMemo(() => {
    if (!datasetScopedAgentIds) return agents;
    const allowed = new Set(datasetScopedAgentIds);
    return agents.filter((a) => allowed.has(a.id));
  }, [agents, datasetScopedAgentIds]);

  const agentLookup = useMemo(() => createLookup(filteredAgents), [filteredAgents]);

  const [evaluatorAgentMap, setEvaluatorAgentMap] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (evaluators.length === 0) return;
    const abortController = new AbortController();
    Promise.all(
      evaluators.map(async (ev) => {
        const relations = await fetchEvaluatorAgents(tenantId, projectId, ev.id);
        return [ev.id, relations.map((r) => r.agentId)] as const;
      })
    )
      .then((entries) => {
        if (!abortController.signal.aborted) {
          setEvaluatorAgentMap(new Map(entries));
        }
      })
      .catch(() => toast.error('Failed to load evaluator agent scopes'));
    return () => abortController.abort();
  }, [evaluators, tenantId, projectId]);

  const filteredEvaluators = useMemo(() => {
    const selected = agentIds as string[];
    if (selected.length === 0) return evaluators;
    return evaluators.filter((ev) => {
      const scopedAgents = evaluatorAgentMap.get(ev.id);
      if (!scopedAgents || scopedAgents.length === 0) return true;
      return scopedAgents.some((agentId) => selected.includes(agentId));
    });
  }, [evaluators, agentIds, evaluatorAgentMap]);

  const evaluatorLookup = useMemo(() => createLookup(filteredEvaluators), [filteredEvaluators]);

  const onSubmit = async (data: DatasetRunConfigFormData) => {
    try {
      const selectedAgents = data.agentIds || [];
      const selectedEvalIds = data.evaluatorIds || [];

      if (selectedAgents.length > 0 && selectedEvalIds.length > 0) {
        const unscopedEvaluators = selectedEvalIds.filter((evId) => {
          const scopedAgents = evaluatorAgentMap.get(evId);
          if (!scopedAgents || scopedAgents.length === 0) return false;
          return !scopedAgents.some((aId) => selectedAgents.includes(aId));
        });

        if (unscopedEvaluators.length > 0) {
          const names = unscopedEvaluators
            .map((id) => evaluators.find((e) => e.id === id)?.name ?? id)
            .join(', ');
          toast.error(
            `The following evaluators are not scoped to the selected agents: ${names}`
          );
          return;
        }
      }

      const payload = {
        name: data.name,
        description: data.description,
        agentIds: data.agentIds || [],
        evaluatorIds: data.evaluatorIds || [],
        ...(runConfigId ? {} : { datasetId }),
      };

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
                  componentLookup={agentLookup}
                  selectedComponents={agentIds as string[]}
                  onSelectionChange={setAgentIds}
                  emptyStateMessage="No agents available."
                  emptyStateActionText="Create agent"
                  emptyStateActionHref={`/${tenantId}/projects/${projectId}/agents`}
                  placeholder="Select agents..."
                />
              )}
              <FormDescription>
                {datasetScopedAgentIds
                  ? 'Only agents scoped to this test suite are shown.'
                  : 'Select which agents to run this test suite against.'}
              </FormDescription>
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
                  onSelectionChange={field.onChange}
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
