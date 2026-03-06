'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericInput } from '@/components/form/generic-input';
import type { SelectOption } from '@/components/form/generic-select';
import { GenericSelect } from '@/components/form/generic-select';
import { MultiSelectField } from '@/components/form/multi-select-field';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { updateAppAction } from '@/lib/actions/apps';
import type { App } from '@/lib/api/apps';
import {
  AGENT_ACCESS_MODE_OPTIONS,
  type AppUpdateFormInput,
  AppUpdateFormSchema,
  AUTH_MODE_OPTIONS,
} from './validation';

interface AppUpdateFormProps {
  tenantId: string;
  projectId: string;
  app: App;
  agentOptions: SelectOption[];
  onAppUpdated: () => void;
}

interface WebClientConfigShape {
  allowedDomains?: string[];
  authMode?: string;
  anonymousSessionLifetimeSeconds?: number;
  hs256Enabled?: boolean;
  hs256Secret?: string;
  captchaEnabled?: boolean;
}

export function AppUpdateForm({
  tenantId,
  projectId,
  app,
  agentOptions,
  onAppUpdated,
}: AppUpdateFormProps) {
  const webConfig: WebClientConfigShape | null =
    app.type === 'web_client'
      ? (((app.config as Record<string, unknown>)?.webClient as WebClientConfigShape) ?? null)
      : null;

  const form = useForm<AppUpdateFormInput>({
    resolver: zodResolver(AppUpdateFormSchema),
    defaultValues: {
      name: app.name,
      description: app.description ?? '',
      agentAccessMode: app.agentAccessMode as 'all' | 'selected',
      allowedAgentIds: app.allowedAgentIds,
      defaultAgentId: app.defaultAgentId ?? undefined,
      enabled: app.enabled,
      ...(app.type === 'web_client' && webConfig
        ? {
            allowedDomains: webConfig.allowedDomains?.join(', ') ?? '',
            authMode:
              (webConfig.authMode as AppUpdateFormInput['authMode']) ??
              'anonymous_and_authenticated',
            captchaEnabled: webConfig.captchaEnabled ?? false,
          }
        : {}),
    },
    mode: 'onChange',
  });

  const { isSubmitting } = form.formState;
  const agentAccessMode = useWatch({ control: form.control, name: 'agentAccessMode' });

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      const payload: Record<string, unknown> = {
        name: data.name,
        description: data.description || undefined,
        agentAccessMode: data.agentAccessMode,
        allowedAgentIds: data.allowedAgentIds,
        defaultAgentId: data.defaultAgentId || undefined,
        enabled: data.enabled,
      };

      if (app.type === 'web_client' && data.allowedDomains !== undefined) {
        payload.config = {
          type: 'web_client',
          webClient: {
            allowedDomains: data.allowedDomains
              .split(',')
              .map((d: string) => d.trim())
              .filter(Boolean),
            authMode: data.authMode ?? webConfig?.authMode ?? 'anonymous_and_authenticated',
            anonymousSessionLifetimeSeconds: webConfig?.anonymousSessionLifetimeSeconds ?? 86400,
            hs256Enabled: webConfig?.hs256Enabled ?? false,
            hs256Secret: webConfig?.hs256Secret,
            captchaEnabled: data.captchaEnabled ?? webConfig?.captchaEnabled ?? false,
          },
        };
      }

      const result = await updateAppAction(tenantId, projectId, app.id, payload);
      if (!result.success) {
        toast.error(result.error || 'Failed to update app');
        return;
      }
      toast.success('App updated successfully');
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
              <FormLabel className="flex-1">Enabled</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        {app.type === 'web_client' && (
          <>
            <GenericInput
              control={form.control}
              name="allowedDomains"
              label="Allowed Domains"
              placeholder="help.example.com, *.example.com"
              description="Comma-separated list of allowed domains."
            />
            <GenericSelect
              control={form.control}
              name="authMode"
              label="Auth Mode"
              options={[...AUTH_MODE_OPTIONS]}
              selectTriggerClassName="w-full"
            />
            <FormField
              control={form.control}
              name="captchaEnabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <FormLabel className="flex-1">Captcha (PoW)</FormLabel>
                  <FormControl>
                    <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </>
        )}

        <FormField
          control={form.control}
          name="agentAccessMode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Agent Access</FormLabel>
              <FormControl>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="mt-1 flex gap-3"
                >
                  {AGENT_ACCESS_MODE_OPTIONS.map(({ value, label }) => (
                    <FieldLabel key={value} htmlFor={`agentAccessMode-update-${value}`}>
                      <Field orientation="horizontal" className="py-2! px-3!">
                        <FieldTitle>{label}</FieldTitle>
                        <RadioGroupItem value={value} id={`agentAccessMode-update-${value}`} />
                      </Field>
                    </FieldLabel>
                  ))}
                </RadioGroup>
              </FormControl>
            </FormItem>
          )}
        />

        {agentAccessMode === 'selected' && (
          <MultiSelectField
            control={form.control}
            name="allowedAgentIds"
            label="Allowed Agents"
            options={agentOptions}
            placeholder="Select agents..."
            commandInputPlaceholder="Search agents..."
          />
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            Update App
          </Button>
        </div>
      </form>
    </Form>
  );
}
