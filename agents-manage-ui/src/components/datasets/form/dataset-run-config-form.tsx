'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useController, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAllAgentsAction } from '@/lib/actions/agent-full';
import {
  createDatasetRunConfigAction,
  updateDatasetRunConfigAction,
} from '@/lib/actions/dataset-run-configs';
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
  const [loadingAgents, setLoadingAgents] = useState(true);
  const form = useForm<DatasetRunConfigFormData>({
    resolver: zodResolver(datasetRunConfigSchema) as any,
    defaultValues: {
      name: initialData?.name || '',
      description: initialData?.description || '',
      agentIds: initialData?.agentIds || [],
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
    const fetchAgents = async () => {
      try {
        setLoadingAgents(true);
        const result = await getAllAgentsAction(tenantId, projectId);
        if (result.success && result.data) {
          setAgents(result.data);
        }
      } catch (error) {
        console.error('Failed to fetch agents:', error);
        toast.error('Failed to load agents');
      } finally {
        setLoadingAgents(false);
      }
    };

    fetchAgents();
  }, [tenantId, projectId]);

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name || '',
        description: initialData.description || '',
        agentIds: initialData.agentIds || [],
      });
    }
  }, [initialData, form]);

  const onSubmit = async (data: DatasetRunConfigFormData) => {
    try {
      const payload = {
        name: data.name,
        description: data.description || '',
        agentIds: data.agentIds || [],
      };

      const res = runConfigId
        ? await updateDatasetRunConfigAction(tenantId, projectId, runConfigId, payload)
        : await createDatasetRunConfigAction(tenantId, projectId, { ...payload, datasetId });

      if (!res.success) {
        const errorMessage =
          res.error ||
          (res.code === 'validation_error'
            ? 'Please check the form fields and try again'
            : res.code === 'bad_request'
              ? 'Invalid request data. Please check your input.'
              : runConfigId
                ? 'Failed to update dataset run config'
                : 'Failed to create dataset run config');
        toast.error(errorMessage);
        return;
      }

      toast.success(runConfigId ? 'Dataset run config updated' : 'Dataset run config created');
      onSuccess?.();
    } catch (error) {
      console.error(`Error ${runConfigId ? 'updating' : 'creating'} dataset run config:`, error);
      toast.error('An unexpected error occurred');
    }
  };

  const handleAgentToggle = (agentId: string, checked: boolean) => {
    const currentIds = agentIds || [];
    if (checked) {
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
          placeholder="Run this dataset against production agents"
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
                <ScrollArea className="h-48 w-full rounded-md border p-4">
                  <div className="space-y-3">
                    {agents.map((agent) => (
                      <div key={agent.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`agent-${agent.id}`}
                          checked={agentIds?.includes(agent.id) || false}
                          onCheckedChange={(checked) =>
                            handleAgentToggle(agent.id, checked === true)
                          }
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
              <p className="text-sm text-muted-foreground">
                Select which agents to run this dataset against
              </p>
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
                ? 'Update Run Config'
                : 'Create Run'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
