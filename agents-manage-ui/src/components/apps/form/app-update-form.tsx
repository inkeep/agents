'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
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
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  addAppAuthKeyAction,
  deleteAppAuthKeyAction,
  fetchAppAuthKeysAction,
} from '@/lib/actions/app-auth-keys';
import { updateAppAction } from '@/lib/actions/apps';
import type { App } from '@/lib/api/apps';
import { CredentialMultiSelect } from './credential-multi-select';
import { type AppUpdateFormInput, AppUpdateFormSchema } from './validation';

interface AppUpdateFormProps {
  tenantId: string;
  projectId: string;
  app: App;
  agentOptions: SelectOption[];
  credentialOptions: SelectOption[];
  onAppUpdated: () => void;
}

interface WebClientConfigShape {
  allowedDomains?: string[];
  audience?: string;
  allowAnonymous?: boolean;
}

export function AppUpdateForm({
  tenantId,
  projectId,
  app,
  agentOptions,
  credentialOptions,
  onAppUpdated,
}: AppUpdateFormProps) {
  const webConfig: WebClientConfigShape | null =
    app.type === 'web_client'
      ? (((app.config as Record<string, unknown>)?.webClient as WebClientConfigShape) ?? null)
      : null;

  const supportCopilotConfig =
    app.type === 'support_copilot'
      ? ((app.config as Record<string, unknown>)?.supportCopilot as
          | { credentialReferenceIds?: string[] }
          | undefined)
      : null;

  const [serverKeys, setServerKeys] = useState<PublicKeyDisplay[]>([]);
  const [pendingKeysToAdd, setPendingKeysToAdd] = useState<PendingKey[]>([]);
  const [kidsToDelete, setKidsToDelete] = useState<string[]>([]);
  const [requireAuth, setRequireAuth] = useState(webConfig?.allowAnonymous !== true);
  const [isLoadingKeys, setIsLoadingKeys] = useState(app.type === 'web_client');

  useEffect(() => {
    async function loadKeys() {
      if (app.type !== 'web_client') return;
      const result = await fetchAppAuthKeysAction(tenantId, projectId, app.id);
      if (result.success && result.data) {
        setServerKeys(result.data);
      }
      setIsLoadingKeys(false);
    }
    loadKeys();
  }, [tenantId, projectId, app.type, app.id]);

  const form = useForm<AppUpdateFormInput>({
    resolver: zodResolver(AppUpdateFormSchema),
    defaultValues: {
      name: app.name,
      description: app.description ?? '',
      defaultAgentId: app.defaultAgentId ?? '',
      prompt: app.prompt ?? '',
      enabled: app.enabled,
      ...(app.type === 'web_client' && webConfig
        ? {
            allowedDomains: webConfig.allowedDomains?.join(', ') ?? '',
            audience: webConfig?.audience ?? '',
          }
        : {}),
      credentialReferenceIds: supportCopilotConfig?.credentialReferenceIds ?? [],
    },
    mode: 'onChange',
  });

  const { isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      const payload: Record<string, unknown> = {
        name: data.name,
        description: data.description || undefined,
        defaultAgentId: data.defaultAgentId || undefined,
        defaultProjectId: data.defaultAgentId ? projectId : null,
        prompt: data.prompt || null,
        enabled: data.enabled,
      };

      if (app.type === 'web_client' && data.allowedDomains !== undefined) {
        const webClientConfig: Record<string, unknown> = {
          allowedDomains: data.allowedDomains
            .split(',')
            .map((d: string) => d.trim())
            .filter(Boolean),
        };

        webClientConfig.audience = data.audience?.trim() || undefined;
        const allowAnonymous = !requireAuth;
        webClientConfig.allowAnonymous = allowAnonymous;

        payload.config = {
          type: 'web_client',
          webClient: webClientConfig,
        };
      } else if (app.type === 'support_copilot') {
        payload.config = {
          type: 'support_copilot',
          supportCopilot: {
            credentialReferenceIds: data.credentialReferenceIds ?? [],
          },
        };
      }

      const result = await updateAppAction(tenantId, projectId, app.id, payload);
      if (!result.success) {
        toast.error(result.error || 'Failed to update app');
        return;
      }

      let hasKeyFailure = false;

      for (const kid of kidsToDelete) {
        const deleteResult = await deleteAppAuthKeyAction(tenantId, projectId, app.id, kid);
        if (!deleteResult.success) {
          toast.error(deleteResult.error || `Failed to delete key ${kid}`);
          hasKeyFailure = true;
          break;
        }
      }

      if (!hasKeyFailure) {
        for (const key of pendingKeysToAdd) {
          const addResult = await addAppAuthKeyAction(tenantId, projectId, app.id, key);
          if (!addResult.success) {
            toast.error(addResult.error || `Failed to add key ${key.kid}`);
            hasKeyFailure = true;
            break;
          }
        }
      }

      if (!hasKeyFailure) {
        toast.success('App updated successfully');
      }
      onAppUpdated();
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
          placeholder="App name"
          isRequired
        />
        <GenericInput
          control={form.control}
          name="description"
          label="Description"
          placeholder="Optional description"
        />

        <FormField
          control={form.control}
          name="enabled"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between">
              <FormLabel>Enabled</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <GenericComboBox
          control={form.control}
          name="defaultAgentId"
          label="Default Agent"
          options={agentOptions}
          placeholder="Select a default agent"
          searchPlaceholder="Search agents..."
          isRequired
        />

        {app.type === 'web_client' && (
          <GenericInput
            control={form.control}
            name="allowedDomains"
            label="Allowed Domains"
            placeholder="help.example.com, *.example.com"
            description="Comma-separated list of allowed domains."
          />
        )}
        <GenericTextarea
          control={form.control}
          name="prompt"
          label="Prompt"
          placeholder="Add supplemental instructions for this app deployment..."
          description="Optional instructions that customize the agent's behavior when accessed through this app. These are added to the agent's existing instructions."
          rows={4}
          className="max-h-96"
        />

        {app.type === 'support_copilot' && credentialOptions.length > 0 && (
          <CredentialMultiSelect
            control={form.control}
            name="credentialReferenceIds"
            label="Credentials"
            description="Optional. Grant this app access to stored credentials for connecting to external services."
            options={credentialOptions}
            placeholder="Select credentials..."
            searchPlaceholder="Search credentials..."
          />
        )}

        {app.type === 'web_client' && !isLoadingKeys && (
          <>
            <Separator />
            <AuthKeysSection
              keys={serverKeys}
              requireAuth={requireAuth}
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
            {isSubmitting ? 'Updating...' : 'Update App'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
