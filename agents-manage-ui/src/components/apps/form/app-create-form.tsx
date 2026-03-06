'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useParams } from 'next/navigation';
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
import { createAppAction } from '@/lib/actions/apps';
import type { AppCreateResponse } from '@/lib/api/apps';
import {
  AGENT_ACCESS_MODE_OPTIONS,
  type AppCreateFormInput,
  AppCreateFormSchema,
  AUTH_MODE_OPTIONS,
} from './validation';

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
      agentAccessMode: 'all',
      allowedAgentIds: [],
      allowedDomains: appType === 'web_client' ? '' : undefined,
      authMode: appType === 'web_client' ? 'anonymous_and_authenticated' : undefined,
      captchaEnabled: appType === 'web_client' ? false : undefined,
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
        type: appType,
        agentAccessMode: data.agentAccessMode,
        allowedAgentIds: data.allowedAgentIds,
        defaultAgentId: data.defaultAgentId || undefined,
        config:
          appType === 'web_client'
            ? {
                type: 'web_client',
                webClient: {
                  allowedDomains: (data.allowedDomains ?? '')
                    .split(',')
                    .map((d: string) => d.trim())
                    .filter(Boolean),
                  authMode: data.authMode ?? 'anonymous_and_authenticated',
                  anonymousSessionLifetimeSeconds: 86400,
                  hs256Enabled: false,
                  captchaEnabled: data.captchaEnabled ?? false,
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

        {appType === 'web_client' && (
          <>
            <GenericInput
              control={form.control}
              name="allowedDomains"
              label="Allowed Domains"
              placeholder="help.example.com, *.example.com"
              description="Comma-separated list of allowed domains. Supports wildcards (e.g., *.example.com)."
              isRequired
            />
            <GenericSelect
              control={form.control}
              name="authMode"
              label="Auth Mode"
              options={[...AUTH_MODE_OPTIONS]}
              selectTriggerClassName="w-full"
              isRequired
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
              <FormLabel isRequired>Agent Access</FormLabel>
              <FormControl>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="mt-1 flex gap-3"
                >
                  {AGENT_ACCESS_MODE_OPTIONS.map(({ value, label }) => (
                    <FieldLabel key={value} htmlFor={`agentAccessMode-${value}`}>
                      <Field orientation="horizontal" className="py-2! px-3!">
                        <FieldTitle>{label}</FieldTitle>
                        <RadioGroupItem value={value} id={`agentAccessMode-${value}`} />
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
            Create App
          </Button>
        </div>
      </form>
    </Form>
  );
}
