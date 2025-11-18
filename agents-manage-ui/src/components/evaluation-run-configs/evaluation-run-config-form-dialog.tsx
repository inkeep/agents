'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import {
  createEvaluationRunConfigAction,
  updateEvaluationRunConfigAction,
} from '@/lib/actions/evaluation-run-configs';
import { createEvaluationSuiteConfigAction } from '@/lib/actions/evaluation-suite-configs';
import type { ActionResult } from '@/lib/actions/types';
import { fetchAgents } from '@/lib/api/agent-full-client';
import type { EvaluationRunConfig } from '@/lib/api/evaluation-run-configs';
import type { EvaluationSuiteConfig } from '@/lib/api/evaluation-suite-configs';
import { fetchEvaluationSuiteConfigs } from '@/lib/api/evaluation-suite-configs';
import type { Evaluator } from '@/lib/api/evaluators';
import { fetchEvaluators } from '@/lib/api/evaluators';
import type { Agent } from '@/lib/types/agent-full';
import { SuiteConfigDetailsPopover } from './suite-config-details-popover';

const evaluationRunConfigSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().min(1, 'Description is required'),
  isActive: z.boolean(),
  suiteConfigIds: z.array(z.string()),
});

type EvaluationRunConfigFormData = z.infer<typeof evaluationRunConfigSchema>;

interface EvaluationRunConfigFormDialogProps {
  tenantId: string;
  projectId: string;
  runConfigId?: string;
  initialData?: EvaluationRunConfig;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

const formatFormData = (data?: EvaluationRunConfig): EvaluationRunConfigFormData => {
  if (!data) {
    return {
      name: '',
      description: '',
      isActive: true,
      suiteConfigIds: [],
    };
  }

  return {
    name: data.name,
    description: data.description,
    isActive: data.isActive !== false,
    suiteConfigIds: data.suiteConfigIds || [],
  };
};

const suiteConfigSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().min(1, 'Description is required'),
  evaluatorIds: z.array(z.string()),
  agentIds: z.array(z.string()),
});

type SuiteConfigFormData = z.infer<typeof suiteConfigSchema>;

export function EvaluationRunConfigFormDialog({
  tenantId,
  projectId,
  runConfigId,
  initialData,
  isOpen: controlledIsOpen,
  onOpenChange,
  trigger,
  onSuccess,
}: EvaluationRunConfigFormDialogProps) {
  const router = useRouter();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [suiteConfigs, setSuiteConfigs] = useState<EvaluationSuiteConfig[]>([]);
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateSuiteConfigOpen, setIsCreateSuiteConfigOpen] = useState(false);

  const isOpen = trigger ? internalIsOpen : controlledIsOpen;
  const setIsOpen = trigger ? setInternalIsOpen : onOpenChange;

  const suiteConfigForm = useForm<SuiteConfigFormData>({
    resolver: zodResolver(suiteConfigSchema),
    defaultValues: {
      name: '',
      description: '',
      evaluatorIds: [],
      agentIds: [],
    },
  });

  const form = useForm<EvaluationRunConfigFormData>({
    resolver: zodResolver(evaluationRunConfigSchema),
    defaultValues: formatFormData(initialData),
  });

  useEffect(() => {
    if (isOpen) {
      form.reset(formatFormData(initialData));
      loadData();
    }
  }, [isOpen, initialData]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [suiteConfigsRes, evaluatorsRes, agentsRes] = await Promise.all([
        fetchEvaluationSuiteConfigs(tenantId, projectId),
        fetchEvaluators(tenantId, projectId),
        fetchAgents(tenantId, projectId),
      ]);
      setSuiteConfigs(suiteConfigsRes.data || []);
      setEvaluators(evaluatorsRes.data || []);
      setAgents(agentsRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSuiteConfig = async (data: SuiteConfigFormData) => {
    const isValid = await suiteConfigForm.trigger();
    if (!isValid) {
      return;
    }

    try {
      const filters: Record<string, unknown> | null =
        data.agentIds && data.agentIds.length > 0 ? { agentIds: data.agentIds } : null;

      const result = await createEvaluationSuiteConfigAction(tenantId, projectId, {
        name: data.name,
        description: data.description,
        evaluatorIds: data.evaluatorIds,
        filters,
      });

      if (result.success && result.data) {
        toast.success('Evaluation plan created');
        setIsCreateSuiteConfigOpen(false);
        suiteConfigForm.reset();

        // Reload suite configs
        await loadData();

        // Auto-select the newly created suite config
        const currentIds = form.getValues('suiteConfigIds') || [];
        form.setValue('suiteConfigIds', [...currentIds, result.data.id]);
      } else {
        toast.error(result.error || 'Failed to create evaluation plan');
      }
    } catch (error) {
      console.error('Error creating suite config:', error);
      toast.error('An unexpected error occurred');
    }
  };

  const toggleEvaluator = (evaluatorId: string) => {
    const current = suiteConfigForm.watch('evaluatorIds') || [];
    const newIds = current.includes(evaluatorId)
      ? current.filter((id) => id !== evaluatorId)
      : [...current, evaluatorId];
    suiteConfigForm.setValue('evaluatorIds', newIds);
  };

  const toggleAgent = (agentId: string) => {
    const current = suiteConfigForm.watch('agentIds') || [];
    const newIds = current.includes(agentId)
      ? current.filter((id) => id !== agentId)
      : [...current, agentId];
    suiteConfigForm.setValue('agentIds', newIds);
  };

  const { isSubmitting } = form.formState;
  const selectedSuiteConfigIds = form.watch('suiteConfigIds') || [];

  const toggleSuiteConfig = (suiteConfigId: string) => {
    const current = selectedSuiteConfigIds;
    const newIds = current.includes(suiteConfigId)
      ? current.filter((id) => id !== suiteConfigId)
      : [...current, suiteConfigId];
    form.setValue('suiteConfigIds', newIds);
  };

  const onSubmit = async (data: EvaluationRunConfigFormData) => {
    const isValid = await form.trigger();
    if (!isValid) {
      return;
    }

    try {
      const payload = {
        name: data.name,
        description: data.description,
        isActive: data.isActive,
        suiteConfigIds: data.suiteConfigIds,
      };

      let result: ActionResult<EvaluationRunConfig>;
      if (runConfigId) {
        result = await updateEvaluationRunConfigAction(tenantId, projectId, runConfigId, payload);
      } else {
        result = await createEvaluationRunConfigAction(tenantId, projectId, payload);
      }

      if (result.success) {
        console.log('Run config created/updated successfully');
        toast.success(`Continuous test ${runConfigId ? 'updated' : 'created'}`);
        form.reset();
        // Close dialog
        if (trigger) {
          setInternalIsOpen(false);
        } else {
          onOpenChange?.(false);
        }
        // Call success callback to refresh data (this is the key one)
        if (onSuccess) {
          console.log('Calling onSuccess callback');
          // Call onSuccess which will trigger the refresh in the list
          onSuccess();
        } else {
          console.log('No onSuccess callback provided');
        }
        // Also refresh router for server components
        router.refresh();
      } else {
        toast.error(
          result.error || `Failed to ${runConfigId ? 'update' : 'create'} continuous test`
        );
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      toast.error('An unexpected error occurred');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-3xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {runConfigId ? 'Edit Continuous Test' : 'Create Continuous Test'}
          </DialogTitle>
          <DialogDescription>
            Automatically run evaluations when conversations complete. Link evaluation plans to
            define which evaluations to run.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <GenericInput
              control={form.control}
              name="name"
              label="Name"
              description="A descriptive name for this continuous test"
              placeholder="e.g., Production Quality Checks"
              isRequired
            />

            <GenericTextarea
              control={form.control}
              name="description"
              label="Description"
              placeholder="Automatically evaluates all production conversations..."
              isRequired
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active</FormLabel>
                    <div className="text-sm text-muted-foreground">
                      When active, evaluations will automatically trigger for matching conversations
                    </div>
                  </div>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="suiteConfigIds"
              render={() => (
                <FormItem>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <FormLabel className="text-base">Evaluation Plans</FormLabel>
                      <div className="text-sm text-muted-foreground mt-1">
                        Select which evaluation plans to use for automatic evaluations
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsCreateSuiteConfigOpen(true)}
                      className="h-8"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      New Evaluation Plan
                    </Button>
                  </div>
                  <div className="rounded-lg border p-4 space-y-3 max-h-64 overflow-y-auto">
                    {loading ? (
                      <div className="text-sm text-muted-foreground">
                        Loading evaluation plans...
                      </div>
                    ) : suiteConfigs.length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-4">
                        No evaluation plans available. Click &quot;New Evaluation Plan&quot; to
                        create one.
                      </div>
                    ) : (
                      suiteConfigs.map((suiteConfig) => (
                        <div key={suiteConfig.id} className="flex items-start space-x-3">
                          <Checkbox
                            checked={selectedSuiteConfigIds.includes(suiteConfig.id)}
                            onCheckedChange={() => toggleSuiteConfig(suiteConfig.id)}
                            id={`suite-${suiteConfig.id}`}
                          />
                          <label
                            htmlFor={`suite-${suiteConfig.id}`}
                            className="flex-1 cursor-pointer text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            <div className="font-medium">{suiteConfig.name}</div>
                            <div className="text-muted-foreground text-xs mt-1 line-clamp-2">
                              {suiteConfig.description || 'No description'}
                            </div>
                          </label>
                          <SuiteConfigDetailsPopover
                            tenantId={tenantId}
                            projectId={projectId}
                            suiteConfigId={suiteConfig.id}
                            suiteConfigName={suiteConfig.name}
                          />
                        </div>
                      ))
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : runConfigId ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Form>

        {/* Nested dialog for creating suite configs */}
        <Dialog open={isCreateSuiteConfigOpen} onOpenChange={setIsCreateSuiteConfigOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Evaluation Plan</DialogTitle>
              <DialogDescription>
                Create a new evaluation plan that defines what to evaluate and which evaluators to
                use.
              </DialogDescription>
            </DialogHeader>

            <Form {...suiteConfigForm}>
              <form
                onSubmit={suiteConfigForm.handleSubmit(handleCreateSuiteConfig)}
                className="space-y-4"
              >
                <GenericInput
                  control={suiteConfigForm.control}
                  name="name"
                  label="Name"
                  description="A descriptive name for this evaluation plan"
                  placeholder="e.g., Quality Checks"
                  isRequired
                />

                <GenericTextarea
                  control={suiteConfigForm.control}
                  name="description"
                  label="Description"
                  placeholder="Evaluates conversation quality and accuracy..."
                  isRequired
                />

                <FormField
                  control={suiteConfigForm.control}
                  name="agentIds"
                  render={() => (
                    <FormItem>
                      <div className="mb-2">
                        <FormLabel className="text-sm">Agent Filter (Optional)</FormLabel>
                        <div className="text-xs text-muted-foreground mt-1">
                          Select which agents to evaluate. Leave empty to evaluate all agents.
                        </div>
                      </div>
                      <div className="rounded-lg border p-3 space-y-2 max-h-48 overflow-y-auto">
                        {agents.length === 0 ? (
                          <div className="text-xs text-muted-foreground">No agents available.</div>
                        ) : (
                          agents.map((agent) => (
                            <div key={agent.id} className="flex items-start space-x-2">
                              <Checkbox
                                checked={(suiteConfigForm.watch('agentIds') || []).includes(
                                  agent.id
                                )}
                                onCheckedChange={() => toggleAgent(agent.id)}
                                id={`agent-${agent.id}`}
                              />
                              <label
                                htmlFor={`agent-${agent.id}`}
                                className="flex-1 cursor-pointer text-xs leading-none"
                              >
                                <div className="font-medium">{agent.name}</div>
                                <div className="text-muted-foreground text-xs mt-0.5 line-clamp-1">
                                  {agent.description || 'No description'}
                                </div>
                              </label>
                            </div>
                          ))
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={suiteConfigForm.control}
                  name="evaluatorIds"
                  render={() => (
                    <FormItem>
                      <div className="mb-2">
                        <FormLabel className="text-sm">Evaluators</FormLabel>
                        <div className="text-xs text-muted-foreground mt-1">
                          Select evaluators to use in this suite
                        </div>
                      </div>
                      <div className="rounded-lg border p-3 space-y-2 max-h-48 overflow-y-auto">
                        {evaluators.length === 0 ? (
                          <div className="text-xs text-muted-foreground">
                            No evaluators available. Create evaluators first.
                          </div>
                        ) : (
                          evaluators.map((evaluator) => (
                            <div key={evaluator.id} className="flex items-start space-x-2">
                              <Checkbox
                                checked={(suiteConfigForm.watch('evaluatorIds') || []).includes(
                                  evaluator.id
                                )}
                                onCheckedChange={() => toggleEvaluator(evaluator.id)}
                                id={`eval-${evaluator.id}`}
                              />
                              <label
                                htmlFor={`eval-${evaluator.id}`}
                                className="flex-1 cursor-pointer text-xs leading-none"
                              >
                                <div className="font-medium">{evaluator.name}</div>
                                <div className="text-muted-foreground text-xs mt-0.5 line-clamp-1">
                                  {evaluator.description || 'No description'}
                                </div>
                              </label>
                            </div>
                          ))
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateSuiteConfigOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={suiteConfigForm.formState.isSubmitting}>
                    {suiteConfigForm.formState.isSubmitting ? 'Creating...' : 'Create'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
