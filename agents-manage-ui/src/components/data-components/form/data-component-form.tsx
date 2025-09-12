'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { JsonSchemaInput } from '@/components/form/json-schema-input';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useAutoPrefillId } from '@/hooks/use-auto-prefill-id';
import {
  createDataComponentAction,
  updateDataComponentAction,
} from '@/lib/actions/data-components';
import type { DataComponent } from '@/lib/api/data-components';
import { formatJsonField } from '@/lib/utils';
import { defaultValues } from './form-configuration';
import { type DataComponentFormData, dataComponentSchema } from './validation';

interface DataComponentFormProps {
  tenantId: string;
  projectId: string;
  id?: string;
  initialData?: DataComponentFormData;
}

const formatFormData = (data?: DataComponentFormData): DataComponentFormData => {
  if (!data) return defaultValues;

  const formatted = { ...data };
  if (formatted.props) {
    formatted.props = formatJsonField(formatted.props);
  }
  return formatted;
};

export function DataComponentForm({
  tenantId,
  projectId,
  id,
  initialData,
}: DataComponentFormProps) {
  const form = useForm<DataComponentFormData>({
    resolver: zodResolver(dataComponentSchema),
    defaultValues: formatFormData(initialData),
  });

  const { isSubmitting } = form.formState;
  const router = useRouter();

  // Auto-prefill ID based on name field (only for new components)
  useAutoPrefillId({
    form,
    nameField: 'name',
    idField: 'id',
    isEditing: !!id,
  });

  const onSubmit = async (data: DataComponentFormData) => {
    try {
      const payload = { ...data } as DataComponent;
      if (id) {
        const res = await updateDataComponentAction(tenantId, projectId, payload);
        if (!res.success) {
          toast.error(res.error || 'Failed to update data component');
          return;
        }
        toast.success('Data component updated');
      } else {
        const res = await createDataComponentAction(tenantId, projectId, payload);
        if (!res.success) {
          toast.error(res.error || 'Failed to create data component');
          return;
        }
        toast.success('Data component created');
        router.push(`/${tenantId}/projects/${projectId}/data-components`);
      }
    } catch (error) {
      console.error('Error submitting data component:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      toast.error(errorMessage);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <GenericInput
          control={form.control}
          name="name"
          label="Name"
          placeholder="ListOrders"
          description={
            'This name is used to identify the component in chat widget integration. Example: components: { ListOrders: MyListOrdersComponent }'
          }
          isRequired
        />
        <GenericInput
          control={form.control}
          name="id"
          label="Id"
          placeholder="my-data-component"
          disabled={!!id}
          description={
            id
              ? ''
              : 'Choose a unique identifier for this component. Using an existing id will replace that component.'
          }
          isRequired
        />
        <GenericTextarea
          control={form.control}
          name="description"
          label="Description"
          placeholder="Display a list of user orders with interactive options"
          className="min-h-[80px]"
          isRequired
        />
        <JsonSchemaInput
          control={form.control}
          name="props"
          label="Props (JSON Schema)"
          placeholder="Enter a valid JSON Schema..."
          isRequired
        />
        <Button type="submit" disabled={isSubmitting}>
          Save
        </Button>
      </form>
    </Form>
  );
}
