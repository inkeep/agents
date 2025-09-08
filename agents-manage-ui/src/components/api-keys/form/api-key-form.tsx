'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericComboBox } from '@/components/form/generic-combo-box';
import type { SelectOption } from '@/components/form/generic-select';
import { GenericSelect } from '@/components/form/generic-select';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { createApiKeyAction } from '@/lib/actions/api-keys';
import type { ApiKey, ApiKeyCreateResponse } from '@/lib/api/api-keys';
import { defaultValues } from './form-configuration';
import { type ApiKeyFormData, apiKeySchema, EXPIRATION_DATE_OPTIONS } from './validation';

interface ApiKeyFormProps {
  tenantId: string;
  projectId: string;
  initialData?: ApiKeyFormData;
  graphsOptions: SelectOption[];
  onApiKeyCreated?: (apiKeyData: ApiKeyCreateResponse) => void;
}

const convertDurationToDate = (duration: string): string | undefined => {
  if (duration === 'never') {
    return undefined;
  }

  const now = new Date();

  switch (duration) {
    case '1d':
      now.setDate(now.getDate() + 1);
      break;
    case '1w':
      now.setDate(now.getDate() + 7);
      break;
    case '1m':
      now.setMonth(now.getMonth() + 1);
      break;
    case '3m':
      now.setMonth(now.getMonth() + 3);
      break;
    case '1y':
      now.setFullYear(now.getFullYear() + 1);
      break;
    default:
      return undefined;
  }

  return now.toISOString();
};

export function ApiKeyForm({
  tenantId,
  projectId,
  initialData,
  graphsOptions,
  onApiKeyCreated,
}: ApiKeyFormProps) {
  const form = useForm<ApiKeyFormData>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: initialData || defaultValues,
  });

  const { isSubmitting } = form.formState;

  const onSubmit = async (data: ApiKeyFormData) => {
    try {
      const expiresAt = data.expiresAt ? convertDurationToDate(data.expiresAt) : undefined;

      const payload: Partial<ApiKey> = {
        graphId: data.graphId,
        expiresAt,
      };

      const res = await createApiKeyAction(tenantId, projectId, payload);
      if (!res.success) {
        toast.error(res.error || 'Failed to create api key');
        return;
      }

      if (res.data) {
        onApiKeyCreated?.(res.data);
      }
      toast.success('API key created successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      toast.error(errorMessage);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <GenericSelect
          control={form.control}
          name="expiresAt"
          label="Expiration"
          placeholder="Select expiration date"
          options={EXPIRATION_DATE_OPTIONS}
          selectTriggerClassName="w-full"
          isRequired
        />
        <GenericComboBox
          control={form.control}
          name="graphId"
          label="Graph"
          options={graphsOptions}
          placeholder="Select a graph"
          searchPlaceholder="Search graphs..."
          isRequired
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            Create API key
          </Button>
        </div>
      </form>
    </Form>
  );
}
