'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useController, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { getAllAgentsAction } from '@/lib/actions/agent-full';
import {
  createDatasetRunConfigAction,
  updateDatasetRunConfigAction,
} from '@/lib/actions/dataset-run-configs';
import { createEvaluationRunConfigAction } from '@/lib/actions/evaluation-run-configs';
import type { EvaluationRunConfigRelation } from '@/lib/api/dataset-run-configs';
import type { EvaluationRunConfig } from '@/lib/api/evaluation-run-configs';
import { fetchEvaluationRunConfigs } from '@/lib/api/evaluation-run-configs';
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
    evaluationRunConfigIds?: string[];
    evaluationRunConfigs?: EvaluationRunConfigRelation[];
    triggerEvaluations?: boolean;
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
  const [availableEvaluationRunConfigs, setAvailableEvaluationRunConfigs] = useState<
    EvaluationRunConfig[]
  >([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingEvalRunConfigs, setLoadingEvalRunConfigs] = useState(true);
  const [isCreateEvalRunConfigOpen, setIsCreateEvalRunConfigOpen] = useState(false);

  const evaluationRunConfigForm = useForm<{
    name: string;
    description: string;
    isActive: boolean;
    excludeDatasetRunConversations: boolean;
  }>({
    resolver: zodResolver(
      z.object({
        name: z.string().min(1, 'Name is required'),
        description: z.string().min(1, 'Description is required'),
        isActive: z.boolean().default(true),
        excludeDatasetRunConversations: z.boolean().default(false),
      })
    ),
    defaultValues: {
      name: '',
      description: '',
      isActive: true,
      excludeDatasetRunConversations: false,
    },
  });
  const form = useForm<DatasetRunConfigFormData>({
    resolver: zodResolver(datasetRunConfigSchema) as any,
    defaultValues: {
      name: initialData?.name || '',
      description: initialData?.description || '',
      agentIds: initialData?.agentIds || [],
      evaluationRunConfigIds: initialData?.evaluationRunConfigIds || [],
      evaluationRunConfigs:
        initialData?.evaluationRunConfigs ||
        initialData?.evaluationRunConfigIds?.map((id) => ({ id, enabled: true })) ||
        [],
      triggerEvaluations: initialData?.triggerEvaluations || false,
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

  const {
    field: { value: evaluationRunConfigIds, onChange: setEvaluationRunConfigIds },
  } = useController({
    name: 'evaluationRunConfigIds',
    control: form.control,
    defaultValue: [],
  });

  const {
    field: { value: evaluationRunConfigs, onChange: setEvaluationRunConfigs },
  } = useController({
    name: 'evaluationRunConfigs',
    control: form.control,
    defaultValue: [],
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingAgents(true);
        setLoadingEvalRunConfigs(true);
        const [agentsResult, evalRunConfigsResult] = await Promise.all([
          getAllAgentsAction(tenantId, projectId),
          fetchEvaluationRunConfigs(tenantId, projectId),
        ]);
        if (agentsResult.success && agentsResult.data) {
          setAgents(agentsResult.data);
        }
        if (evalRunConfigsResult.data) {
          setAvailableEvaluationRunConfigs(evalRunConfigsResult.data);
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
        toast.error('Failed to load data');
      } finally {
        setLoadingAgents(false);
        setLoadingEvalRunConfigs(false);
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
          evaluationRunConfigIds: initialData.evaluationRunConfigIds || [],
          evaluationRunConfigs:
            initialData.evaluationRunConfigs ||
            initialData.evaluationRunConfigIds?.map((id) => ({ id, enabled: true })) ||
            [],
          triggerEvaluations: initialData.triggerEvaluations || false,
        });
    }
  }, [initialData, form]);

  const onSubmit = async (data: DatasetRunConfigFormData) => {
    try {
      const payload = {
        name: data.name,
        description: data.description || '',
        agentIds: data.agentIds || [],
        evaluationRunConfigs:
          data.evaluationRunConfigs && data.evaluationRunConfigs.length > 0
            ? data.evaluationRunConfigs
            : data.evaluationRunConfigIds?.map((id) => ({ id, enabled: true })) || [],
        triggerEvaluations: data.triggerEvaluations || false,
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

  const handleEvaluationRunConfigToggle = (evalRunConfigId: string, checked: boolean) => {
    const currentConfigs = evaluationRunConfigs || [];
    const existingConfig = currentConfigs.find((config) => config.id === evalRunConfigId);
    
    if (checked) {
      // Add if not already present, or update existing to enabled: true
      if (!existingConfig) {
        setEvaluationRunConfigs([...currentConfigs, { id: evalRunConfigId, enabled: true }]);
        // Also update the legacy array for backward compatibility
        const currentIds = evaluationRunConfigIds || [];
        if (!currentIds.includes(evalRunConfigId)) {
          setEvaluationRunConfigIds([...currentIds, evalRunConfigId]);
        }
      } else {
        // Update existing to enabled: true
        setEvaluationRunConfigs(
          currentConfigs.map((config) =>
            config.id === evalRunConfigId ? { ...config, enabled: true } : config
          )
        );
      }
      // Auto-enable triggerEvaluations when an evaluation run config is enabled
      form.setValue('triggerEvaluations', true);
    } else {
      // Update to enabled: false (keep in list, just disabled)
      if (existingConfig) {
        setEvaluationRunConfigs(
          currentConfigs.map((config) =>
            config.id === evalRunConfigId ? { ...config, enabled: false } : config
          )
        );
      } else {
        // Add with enabled: false if not present
        setEvaluationRunConfigs([...currentConfigs, { id: evalRunConfigId, enabled: false }]);
        // Also update the legacy array for backward compatibility
        const currentIds = evaluationRunConfigIds || [];
        if (!currentIds.includes(evalRunConfigId)) {
          setEvaluationRunConfigIds([...currentIds, evalRunConfigId]);
        }
      }
      // Auto-disable triggerEvaluations if no enabled evaluation run configs remain
      const enabledConfigs = currentConfigs.filter(
        (config) => config.id !== evalRunConfigId && config.enabled === true
      );
      if (enabledConfigs.length === 0) {
        form.setValue('triggerEvaluations', false);
      }
    }
  };

  const handleCreateEvaluationRunConfig = async (data: {
    name: string;
    description: string;
    isActive: boolean;
    excludeDatasetRunConversations: boolean;
  }) => {
    try {
      const result = await createEvaluationRunConfigAction(tenantId, projectId, {
        name: data.name,
        description: data.description,
        isActive: data.isActive,
        excludeDatasetRunConversations: data.excludeDatasetRunConversations,
        suiteConfigIds: [],
      });

      if (!result.success) {
        toast.error(result.error || 'Failed to create evaluation run config');
        return;
      }

      // Reload evaluation run configs
      const evalRunConfigsResult = await fetchEvaluationRunConfigs(tenantId, projectId);
      if (evalRunConfigsResult.data) {
        setAvailableEvaluationRunConfigs(evalRunConfigsResult.data);
        // Find the newly created config and select it
        // Sort by createdAt descending to get the most recent one
        const sortedConfigs = [...evalRunConfigsResult.data].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        const newConfig = sortedConfigs.find(
          (config) => config.name === data.name && config.description === data.description
        );
        if (newConfig) {
          const currentIds = evaluationRunConfigIds || [];
          setEvaluationRunConfigIds([...currentIds, newConfig.id]);
          const currentConfigs = evaluationRunConfigs || [];
          setEvaluationRunConfigs([...currentConfigs, { id: newConfig.id, enabled: true }]);
          // Auto-enable triggerEvaluations when a new evaluation run config is created and added
          form.setValue('triggerEvaluations', true);
        }
      }

      setIsCreateEvalRunConfigOpen(false);
      evaluationRunConfigForm.reset();
      toast.success('Evaluation run config created');
    } catch (error) {
      console.error('Error creating evaluation run config:', error);
      toast.error('Failed to create evaluation run config');
    }
  };

  const triggerEvaluations = form.watch('triggerEvaluations');

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

        <FormField
          control={form.control}
          name="triggerEvaluations"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Trigger Evaluations</FormLabel>
                <FormDescription>
                  Automatically trigger evaluations for conversations created during this dataset
                  run.
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        {triggerEvaluations && (
          <FormField
            control={form.control}
            name="evaluationRunConfigIds"
            render={() => (
              <FormItem>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <FormLabel className="text-base">Evaluation Run Configs</FormLabel>
                    <div className="text-sm text-muted-foreground mt-1">
                      Select which evaluation run configs to use for automatic evaluations
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCreateEvalRunConfigOpen(true)}
                    className="h-8"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    New Evaluation Run Config
                  </Button>
                </div>
                {loadingEvalRunConfigs ? (
                  <p className="text-sm text-muted-foreground">Loading evaluation run configs...</p>
                ) : availableEvaluationRunConfigs.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4 rounded-lg border p-4">
                    No evaluation run configs available. Click &quot;New Evaluation Run Config&quot;
                    to create one.
                  </div>
                ) : (
                  <ScrollArea className="h-48 w-full rounded-md border p-4">
                    <div className="space-y-3">
                      {availableEvaluationRunConfigs.map((evalRunConfig) => {
                        // Check if this eval run config is in the list and enabled
                        const relation = evaluationRunConfigs?.find(
                          (config) => config.id === evalRunConfig.id
                        );
                        const isEnabled = relation?.enabled === true;

                        return (
                          <div key={evalRunConfig.id} className="flex items-start space-x-3">
                            <Checkbox
                              id={`eval-run-config-${evalRunConfig.id}`}
                              checked={isEnabled}
                              onCheckedChange={(checked) =>
                                handleEvaluationRunConfigToggle(evalRunConfig.id, checked === true)
                              }
                            />
                            <label
                              htmlFor={`eval-run-config-${evalRunConfig.id}`}
                              className="flex-1 cursor-pointer text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              <div className="font-medium">{evalRunConfig.name}</div>
                              <div className="text-muted-foreground text-xs mt-1 line-clamp-2">
                                {evalRunConfig.description || 'No description'}
                              </div>
                              <div className="text-muted-foreground text-xs mt-1">
                                {evalRunConfig.isActive ? (
                                  <span className="text-green-600">Active</span>
                                ) : (
                                  <span className="text-gray-500">Inactive</span>
                                )}
                              </div>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Nested dialog for creating evaluation run configs */}
        <Dialog open={isCreateEvalRunConfigOpen} onOpenChange={setIsCreateEvalRunConfigOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Evaluation Run Config</DialogTitle>
              <DialogDescription>
                Create a new evaluation run config that will automatically trigger evaluations for
                matching conversations.
              </DialogDescription>
            </DialogHeader>

            <Form {...evaluationRunConfigForm}>
              <form
                onSubmit={evaluationRunConfigForm.handleSubmit(handleCreateEvaluationRunConfig)}
                className="space-y-4"
              >
                <GenericInput
                  control={evaluationRunConfigForm.control}
                  name="name"
                  label="Name"
                  description="A descriptive name for this evaluation run config"
                  placeholder="e.g., Production Quality Checks"
                  isRequired
                />

                <GenericTextarea
                  control={evaluationRunConfigForm.control}
                  name="description"
                  label="Description"
                  description="Describe what this evaluation run config does"
                  placeholder="Automatically evaluates all production conversations..."
                  isRequired
                />

                <FormField
                  control={evaluationRunConfigForm.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active</FormLabel>
                        <div className="text-sm text-muted-foreground">
                          When active, evaluations will automatically trigger for matching
                          conversations
                        </div>
                      </div>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormItem>
                  )}
                />

                <FormField
                  control={evaluationRunConfigForm.control}
                  name="excludeDatasetRunConversations"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Exclude Dataset Run Conversations</FormLabel>
                        <div className="text-sm text-muted-foreground">
                          When enabled, evaluations will only run on regular conversations, not
                          conversations created from dataset runs
                        </div>
                      </div>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsCreateEvalRunConfigOpen(false);
                      evaluationRunConfigForm.reset();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={evaluationRunConfigForm.formState.isSubmitting}>
                    {evaluationRunConfigForm.formState.isSubmitting ? 'Creating...' : 'Create'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

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
