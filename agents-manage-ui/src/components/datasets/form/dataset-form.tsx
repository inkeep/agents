'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { createDatasetAction, updateDatasetAction } from '@/lib/actions/datasets';
import type { Dataset } from '@/lib/api/datasets';
import { DeleteDatasetConfirmation } from '../delete-dataset-confirmation';
import { type DatasetFormData, datasetSchema } from './validation';

interface DatasetFormProps {
  tenantId: string;
  projectId: string;
  id?: string;
  initialData?: DatasetFormData;
}

const formatFormData = (data?: DatasetFormData): DatasetFormData => {
  if (!data) {
    return {
      name: '',
      description: '',
    };
  }

  return {
    name: data.name || '',
    description: data.description || '',
  };
};

export function DatasetForm({ tenantId, projectId, id, initialData }: DatasetFormProps) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const form = useForm<DatasetFormData>({
    resolver: zodResolver(datasetSchema),
    defaultValues: formatFormData(initialData),
  });

  const { isSubmitting } = form.formState;
  const router = useRouter();

  const onSubmit = async (data: DatasetFormData) => {
    try {
      const payload: Partial<Dataset> = {
        name: data.name || null,
        description: data.description || null,
      };

      if (id) {
        const res = await updateDatasetAction(tenantId, projectId, id, payload);
        if (!res.success) {
          toast.error(res.error || 'Failed to update test suite');
          return;
        }
        toast.success('Test suite updated');
      } else {
        const res = await createDatasetAction(tenantId, projectId, payload);
        if (!res.success) {
          toast.error(res.error || 'Failed to create test suite');
          return;
        }
        toast.success('Test suite created');
        router.push(`/${tenantId}/projects/${projectId}/datasets`);
      }
    } catch (error) {
      console.error('Error submitting dataset:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      toast.error(errorMessage);
    }
  };

  return (
    <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <GenericInput
            control={form.control}
            name="name"
            label="Name"
            placeholder="Test Suite"
            description="A descriptive name for this test suite"
          />
          <GenericTextarea
            control={form.control}
            name="description"
            label="Description"
            placeholder="A collection of test cases for evaluating agent responses"
            className="min-h-[80px]"
          />

          <div className="flex w-full justify-between">
            <Button type="submit" disabled={isSubmitting}>
              {id ? 'Update' : 'Create'} Test Suite
            </Button>
            {id && (
              <DialogTrigger asChild>
                <Button type="button" variant="destructive-outline">
                  Delete Test Suite
                </Button>
              </DialogTrigger>
            )}
          </div>
        </form>
      </Form>
      {isDeleteOpen && id && (
        <DeleteDatasetConfirmation
          datasetId={id}
          datasetName={form.getValues('name') || undefined}
          setIsOpen={setIsDeleteOpen}
          redirectOnDelete={true}
        />
      )}
    </Dialog>
  );
}
