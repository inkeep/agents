'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
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
  onSuccess?: () => void;
}

const formatFormData = (data?: DatasetItem): DatasetItemFormData => {
  if (!data) {
    return {
      input: '',
      expectedOutput: '',
    };
  }

  return {
    input: data.input ? JSON.stringify(data.input, null, 2) : '',
    expectedOutput: data.expectedOutput ? JSON.stringify(data.expectedOutput, null, 2) : '',
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
  onSuccess,
}: DatasetItemFormDialogProps) {
  const router = useRouter();
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
    const isValid = await form.trigger();
    if (!isValid) {
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
      if (!data.input?.trim()) {
        toast.error('Input is required. Please add at least one message.');
        return;
      }

      const parsedInput = parseJsonField(data.input) as DatasetItem['input'];
      if (!parsedInput || !parsedInput.messages || parsedInput.messages.length === 0) {
        toast.error('Input must contain at least one message.');
        return;
      }

      const payload = {
        input: parsedInput,
        expectedOutput: parseJsonField(data.expectedOutput || '') as DatasetItem['expectedOutput'],
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

      setIsOpen(false);
      form.reset();
      router.refresh();
      onSuccess?.();
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
          <DialogTitle>{itemId ? 'Edit Test Suite Item' : 'Create Test Suite Item'}</DialogTitle>
          <DialogDescription>
            Define the input messages and expected output for this test case.
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

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
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
