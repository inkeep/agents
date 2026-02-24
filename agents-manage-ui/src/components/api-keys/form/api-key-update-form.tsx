'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericInput } from '@/components/form/generic-input';
import { GenericSelect } from '@/components/form/generic-select';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { updateApiKeyAction } from '@/lib/actions/api-keys';
import type { ApiKey } from '@/lib/api/api-keys';
import { isRequired } from '@/lib/utils';
import { type ApiKeyDate, ApiKeyUpdateSchema, EXPIRATION_DATE_OPTIONS } from './validation';

interface ApiKeyUpdateFormProps {
  tenantId: string;
  projectId: string;
  apiKey: ApiKey;
  onApiKeyUpdated?: (apiKeyData: ApiKey) => void;
}

function convertDateToDuration(isoDate?: string): ApiKeyDate {
  if (!isoDate) {
    return 'never';
  }

  const now = new Date();
  const expirationDate = new Date(isoDate);
  const diffMs = expirationDate.getTime() - now.getTime();

  // If the date is in the past or very close to now, default to 'never'
  if (diffMs <= 0) {
    return 'never';
  }

  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = Math.round(diffMs / (1000 * 60 * 60 * 24 * 30));
  const diffYears = Math.round(diffMs / (1000 * 60 * 60 * 24 * 365));

  // Find the closest matching duration option
  if (diffDays <= 1) return '1d';
  if (diffDays <= 7) return '1w';
  if (diffMonths <= 1) return '1m';
  if (diffMonths <= 3) return '3m';
  if (diffYears <= 1) return '1y';

  // For dates far in the future, default to 1 year
  return '1y';
}

export function ApiKeyUpdateForm({
  tenantId,
  projectId,
  apiKey,
  onApiKeyUpdated,
}: ApiKeyUpdateFormProps) {
  const form = useForm({
    resolver: zodResolver(ApiKeyUpdateSchema),
    defaultValues: {
      name: apiKey.name,
      expiresAt: convertDateToDuration(apiKey.expiresAt),
    },
  });

  const { isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      const res = await updateApiKeyAction(tenantId, projectId, {
        id: apiKey.id,
        ...data,
      });
      if (!res.success) {
        toast.error(res.error || 'Failed to update api key');
        return;
      }

      if (res.data) {
        onApiKeyUpdated?.(res.data);
      }
      toast.success('API key updated successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      toast.error(errorMessage);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-8">
        <GenericInput
          control={form.control}
          name="name"
          label="Name"
          placeholder="Enter a name"
          isRequired={isRequired(ApiKeyUpdateSchema, 'name')}
        />
        <GenericSelect
          control={form.control}
          name="expiresAt"
          label="Expiration"
          placeholder="Select expiration date"
          options={EXPIRATION_DATE_OPTIONS}
          selectTriggerClassName="w-full"
          isRequired={isRequired(ApiKeyUpdateSchema, 'expiresAt')}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            Update API key
          </Button>
        </div>
      </form>
    </Form>
  );
}
