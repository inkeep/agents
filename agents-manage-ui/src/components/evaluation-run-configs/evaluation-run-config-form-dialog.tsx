'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { ComponentSelector } from '@/components/agent/sidepane/nodes/component-selector/component-selector';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
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
import type { EvaluationRunConfig } from '@/lib/api/evaluation-run-configs';
import type { Evaluator } from '@/lib/api/evaluators';
import { useAgentsQuery } from '@/lib/query/agents';
import {
  useEvaluationSuiteConfigEvaluatorsQuery,
  useEvaluationSuiteConfigQuery,
} from '@/lib/query/evaluation-suite-configs';
import { useEvaluatorsQuery } from '@/lib/query/evaluators';
import { toast } from '@/lib/toast';
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
  evaluatorIds: z.array(z.string()).min(1, 'At least one evaluator is required'),
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
  'use memo';
  const router = useRouter();
  const [internalIsOpen, setInternalIsOpen] = useState(false);

  const isOpen = trigger ? internalIsOpen : controlledIsOpen;
  const setIsOpen = trigger ? setInternalIsOpen : onOpenChange;
  const suiteConfigId = initialData?.suiteConfigIds?.[0];
  const { data: evaluators } = useEvaluatorsQuery({ enabled: isOpen });
  const { data: agents } = useAgentsQuery({ enabled: isOpen });
  const { data: suiteConfig, isFetching: suiteConfigFetching } = useEvaluationSuiteConfigQuery({
    suiteConfigId,
    enabled: isOpen,
  });
  const { data: suiteConfigEvaluators, isFetching: suiteConfigEvaluatorsFetching } =
    useEvaluationSuiteConfigEvaluatorsQuery({
      suiteConfigId,
      enabled: isOpen,
    });

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

  const isFormReady = isOpen && !suiteConfigFetching && !suiteConfigEvaluatorsFetching;

  useEffect(() => {
    if (!isFormReady || !suiteConfig) {
      return;
    }
    // Extract agentIds from filters
    const filters = suiteConfig.filters as { agentIds?: string[] } | null;

    suiteConfigForm.reset({
      evaluatorIds: suiteConfigEvaluators.map((e) => e.evaluatorId),
      agentIds: filters?.agentIds || [],
      sampleRate: suiteConfig.sampleRate ?? undefined,
    });
  }, [isFormReady, suiteConfig, suiteConfigEvaluators, suiteConfigForm]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    form.reset(formatFormData(initialData));
    suiteConfigForm.reset({
      evaluatorIds: [],
      agentIds: [],
      sampleRate: undefined,
    });
  }, [isOpen, initialData, form, suiteConfigForm]);

  const evaluatorLookup = evaluators.reduce<Record<string, Evaluator>>((acc, evaluator) => {
    acc[evaluator.id] = evaluator;
    return acc;
  }, {});

  const agentLookup = agents.reduce<Record<string, Agent>>((acc, agent) => {
    acc[agent.id] = agent;
    return acc;
  }, {});
  const suiteAgentIds = useWatch({ control: suiteConfigForm.control, name: 'agentIds' });
  const suiteEvaluatorIds = useWatch({ control: suiteConfigForm.control, name: 'evaluatorIds' });
  const { isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (data) => {
    const formValid = await form.trigger();
    const suiteConfigFormValid = await suiteConfigForm.trigger();

    if (!formValid || !suiteConfigFormValid) {
      return;
    }

    // Workaround for a React Compiler limitation.
    // Todo: Support value blocks (conditional, logical, optional chaining, etc) within a try/catch statement
    async function doRequest() {
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
    }

    try {
      await doRequest();
    } catch (error) {
      console.error('Error submitting form:', error);
      toast.error('An unexpected error occurred');
    }
  });

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
          <form onSubmit={onSubmit} className="space-y-6">
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
                    <ComponentSelector
                      label="Agent Filter"
                      componentLookup={agentLookup}
                      selectedComponents={suiteAgentIds}
                      onSelectionChange={(newSelection) => {
                        suiteConfigForm.setValue('agentIds', newSelection);
                      }}
                      emptyStateMessage="No agents available."
                      emptyStateActionText="Create agent"
                      emptyStateActionHref={`/${tenantId}/projects/${projectId}/agents`}
                      placeholder="Select agents to evaluate..."
                    />
                    <div className="text-xs text-muted-foreground">
                      Select which agents to evaluate. Leave empty to evaluate all agents.
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FormLabel isRequired>Evaluators</FormLabel>
                        <Badge variant="count">{suiteEvaluatorIds.length}</Badge>
                      </div>
                      <Link
                        href={`/${tenantId}/projects/${projectId}/evaluations?tab=evaluators`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({ variant: 'link', size: 'sm' })}
                      >
                        Create evaluator
                        <ArrowUpRight className="ml-1 size-3" />
                      </Link>
                    </div>
                    <ComponentSelector
                      label=""
                      componentLookup={evaluatorLookup}
                      selectedComponents={suiteEvaluatorIds}
                      onSelectionChange={(newSelection) => {
                        suiteConfigForm.setValue('evaluatorIds', newSelection);
                      }}
                      emptyStateMessage="No evaluators available."
                      emptyStateActionText="Create evaluator"
                      emptyStateActionHref={`/${tenantId}/projects/${projectId}/evaluations?tab=evaluators`}
                      placeholder="Select evaluators..."
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <GenericInput
                control={suiteConfigForm.control}
                name="sampleRate"
                label="Sample Rate"
                type="number"
                placeholder="1.0"
                description="Sample rate for evaluation (0.0 to 1.0). For example, 0.1 means 10% of conversations will be evaluated. If not set, all conversations will be evaluated."
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
