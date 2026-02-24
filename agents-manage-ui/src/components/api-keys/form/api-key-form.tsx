'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericComboBox } from '@/components/form/generic-combo-box';
import { GenericInput } from '@/components/form/generic-input';
import type { SelectOption } from '@/components/form/generic-select';
import { GenericSelect } from '@/components/form/generic-select';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { createApiKeyAction } from '@/lib/actions/api-keys';
import type { ApiKeyCreateResponse } from '@/lib/api/api-keys';
import { isRequired } from '@/lib/utils';
import { defaultValues } from './form-configuration';
import { type ApiKeyFormData, ApiKeySchema, EXPIRATION_DATE_OPTIONS } from './validation';

interface ApiKeyFormProps {
  initialData?: ApiKeyFormData;
  agentsOptions: SelectOption[];
  onApiKeyCreated?: (apiKeyData: ApiKeyCreateResponse) => void;
}

export function ApiKeyForm({ agentsOptions, onApiKeyCreated }: ApiKeyFormProps) {
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const form = useForm({
    resolver: zodResolver(ApiKeySchema),
    defaultValues,
  });

  const { isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      const res = await createApiKeyAction(tenantId, projectId, data);
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
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-8">
        <GenericInput
          control={form.control}
          name="name"
          label="Name"
          placeholder="Enter a name"
          isRequired={isRequired(ApiKeySchema, 'name')}
        />
        <GenericSelect
          control={form.control}
          name="expiresAt"
          label="Expiration"
          placeholder="Select expiration date"
          options={EXPIRATION_DATE_OPTIONS}
          selectTriggerClassName="w-full"
          isRequired={isRequired(ApiKeySchema, 'expiresAt')}
        />
        <GenericComboBox
          control={form.control}
          name="agentId"
          label="Agent"
          options={agentsOptions}
          placeholder="Select an agent"
          searchPlaceholder="Search agent..."
          isRequired={isRequired(ApiKeySchema, 'agentId')}
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
