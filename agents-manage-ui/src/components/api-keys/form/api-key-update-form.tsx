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
import { type ApiKeyUpdateData, apiKeyUpdateSchema, EXPIRATION_DATE_OPTIONS } from './validation';

interface ApiKeyUpdateFormProps {
  tenantId: string;
  projectId: string;
  apiKey: ApiKey;
  onApiKeyUpdated?: (apiKeyData: ApiKey) => void;
  ref?: string;
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

const convertDateToDuration = (isoDate?: string): 'never' | '1d' | '1w' | '1m' | '3m' | '1y' => {
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
};

export function ApiKeyUpdateForm({
  tenantId,
  projectId,
  apiKey,
  onApiKeyUpdated,
  ref,
}: ApiKeyUpdateFormProps) {
  const form = useForm<ApiKeyUpdateData>({
    resolver: zodResolver(apiKeyUpdateSchema),
    defaultValues: {
      name: apiKey.name || 'No Name',
      expiresAt: convertDateToDuration(apiKey.expiresAt),
    },
  });

  const { isSubmitting } = form.formState;

  const onSubmit = async (data: ApiKeyUpdateData) => {
    try {
      const expiresAt = data.expiresAt ? convertDurationToDate(data.expiresAt) : undefined;
      const name = data.name;

      const payload: Partial<ApiKey> = {
        id: apiKey.id,
        expiresAt,
        name,
      };

      const res = await updateApiKeyAction(tenantId, projectId, payload, ref);
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
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <GenericInput
          control={form.control}
          name="name"
          label="Name"
          placeholder="Enter a name"
          isRequired
        />
        <GenericSelect
          control={form.control}
          name="expiresAt"
          label="Expiration"
          placeholder="Select expiration date"
          options={EXPIRATION_DATE_OPTIONS}
          selectTriggerClassName="w-full"
          isRequired
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
