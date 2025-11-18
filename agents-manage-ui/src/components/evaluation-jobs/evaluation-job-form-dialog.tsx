'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createEvaluationJobConfigAction,
  updateEvaluationJobConfigAction,
} from '@/lib/actions/evaluation-job-configs';
import type { ActionResult } from '@/lib/actions/types';
import type { EvaluationJobConfig } from '@/lib/api/evaluation-job-configs';
import type { Evaluator } from '@/lib/api/evaluators';
import { fetchEvaluators } from '@/lib/api/evaluators';
import { type EvaluationJobConfigFormData, evaluationJobConfigSchema } from './validation';

interface EvaluationJobFormDialogProps {
  tenantId: string;
  projectId: string;
  jobConfigId?: string;
  initialData?: EvaluationJobConfig;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
}

const formatFormData = (data?: EvaluationJobConfig): EvaluationJobConfigFormData => {
  if (!data) {
    return {
      jobFilters: null,
      evaluatorIds: [],
    };
  }

  const jobFilters = data.jobFilters || null;
  const evaluatorIds: string[] = [];

  return {
    jobFilters,
    evaluatorIds,
  };
};

export function EvaluationJobFormDialog({
  tenantId,
  projectId,
  jobConfigId,
  initialData,
  isOpen: controlledIsOpen,
  onOpenChange,
  trigger,
}: EvaluationJobFormDialogProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [loading, setLoading] = useState(false);

  const isOpen = trigger ? internalIsOpen : controlledIsOpen;
  const setIsOpen = trigger ? setInternalIsOpen : onOpenChange;

  const form = useForm<EvaluationJobConfigFormData>({
    resolver: zodResolver(evaluationJobConfigSchema),
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
      const evaluatorsRes = await fetchEvaluators(tenantId, projectId);
      setEvaluators(evaluatorsRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const { isSubmitting } = form.formState;
  const selectedEvaluatorIds = form.watch('evaluatorIds') || [];
  const jobFilters = form.watch('jobFilters');

  const toggleEvaluator = (evaluatorId: string) => {
    const current = selectedEvaluatorIds;
    const newIds = current.includes(evaluatorId)
      ? current.filter((id) => id !== evaluatorId)
      : [...current, evaluatorId];
    form.setValue('evaluatorIds', newIds);
  };

  const onSubmit = async (data: EvaluationJobConfigFormData) => {
    const isValid = await form.trigger();
    if (!isValid) {
      return;
    }

    try {
      const payload = {
        jobFilters: data.jobFilters || null,
        evaluatorIds: data.evaluatorIds,
      };

      let result: ActionResult<EvaluationJobConfig>;
      if (jobConfigId) {
        result = await updateEvaluationJobConfigAction(tenantId, projectId, jobConfigId, payload);
        if (result.success) {
          toast.success('Batch evaluation updated');
        } else {
          toast.error(result.error || 'Failed to update batch evaluation');
          return;
        }
      } else {
        result = await createEvaluationJobConfigAction(tenantId, projectId, payload);
        if (result.success) {
          toast.success('Batch evaluation created');
        } else {
          toast.error(result.error || 'Failed to create batch evaluation');
          return;
        }
      }

      onOpenChange(false);
      form.reset();
    } catch (error) {
      console.error('Error submitting batch evaluation:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      toast.error(errorMessage);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-3xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {jobConfigId ? 'Edit Batch Evaluation' : 'Create Batch Evaluation'}
          </DialogTitle>
          <DialogDescription>
            Configure a one-off batch evaluation to evaluate conversations based on filters.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="evaluatorIds"
                render={() => (
                  <FormItem>
                    <FormLabel isRequired>Evaluators</FormLabel>
                    <div className="space-y-2">
                      {evaluators.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No evaluators available. Create an evaluator first.
                        </p>
                      ) : (
                        <div className="border rounded-lg p-4 max-h-64 overflow-y-auto">
                          {evaluators.map((evaluator) => (
                            <div key={evaluator.id} className="flex items-center space-x-2 py-2">
                              <Checkbox
                                checked={selectedEvaluatorIds.includes(evaluator.id)}
                                onCheckedChange={() => toggleEvaluator(evaluator.id)}
                              />
                              <Label className="font-normal cursor-pointer flex-1">
                                <div>
                                  <div className="font-medium">{evaluator.name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {evaluator.description}
                                  </div>
                                </div>
                              </Label>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4">
                <Label>Filters</Label>
                <div className="space-y-4 border rounded-lg p-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Date Range</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">Start Date</Label>
                        <Input
                          type="date"
                          value={jobFilters?.dateRange?.startDate || ''}
                          onChange={(e) => {
                            form.setValue('jobFilters', {
                              ...jobFilters,
                              dateRange: {
                                startDate: e.target.value,
                                endDate: jobFilters?.dateRange?.endDate || '',
                              },
                            });
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">End Date</Label>
                        <Input
                          type="date"
                          value={jobFilters?.dateRange?.endDate || ''}
                          onChange={(e) => {
                            form.setValue('jobFilters', {
                              ...jobFilters,
                              dateRange: {
                                startDate: jobFilters?.dateRange?.startDate || '',
                                endDate: e.target.value,
                              },
                            });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {jobConfigId ? 'Update' : 'Create'} Batch Evaluation
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
