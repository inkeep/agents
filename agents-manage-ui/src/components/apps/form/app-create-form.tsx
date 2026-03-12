'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericComboBox } from '@/components/form/generic-combo-box';
import { GenericInput } from '@/components/form/generic-input';
import type { SelectOption } from '@/components/form/generic-select';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { createAppAction } from '@/lib/actions/apps';
import type { AppCreateResponse } from '@/lib/api/apps';
import { type AppCreateFormInput, AppCreateFormSchema } from './validation';

interface AppCreateFormProps {
  appType: 'web_client' | 'api';
  agentOptions: SelectOption[];
  onAppCreated: (result: AppCreateResponse) => void;
}

export function AppCreateForm({ appType, agentOptions, onAppCreated }: AppCreateFormProps) {
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();

  const form = useForm<AppCreateFormInput>({
    resolver: zodResolver(AppCreateFormSchema),
    defaultValues: {
      name: '',
      description: '',
      defaultAgentId: '',
      allowedDomains: appType === 'web_client' ? '' : undefined,
    },
    mode: 'onChange',
  });

  const { isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      const payload: Record<string, unknown> = {
        name: data.name,
        description: data.description || undefined,
        type: appType,
        defaultAgentId: data.defaultAgentId || undefined,
        defaultProjectId: data.defaultAgentId ? projectId : undefined,
        config:
          appType === 'web_client'
            ? {
                type: 'web_client',
                webClient: {
                  allowedDomains: (data.allowedDomains ?? '')
                    .split(',')
                    .map((d: string) => d.trim())
                    .filter(Boolean),
                },
              }
            : { type: 'api', api: {} },
      };

      const result = await createAppAction(tenantId, projectId, payload);
      if (!result.success) {
        toast.error(result.error || 'Failed to create app');
        return;
      }
      if (result.data) {
        onAppCreated(result.data);
      }
      toast.success('App created successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      toast.error(errorMessage);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6">
        <GenericInput
          control={form.control}
          name="name"
          label="Name"
          placeholder="My App"
          isRequired
        />
        <GenericInput
          control={form.control}
          name="description"
          label="Description"
          placeholder="Optional description"
        />
        <GenericComboBox
          control={form.control}
          name="defaultAgentId"
          label="Default Agent"
          options={agentOptions}
          placeholder="Select a default agent"
          searchPlaceholder="Search agents..."
          clearable
        />
        {appType === 'web_client' && (
          <GenericInput
            control={form.control}
            name="allowedDomains"
            label="Allowed Domains"
            placeholder="help.example.com, *.example.com"
            description="Comma-separated list of allowed domains. Supports wildcards (e.g., *.example.com)."
            isRequired
          />
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            Create App
          </Button>
        </div>
      </form>
    </Form>
  );
}
