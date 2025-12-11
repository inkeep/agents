'use client';

import { zodResolver } from '@hookform/resolvers/zod';
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
import type { Evaluator } from '@/lib/api/evaluators';
import { fetchEvaluators } from '@/lib/api/evaluators';
import type { Agent } from '@/lib/types/agent-full';

const evaluationRunConfigSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
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
  evaluatorIds: z.array(z.string()),
  agentIds: z.array(z.string()),
  sampleRate: z.number().min(0).max(1).optional(),
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
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);

  const isOpen = trigger ? internalIsOpen : controlledIsOpen;
  const setIsOpen = trigger ? setInternalIsOpen : onOpenChange;

  const form = useForm<EvaluationRunConfigFormData>({
    resolver: zodResolver(evaluationRunConfigSchema),
    defaultValues: formatFormData(initialData),
  });

  const suiteConfigForm = useForm<SuiteConfigFormData>({
    resolver: zodResolver(suiteConfigSchema),
    defaultValues: {
      evaluatorIds: [],
      agentIds: [],
      sampleRate: undefined,
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset(formatFormData(initialData));
      loadData();
    }
  }, [isOpen, initialData]);

  const loadData = async () => {
    try {
      const [evaluatorsRes, agentsRes] = await Promise.all([
        fetchEvaluators(tenantId, projectId),
        fetchAgents(tenantId, projectId),
      ]);
      setEvaluators(evaluatorsRes.data || []);
      setAgents(agentsRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
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

  const onSubmit = async (data: EvaluationRunConfigFormData) => {
    const formValid = await form.trigger();
    const suiteConfigFormValid = await suiteConfigForm.trigger();
    
    if (!formValid || !suiteConfigFormValid) {
      return;
    }

    try {
      // First, create the evaluation suite config
      const suiteConfigData = suiteConfigForm.getValues();
      const filters: Record<string, unknown> | null =
        suiteConfigData.agentIds && suiteConfigData.agentIds.length > 0 
          ? { agentIds: suiteConfigData.agentIds } 
          : null;

      const suiteConfigResult = await createEvaluationSuiteConfigAction(tenantId, projectId, {
        evaluatorIds: suiteConfigData.evaluatorIds,
        filters,
        sampleRate: suiteConfigData.sampleRate,
      });

      if (!suiteConfigResult.success || !suiteConfigResult.data) {
        toast.error(suiteConfigResult.error || 'Failed to create evaluation plan');
        return;
      }

      // Then create the run config with the new suite config ID
      const payload = {
        name: data.name,
        description: data.description,
        isActive: data.isActive,
        suiteConfigIds: [suiteConfigResult.data.id],
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
        suiteConfigForm.reset();
        // Close dialog
        if (trigger) {
          setInternalIsOpen(false);
        } else {
          onOpenChange?.(false);
        }
        // Call success callback to refresh data
        if (onSuccess) {
          console.log('Calling onSuccess callback');
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

            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <h3 className="text-base font-semibold">Evaluation Configuration</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Configure what and how to evaluate
                </p>
              </div>

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
                              checked={(suiteConfigForm.watch('agentIds') || []).includes(agent.id)}
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
                        Select evaluators to use
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
                              checked={(suiteConfigForm.watch('evaluatorIds') || []).includes(evaluator.id)}
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

              <GenericInput
                control={suiteConfigForm.control}
                name="sampleRate"
                label="Sample Rate"
                type="number"
                placeholder="0.1"
                description="Sample rate for evaluation (0.0 to 1.0). For example, 0.1 means 10% of conversations will be evaluated."
              />
            </div>

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
      </DialogContent>
    </Dialog>
  );
}
