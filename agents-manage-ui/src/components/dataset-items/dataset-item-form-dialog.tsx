'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import {
  type ActionResult,
  createDatasetItemAction,
  updateDatasetItemAction,
} from '@/lib/actions/dataset-items';
import type { DatasetItem } from '@/lib/api/dataset-items';
import { ExpectedOutputForm } from './expected-output-form';
import { MessagesInputForm } from './messages-input-form';
import { SimulationAgentForm } from './simulation-agent-form';
import { type DatasetItemFormData, datasetItemSchema } from './validation';

interface DatasetItemFormDialogProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  itemId?: string;
  initialData?: DatasetItem;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
}

const formatFormData = (data?: DatasetItem): DatasetItemFormData => {
  if (!data) {
    return {
      input: '',
      expectedOutput: '',
      simulationAgent: null,
    };
  }

  // Parse simulationAgent from JSON to object if it exists
  let simulationAgent: DatasetItemFormData['simulationAgent'] = null;
  if (data.simulationAgent) {
    // If it's already an object, use it directly
    if (typeof data.simulationAgent === 'object' && data.simulationAgent !== null) {
      simulationAgent = {
        prompt: (data.simulationAgent as any).prompt || '',
        model: {
          model: (data.simulationAgent as any).model?.model || '',
          providerOptions: (data.simulationAgent as any).model?.providerOptions || undefined,
        },
        stopWhen: (data.simulationAgent as any).stopWhen || {},
      };
    } else if (typeof data.simulationAgent === 'string') {
      // If it's a string, try to parse it
      try {
        const parsed = JSON.parse(data.simulationAgent);
        simulationAgent = {
          prompt: parsed.prompt || '',
          model: {
            model: parsed.model?.model || '',
            providerOptions: parsed.model?.providerOptions || undefined,
          },
          stopWhen: parsed.stopWhen || {},
        };
      } catch {
        // If parsing fails, keep as string for fallback
        simulationAgent = data.simulationAgent as any;
      }
    }
  }

  return {
    input: data.input ? JSON.stringify(data.input, null, 2) : '',
    expectedOutput: data.expectedOutput ? JSON.stringify(data.expectedOutput, null, 2) : '',
    simulationAgent,
  };
};

export function DatasetItemFormDialog({
  tenantId,
  projectId,
  datasetId,
  itemId,
  initialData,
  isOpen: controlledIsOpen,
  onOpenChange,
  trigger,
}: DatasetItemFormDialogProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = trigger ? internalIsOpen : controlledIsOpen;
  const setIsOpen = trigger ? setInternalIsOpen : onOpenChange;
  const form = useForm<DatasetItemFormData>({
    resolver: zodResolver(datasetItemSchema),
    defaultValues: formatFormData(initialData),
  });

  useEffect(() => {
    if (isOpen) {
      form.reset(formatFormData(initialData));
    }
  }, [isOpen, initialData, form]);

  const { isSubmitting } = form.formState;

  const parseJsonField = (value: string): unknown | null => {
    if (!value?.trim()) {
      return null;
    }
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const onSubmit = async (data: DatasetItemFormData) => {
    // Double-check validation before proceeding
    const isValid = await form.trigger();
    if (!isValid) {
      // Form validation failed - errors should be displayed
      const firstError = Object.keys(form.formState.errors)[0];
      if (firstError) {
        const errorElement = document
          .querySelector(`[name="${firstError}"]`)
          ?.closest('.space-y-4, .space-y-6');
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      return;
    }

    try {
      // Validate that input is provided and has at least one message
      if (!data.input?.trim()) {
        toast.error('Input is required. Please add at least one message.');
        return;
      }

      const parsedInput = parseJsonField(data.input) as DatasetItem['input'];
      if (!parsedInput || !parsedInput.messages || parsedInput.messages.length === 0) {
        toast.error('Input must contain at least one message.');
        return;
      }

      // Handle simulationAgent - it might be an object or a string
      let simulationAgent: DatasetItem['simulationAgent'] = null;
      if (data.simulationAgent) {
        if (typeof data.simulationAgent === 'string') {
          simulationAgent = parseJsonField(data.simulationAgent) as DatasetItem['simulationAgent'];
        } else if (typeof data.simulationAgent === 'object' && data.simulationAgent !== null) {
          // Check if the object has any meaningful values - if not, set to null (optional)
          const hasPrompt = data.simulationAgent.prompt?.trim() || '';
          const hasModel = data.simulationAgent.model?.model?.trim() || '';
          const hasStopWhen =
            data.simulationAgent.stopWhen &&
            ((data.simulationAgent.stopWhen.transferCountIs !== null &&
              data.simulationAgent.stopWhen.transferCountIs !== undefined) ||
              (data.simulationAgent.stopWhen.stepCountIs !== null &&
                data.simulationAgent.stopWhen.stepCountIs !== undefined));

          // If any field is configured, validate that both prompt and model are present
          if (hasPrompt || hasModel || hasStopWhen) {
            if (!hasPrompt || !hasModel) {
              // Validation error - trigger form validation to show errors and prevent submission
              const isValid = await form.trigger('simulationAgent');
              if (!isValid) {
                // Scroll to the error
                const errorElement = document.querySelector('[data-slot="form-message"]');
                if (errorElement) {
                  errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return;
              }
              // If validation somehow passed but we still don't have both, don't submit
              return;
            }
            // It has values, ensure model.model is a valid string
            const modelValue = data.simulationAgent.model?.model?.trim();
            if (!modelValue) {
              // This shouldn't happen if validation passed, but double-check
              await form.trigger('simulationAgent');
              return;
            }
            // Clean up the object - remove any null/undefined values
            const cleaned = {
              prompt: data.simulationAgent.prompt?.trim() || '',
              model: {
                model: modelValue,
                ...(data.simulationAgent.model?.providerOptions && {
                  providerOptions: data.simulationAgent.model.providerOptions,
                }),
              },
              ...(data.simulationAgent.stopWhen && {
                stopWhen: data.simulationAgent.stopWhen,
              }),
            };
            simulationAgent = cleaned as DatasetItem['simulationAgent'];
          } else {
            // All fields are empty, treat as null (optional)
            simulationAgent = null;
          }
        }
      }

      const payload = {
        input: parsedInput,
        expectedOutput: parseJsonField(data.expectedOutput || '') as DatasetItem['expectedOutput'],
        simulationAgent,
      };

      let result: ActionResult;
      if (itemId) {
        result = await updateDatasetItemAction(tenantId, projectId, datasetId, itemId, payload);
        if (result.success) {
          toast.success('Dataset item updated');
        } else {
          toast.error(result.error || 'Failed to update dataset item');
          return;
        }
      } else {
        result = await createDatasetItemAction(tenantId, projectId, datasetId, payload);
        if (result.success) {
          toast.success('Dataset item created');
        } else {
          toast.error(result.error || 'Failed to create dataset item');
          return;
        }
      }

      onOpenChange(false);
      form.reset();
    } catch (error) {
      console.error('Error submitting dataset item:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      toast.error(errorMessage);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{itemId ? 'Edit Dataset Item' : 'Create Dataset Item'}</DialogTitle>
          <DialogDescription>
            Define the input messages, expected output, and optional simulation configuration for
            this test case.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="input"
              render={() => (
                <FormItem>
                  <MessagesInputForm
                    control={form.control}
                    name="input"
                    label="Input"
                    description="Messages to send to the agent, with optional headers"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="expectedOutput"
              render={() => (
                <FormItem>
                  <ExpectedOutputForm
                    control={form.control}
                    name="expectedOutput"
                    label="Expected Output"
                    description="Expected response messages from the agent (optional)"
                  />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="simulationAgent"
              render={() => (
                <FormItem>
                  <SimulationAgentForm control={form.control} />
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {itemId ? 'Update' : 'Create'} Item
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
