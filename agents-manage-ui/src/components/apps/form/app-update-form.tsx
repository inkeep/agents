'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { GenericInput } from '@/components/form/generic-input';
import type { SelectOption } from '@/components/form/generic-select';
import { GenericSelect } from '@/components/form/generic-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
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
              <FormLabel>Enabled</FormLabel>
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
                  <FormLabel>Captcha (PoW)</FormLabel>
                  <FormControl>
                    <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </>
        )}

        <GenericSelect
          control={form.control}
          name="agentAccessMode"
          label="Agent Access"
          options={[...AGENT_ACCESS_MODE_OPTIONS]}
          selectTriggerClassName="w-full"
        />

        {agentAccessMode === 'selected' && (
          <AgentMultiSelect control={form.control} agentOptions={agentOptions} />
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

function AgentMultiSelect({
  control,
  agentOptions,
}: {
  control: any;
  agentOptions: SelectOption[];
}) {
  const [inputValue, setInputValue] = useState('');

  return (
    <FormField
      control={control}
      name="allowedAgentIds"
      render={({ field }) => {
        const selectedIds: string[] = field.value || [];

        const addAgent = (id: string) => {
          if (!selectedIds.includes(id)) {
            field.onChange([...selectedIds, id]);
          }
          setInputValue('');
        };

        const removeAgent = (id: string) => {
          field.onChange(selectedIds.filter((a: string) => a !== id));
        };

        const filteredOptions = agentOptions.filter(
          (opt) =>
            !selectedIds.includes(opt.value) &&
            opt.label.toLowerCase().includes(inputValue.toLowerCase())
        );

        const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredOptions.length > 0) {
              addAgent(filteredOptions[0].value);
            }
          }
        };

        return (
          <FormItem>
            <FormLabel>Allowed Agents</FormLabel>
            <div className="space-y-2">
              {selectedIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedIds.map((id: string) => {
                    const opt = agentOptions.find((o) => o.value === id);
                    return (
                      <Badge key={id} variant="secondary" className="gap-1">
                        {opt?.label ?? id}
                        <button
                          type="button"
                          onClick={() => removeAgent(id)}
                          className="hover:text-destructive"
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
              <div className="relative">
                <Input
                  placeholder="Search agents..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                {inputValue && filteredOptions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-40 overflow-auto">
                    {filteredOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => addAgent(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </FormItem>
        );
      }}
    />
  );
}
