'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useController, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAllAgentsAction } from '@/lib/actions/agent-full';
import {
  createDatasetRunConfigAction,
  updateDatasetRunConfigAction,
} from '@/lib/actions/dataset-run-configs';
import type { DatasetRunConfigInsert } from '@/lib/api/dataset-run-configs';
import type { Evaluator } from '@/lib/api/evaluators';
import { fetchEvaluators } from '@/lib/api/evaluators';
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
  const [agents, setAgents] = useState<Agent[]>([]);
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingEvaluators, setLoadingEvaluators] = useState(true);

  const form = useForm<DatasetRunConfigFormData>({
    resolver: zodResolver(datasetRunConfigSchema) as any,
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
    const fetchData = async () => {
      try {
        setLoadingAgents(true);
        setLoadingEvaluators(true);
        const [agentsResult, evaluatorsResult] = await Promise.all([
          getAllAgentsAction(tenantId, projectId),
          fetchEvaluators(tenantId, projectId),
        ]);
        if (agentsResult.success && agentsResult.data) {
          setAgents(agentsResult.data);
        }
        if (evaluatorsResult.data) {
          setEvaluators(evaluatorsResult.data);
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
        toast.error('Failed to load data');
      } finally {
        setLoadingAgents(false);
        setLoadingEvaluators(false);
      }
    };

    fetchData();
  }, [tenantId, projectId]);

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
        ...(runConfigId ? {} : { datasetId: datasetId! }),
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

  const handleAgentToggle = (agentId: string) => {
    const currentIds = agentIds as string[];
    if (!currentIds.includes(agentId)) {
      setAgentIds([...currentIds, agentId]);
    } else {
      setAgentIds(currentIds.filter((id) => id !== agentId));
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
              <FormLabel>Agents</FormLabel>
              {loadingAgents ? (
                <p className="text-sm text-muted-foreground">Loading agents...</p>
              ) : agents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No agents available</p>
              ) : (
                <ScrollArea className="h-48 rounded-md border p-4">
                  <div className="space-y-2">
                    {agents.map((agent) => (
                      <div key={agent.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`agent-${agent.id}`}
                          checked={agentIds.includes(agent.id)}
                          onCheckedChange={() => handleAgentToggle(agent.id)}
                        />
                        <label
                          htmlFor={`agent-${agent.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {agent.name}
                        </label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
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
              <FormLabel>Evaluators (Optional)</FormLabel>
              {loadingEvaluators ? (
                <p className="text-sm text-muted-foreground">Loading evaluators...</p>
              ) : evaluators.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No evaluators available. Create evaluators first to enable automatic evaluation
                  after the dataset run.
                </p>
              ) : (
                <ScrollArea className="h-48 rounded-md border p-4">
                  <div className="space-y-2">
                    {evaluators.map((evaluator) => (
                      <div key={evaluator.id} className="flex items-start space-x-2">
                        <Checkbox
                          id={`evaluator-${evaluator.id}`}
                          checked={(field.value || []).includes(evaluator.id)}
                          onCheckedChange={(checked) => {
                            const currentIds = field.value || [];
                            const newIds = checked
                              ? [...currentIds, evaluator.id]
                              : currentIds.filter((id) => id !== evaluator.id);
                            field.onChange(newIds);
                          }}
                          className="mt-1"
                        />
                        <Label
                          htmlFor={`evaluator-${evaluator.id}`}
                          className="font-normal cursor-pointer flex-1"
                        >
                          <div>
                            <div className="font-medium">{evaluator.name}</div>
                            {evaluator.description && (
                              <div className="text-sm text-muted-foreground">
                                {evaluator.description}
                              </div>
                            )}
                          </div>
                        </Label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
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
