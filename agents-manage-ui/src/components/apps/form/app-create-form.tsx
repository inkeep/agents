'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  AuthKeysSection,
  type PendingKey,
  type PublicKeyDisplay,
} from '@/components/apps/auth-keys-section';
import { GenericComboBox } from '@/components/form/generic-combo-box';
import { GenericInput } from '@/components/form/generic-input';
import type { SelectOption } from '@/components/form/generic-select';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { addAppAuthKeyAction } from '@/lib/actions/app-auth-keys';
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

  const [pendingKeysToAdd, setPendingKeysToAdd] = useState<PendingKey[]>([]);
  const [kidsToDelete, setKidsToDelete] = useState<string[]>([]);
  const [requireAuth, setRequireAuth] = useState(false);

  const form = useForm<AppCreateFormInput>({
    resolver: zodResolver(AppCreateFormSchema),
    defaultValues: {
      name: '',
      description: '',
      defaultAgentId: '',
      prompt: '',
      allowedDomains: appType === 'web_client' ? '' : undefined,
      audience: '',
    },
    mode: 'onChange',
  });

  const { isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      const authConfig: Record<string, unknown> = {
        allowAnonymous: !requireAuth,
      };
      if (data.audience?.trim()) {
        authConfig.audience = data.audience.trim();
      }

      const payload: Record<string, unknown> = {
        name: data.name,
        description: data.description || undefined,
        type: appType,
        defaultAgentId: data.defaultAgentId || undefined,
        defaultProjectId: data.defaultAgentId ? projectId : undefined,
        prompt: data.prompt || undefined,
        config:
          appType === 'web_client'
            ? {
                type: 'web_client',
                webClient: {
                  allowedDomains: (data.allowedDomains ?? '')
                    .split(',')
                    .map((d: string) => d.trim())
                    .filter(Boolean),
                  auth: authConfig,
                },
              }
            : { type: 'api', api: {} },
      };

      const result = await createAppAction(tenantId, projectId, payload);
      if (!result.success) {
        toast.error(result.error || 'Failed to create app');
        return;
      }
      if (!result.data) {
        toast.error('Failed to create app');
        return;
      }

      const appId = result.data.app.id;

      for (const key of pendingKeysToAdd) {
        const addResult = await addAppAuthKeyAction(tenantId, projectId, appId, key);
        if (!addResult.success) {
          toast.error(addResult.error || `Failed to add key ${key.kid}`);
          onAppCreated(result.data);
          return;
        }
      }

      toast.success('App created successfully');
      onAppCreated(result.data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      toast.error(errorMessage);
    }
  });

  const emptyServerKeys: PublicKeyDisplay[] = [];

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
        <GenericTextarea
          control={form.control}
          name="prompt"
          label="Prompt"
          placeholder="Add supplemental instructions for this app deployment..."
          description="Optional instructions that customize the agent's behavior when accessed through this app. These are added to the agent's existing instructions."
          rows={4}
        />

        {appType === 'web_client' && (
          <>
            <Separator />
            <AuthKeysSection
              keys={emptyServerKeys}
              requireAuth={requireAuth}
              onKeysChange={() => {}}
              onRequireAuthChange={setRequireAuth}
              pendingKeysToAdd={pendingKeysToAdd}
              onPendingKeysToAddChange={setPendingKeysToAdd}
              kidsToDelete={kidsToDelete}
              onKidsToDeleteChange={setKidsToDelete}
            />
            <GenericInput
              control={form.control}
              name="audience"
              label="Audience (aud)"
              placeholder="https://your-app.example.com"
              description="Optional. When set, tokens must include a matching aud claim."
            />
          </>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create App'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
