'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ComponentSelector } from '@/components/agent/sidepane/nodes/component-selector/component-selector';
import { DatePickerWithPresets } from '@/components/traces/filters/date-picker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { createEvaluationJobConfigAction } from '@/lib/actions/evaluation-job-configs';
import type { Evaluator } from '@/lib/api/evaluators';
import { useEvaluatorsQuery } from '@/lib/query/evaluators';
import { toast } from '@/lib/toast';
import { type EvaluationJobConfigFormData, evaluationJobConfigSchema } from './validation';

interface EvaluationJobFormDialogProps {
  tenantId: string;
  projectId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export function EvaluationJobFormDialog({
  tenantId,
  projectId,
  isOpen: controlledIsOpen,
  onOpenChange,
  trigger,
}: EvaluationJobFormDialogProps) {
  const router = useRouter();
  const [internalIsOpen, setInternalIsOpen] = useState(false);

  const isOpen = trigger ? internalIsOpen : controlledIsOpen;
  const setIsOpen = trigger ? setInternalIsOpen : onOpenChange;
  const { data: evaluators, isFetching } = useEvaluatorsQuery({ enabled: isOpen });

  const defaultFormData: EvaluationJobConfigFormData = {
    jobFilters: null,
    evaluatorIds: [],
  };

  const form = useForm<EvaluationJobConfigFormData>({
    resolver: zodResolver(evaluationJobConfigSchema),
    defaultValues: defaultFormData,
  });

  useEffect(() => {
    if (isOpen) {
      form.reset(defaultFormData);
    }
  }, [isOpen, form]);

  const { isSubmitting } = form.formState;
  const selectedEvaluatorIds = form.watch('evaluatorIds') || [];
  const jobFilters = form.watch('jobFilters');

  const evaluatorLookup = useMemo(() => {
    return evaluators.reduce(
      (acc, evaluator) => {
        acc[evaluator.id] = evaluator;
        return acc;
      },
      {} as Record<string, Evaluator>
    );
  }, [evaluators]);

  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const datePickerValue =
    customStartDate && customEndDate ? { from: customStartDate, to: customEndDate } : undefined;

  const setCustomDateRange = (start: string, end: string) => {
    setCustomStartDate(start);
    setCustomEndDate(end);

    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      form.setValue('jobFilters', {
        ...jobFilters,
        dateRange: {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
        },
      });
    } else {
      form.setValue('jobFilters', {
        ...jobFilters,
        dateRange: undefined,
      });
    }
  };

  const handleRemoveDateRange = () => {
    setCustomStartDate('');
    setCustomEndDate('');
    form.setValue('jobFilters', {
      ...jobFilters,
      dateRange: undefined,
    });
  };

  const onSubmit = async (data: EvaluationJobConfigFormData) => {
    const isValid = await form.trigger();
    if (!isValid) {
      return;
    }

    try {
      let jobFilters = data.jobFilters;

      // Transform date strings to ISO timestamps with proper timezone handling
      if (jobFilters?.dateRange?.startDate && jobFilters?.dateRange?.endDate) {
        const [sy, sm, sd] = jobFilters.dateRange.startDate.split('-').map(Number);
        const [ey, em, ed] = jobFilters.dateRange.endDate.split('-').map(Number);

        // Start of day in local timezone (00:00:00.000)
        const startDate = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
        // End of day in local timezone (23:59:59.999)
        const endDate = new Date(ey, em - 1, ed, 23, 59, 59, 999);

        jobFilters = {
          ...jobFilters,
          dateRange: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        };
      }

      const payload = {
        jobFilters: jobFilters || null,
        evaluatorIds: data.evaluatorIds,
      };

      const result = await createEvaluationJobConfigAction(tenantId, projectId, payload);
      if (result.success && result.data) {
        toast.success('Batch evaluation created');
        setIsOpen(false);
        form.reset();
        router.push(`/${tenantId}/projects/${projectId}/evaluations/jobs/${result.data.id}`);
      } else {
        toast.error(result.error || 'Failed to create batch evaluation');
      }
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
          <DialogTitle>Create Batch Evaluation</DialogTitle>
          <DialogDescription>
            Configure a one-off batch evaluation to evaluate conversations based on filters.
          </DialogDescription>
        </DialogHeader>

        {isFetching ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="evaluatorIds"
                render={() => (
                  <FormItem>
                    <ComponentSelector
                      label="Evaluators"
                      componentLookup={evaluatorLookup}
                      selectedComponents={selectedEvaluatorIds}
                      onSelectionChange={(newSelection) => {
                        form.setValue('evaluatorIds', newSelection);
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

              <div className="space-y-4">
                <Label>Filters</Label>
                <div className="space-y-4 border rounded-lg p-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Date Range</Label>
                    <DatePickerWithPresets
                      label="Date range"
                      value={datePickerValue}
                      onAdd={() => {}}
                      onRemove={handleRemoveDateRange}
                      setCustomDateRange={setCustomDateRange}
                      showCalendarDirectly
                      placeholder="Select date range"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  Create Batch Evaluation
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
