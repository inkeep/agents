'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { GenericInput } from '@/components/form/generic-input';
import type { SelectOption } from '@/components/form/generic-select';
import { GenericSelect } from '@/components/form/generic-select';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  createScheduledTriggerAction,
  updateScheduledTriggerAction,
} from '@/lib/actions/scheduled-triggers';
import type { ScheduledTrigger } from '@/lib/api/scheduled-triggers';
import { toast } from '@/lib/toast';
import { DateTimePicker } from './date-time-picker';
import { FriendlyScheduleBuilder } from './friendly-schedule-builder';

const scheduleTypeOptions: SelectOption[] = [
  { value: 'cron', label: 'Recurring (Cron)' },
  { value: 'one-time', label: 'One-time' },
];

// Zod schema for the form
const scheduledTriggerFormSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1, 'Name is required'),
    description: z.string().default(''),
    enabled: z.boolean(),
    scheduleType: z.enum(['cron', 'one-time']),
    cronExpression: z.string().default(''),
    cronTimezone: z.string().default('UTC'),
    runAt: z.string().default(''),
    payloadJson: z.string().default(''),
    messageTemplate: z.string().default(''),
    maxRetries: z.coerce.number().int().min(0).max(10).default(1),
    retryDelaySeconds: z.coerce.number().int().min(10).max(3600).default(60),
    timeoutSeconds: z.coerce.number().int().min(30).max(780).default(780),
  })
  .refine(
    (data) => {
      if (data.scheduleType === 'cron') {
        return data.cronExpression.trim().length > 0;
      }
      return data.runAt.trim().length > 0;
    },
    {
      message: 'Either cron expression or run-at time is required based on schedule type',
      path: ['cronExpression'],
    }
  );

type ScheduledTriggerFormData = z.infer<typeof scheduledTriggerFormSchema>;

interface ScheduledTriggerFormProps {
  tenantId: string;
  projectId: string;
  agentId: string;
  trigger?: ScheduledTrigger;
  mode: 'create' | 'edit';
}

export function ScheduledTriggerForm({
  tenantId,
  projectId,
  agentId,
  trigger,
  mode,
}: ScheduledTriggerFormProps) {
  const router = useRouter();
  const redirectPath = `/${tenantId}/projects/${projectId}/triggers?tab=scheduled`;

  const getDefaultValues = (): ScheduledTriggerFormData => {
    // Get browser's timezone for new triggers
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    if (!trigger) {
      return {
        enabled: true,
        name: '',
        description: '',
        scheduleType: 'cron',
        cronExpression: '',
        cronTimezone: browserTimezone,
        runAt: '',
        payloadJson: '',
        messageTemplate: '',
        maxRetries: 1,
        retryDelaySeconds: 60,
        timeoutSeconds: 780,
      };
    }

    return {
      id: trigger.id,
      name: trigger.name,
      description: trigger.description || '',
      enabled: trigger.enabled,
      scheduleType: trigger.cronExpression ? 'cron' : 'one-time',
      cronExpression: trigger.cronExpression || '',
      cronTimezone: trigger.cronTimezone || 'UTC',
      runAt: trigger.runAt ? new Date(trigger.runAt).toISOString().slice(0, 16) : '',
      payloadJson: trigger.payload ? JSON.stringify(trigger.payload, null, 2) : '',
      messageTemplate: trigger.messageTemplate || '',
      maxRetries: trigger.maxRetries ?? 1,
      retryDelaySeconds: trigger.retryDelaySeconds ?? 60,
      timeoutSeconds: trigger.timeoutSeconds ?? 780,
    };
  };

  const defaultValues = getDefaultValues();

  const form = useForm({
    resolver: zodResolver(scheduledTriggerFormSchema),
    defaultValues,
  });

  const { isSubmitting } = form.formState;
  const scheduleType = form.watch('scheduleType');

  const onSubmit = async (data: ScheduledTriggerFormData) => {
    try {
      // Parse JSON payload if provided
      let payload: Record<string, unknown> | null = null;
      if (data.payloadJson?.trim()) {
        try {
          payload = JSON.parse(data.payloadJson);
        } catch {
          toast.error('Invalid payload JSON');
          return;
        }
      }

      const apiPayload = {
        id: data.id,
        name: data.name,
        description: data.description || undefined,
        enabled: data.enabled,
        cronExpression: data.scheduleType === 'cron' ? data.cronExpression : null,
        cronTimezone: data.scheduleType === 'cron' ? data.cronTimezone : null,
        runAt: data.scheduleType === 'one-time' ? new Date(data.runAt).toISOString() : null,
        payload,
        messageTemplate: data.messageTemplate || undefined,
        maxRetries: data.maxRetries,
        retryDelaySeconds: data.retryDelaySeconds,
        timeoutSeconds: data.timeoutSeconds,
      };

      let result: { success: boolean; error?: string };
      if (mode === 'create') {
        result = await createScheduledTriggerAction(tenantId, projectId, agentId, apiPayload);
      } else if (trigger) {
        result = await updateScheduledTriggerAction(
          tenantId,
          projectId,
          agentId,
          trigger.id,
          apiPayload
        );
      } else {
        toast.error('Scheduled trigger not found');
        return;
      }

      if (result.success) {
        toast.success(
          `Scheduled trigger ${mode === 'create' ? 'created' : 'updated'} successfully`
        );
        router.push(redirectPath);
      } else {
        toast.error(result.error || `Failed to ${mode} scheduled trigger`);
      }
    } catch (error) {
      console.error(`Failed to ${mode} scheduled trigger:`, error);
      toast.error(`Failed to ${mode} scheduled trigger. Please try again.`);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Configure the basic settings for your scheduled trigger.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <GenericInput
              control={form.control}
              name="name"
              label="Name"
              placeholder="e.g., Daily Report Generator"
              isRequired
            />
            <GenericTextarea
              control={form.control}
              name="description"
              label="Description"
              placeholder="Describe what this scheduled trigger does"
              rows={3}
            />
            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Enabled</FormLabel>
                    <FormDescription>
                      Enable or disable this scheduled trigger. Disabled triggers will not run.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Schedule Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
            <CardDescription>
              Configure when this trigger should run. Choose between a recurring cron schedule or a
              one-time execution.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <GenericSelect
              control={form.control}
              name="scheduleType"
              label="Schedule Type"
              options={scheduleTypeOptions}
              placeholder="Select schedule type"
              isRequired
            />

            {scheduleType === 'cron' && (
              <FormField
                control={form.control}
                name="cronExpression"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <FriendlyScheduleBuilder
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        timezone={form.watch('cronTimezone') ?? 'UTC'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {scheduleType === 'one-time' && (
              <FormField
                control={form.control}
                name="runAt"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <DateTimePicker
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        minDate={new Date()}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        {/* Message Template */}
        <Card>
          <CardHeader>
            <CardTitle>Message Template (Optional)</CardTitle>
            <CardDescription>
              Define an optional text message sent to the agent. Use {'{{placeholder}}'} syntax to
              reference fields from the payload.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GenericTextarea
              control={form.control}
              name="messageTemplate"
              label="Template"
              placeholder="e.g., Generate daily report for {{date}}"
              rows={4}
            />
          </CardContent>
        </Card>

        {/* Payload */}
        <Card>
          <CardHeader>
            <CardTitle>Payload (Optional)</CardTitle>
            <CardDescription>
              Static JSON payload to pass to the agent when the trigger runs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="payloadJson"
              render={({ field, fieldState }) => (
                <FormItem>
                  <ExpandableJsonEditor
                    name="scheduled-trigger-payload"
                    label="Payload JSON"
                    value={field.value || ''}
                    onChange={field.onChange}
                    placeholder={`{\n  "reportType": "daily",\n  "includeMetrics": true\n}`}
                    error={fieldState.error?.message}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Retry Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Retry Configuration</CardTitle>
            <CardDescription>
              Configure how the trigger should handle failures and retries.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="maxRetries"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Retries</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={Number(field.value)}
                        type="number"
                        min={0}
                        max={10}
                      />
                    </FormControl>
                    <FormDescription>Number of retry attempts (0-10)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="retryDelaySeconds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Retry Delay (seconds)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={Number(field.value)}
                        type="number"
                        min={10}
                        max={3600}
                      />
                    </FormControl>
                    <FormDescription>Seconds between retries (10-3600)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="timeoutSeconds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timeout (seconds)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={Number(field.value)}
                        type="number"
                        min={30}
                        max={900}
                      />
                    </FormControl>
                    <FormDescription>Execution timeout (30-780)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push(redirectPath)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {mode === 'create' ? 'Create Scheduled Trigger' : 'Update Scheduled Trigger'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
