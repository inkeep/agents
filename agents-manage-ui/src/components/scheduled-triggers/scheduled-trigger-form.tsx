'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { GitBranch, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { GenericInput } from '@/components/form/generic-input';
import type { SelectOption } from '@/components/form/generic-select';
import { GenericSelect } from '@/components/form/generic-select';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuthSession } from '@/hooks/use-auth';
import { useBranches } from '@/hooks/use-branches';
import { useIsOrgAdmin } from '@/hooks/use-is-org-admin';
import { useOrgMembers } from '@/hooks/use-org-members';
import {
  createScheduledTriggerAction,
  getScheduledTriggerUsersAction,
  updateScheduledTriggerAction,
} from '@/lib/actions/scheduled-triggers';
import type { ScheduledTrigger } from '@/lib/api/scheduled-triggers';
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
    runAsUserIds: z.array(z.string()).default([]),
    dispatchDelayMs: z.coerce.number().int().min(0).max(600_000).optional(),
    ref: z.string().default('main'),
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
  defaultsFromParams?: Record<string, string>;
}

const NONE_VALUE = '__none__';

export function ScheduledTriggerForm({
  tenantId,
  projectId,
  agentId,
  trigger,
  mode,
  defaultsFromParams,
}: ScheduledTriggerFormProps) {
  const router = useRouter();
  const redirectPath = `/${tenantId}/projects/${projectId}/triggers?tab=scheduled`;

  const { user } = useAuthSession();
  const { isAdmin, isLoading: isAdminLoading } = useIsOrgAdmin();
  const { members: orgMembers, isLoading: isMembersLoading } = useOrgMembers(tenantId, projectId);
  const { branches, isLoading: isBranchesLoading } = useBranches(tenantId, projectId);

  // Non-admins can only assign triggers to themselves
  const selectableMembers = isAdmin ? orgMembers : orgMembers.filter((m) => m.id === user?.id);

  const [multiUserOpen, setMultiUserOpen] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  const getDefaultValues = (): ScheduledTriggerFormData => {
    // Get browser's timezone for new triggers
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    if (!trigger) {
      const p = defaultsFromParams;
      return {
        enabled: true,
        name: '',
        description: '',
        scheduleType: (p?.scheduleType as 'cron' | 'one-time') || 'cron',
        cronExpression: p?.cronExpression || '',
        cronTimezone: p?.cronTimezone || browserTimezone,
        runAt: p?.runAt || '',
        payloadJson: p?.payloadJson || '',
        messageTemplate: p?.messageTemplate || '',
        maxRetries: p?.maxRetries ? Number(p.maxRetries) : 1,
        retryDelaySeconds: p?.retryDelaySeconds ? Number(p.retryDelaySeconds) : 60,
        timeoutSeconds: p?.timeoutSeconds ? Number(p.timeoutSeconds) : 780,
        runAsUserIds: [],
        dispatchDelayMs: p?.dispatchDelayMs ? Number(p.dispatchDelayMs) : undefined,
        ref: p?.ref || '',
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
      runAsUserIds: trigger.runAsUserId ? [trigger.runAsUserId] : [],
      dispatchDelayMs: trigger.dispatchDelayMs ?? undefined,
      ref: trigger.ref ?? '',
    };
  };

  const defaultValues = getDefaultValues();

  const form = useForm({
    resolver: zodResolver(scheduledTriggerFormSchema),
    defaultValues,
  });

  const { isSubmitting } = form.formState;
  const [scheduleType, cronTimezone = 'UTC'] = useWatch({
    control: form.control,
    name: ['scheduleType', 'cronTimezone'],
  });

  useEffect(() => {
    if (mode !== 'edit' || !trigger || !isAdmin) return;

    const triggerId = trigger.id;
    let cancelled = false;
    async function loadTriggerUsers() {
      setIsLoadingUsers(true);
      try {
        const result = await getScheduledTriggerUsersAction(
          tenantId,
          projectId,
          agentId,
          triggerId
        );
        if (!cancelled && result.success && result.data) {
          form.setValue('runAsUserIds', result.data, { shouldDirty: false });
        }
      } catch (error) {
        console.error('Failed to load trigger users:', error);
      }
      if (!cancelled) {
        setIsLoadingUsers(false);
      }
    }

    loadTriggerUsers();
    return () => {
      cancelled = true;
    };
  }, [mode, trigger, isAdmin, tenantId, projectId, agentId, form]);

  const getMemberDisplayName = (userId: string): string => {
    const member = orgMembers.find((m) => m.id === userId);
    return member?.name || member?.email || userId;
  };

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      let payload: Record<string, unknown> | null = null;
      if (data.payloadJson?.trim()) {
        try {
          payload = JSON.parse(data.payloadJson);
        } catch {
          toast.error('Invalid payload JSON');
          return;
        }
      }

      const basePayload = {
        id: data.id,
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
        dispatchDelayMs: data.dispatchDelayMs || undefined,
        ref: data.ref || 'main',
      };
      const runAsUserIds = data.runAsUserIds.filter((id) => id !== NONE_VALUE);

      if (mode === 'edit') {
        if (!trigger) {
          toast.error('Scheduled trigger not found');
          return;
        }
        const apiPayload = {
          ...basePayload,
          name: data.name,
          runAsUserIds,
          runAsUserId: null,
        };
        const result = await updateScheduledTriggerAction(
          tenantId,
          projectId,
          agentId,
          trigger.id,
          apiPayload
        );
        if (!result.success) {
          toast.error(result.error || 'Failed to update scheduled trigger');
          return;
        }
        toast.success('Scheduled trigger updated successfully');
        router.push(redirectPath);
        return;
      }

      const apiPayload = {
        ...basePayload,
        name: data.name,
        runAsUserIds,
        runAsUserId: null,
      };
      const result = await createScheduledTriggerAction(tenantId, projectId, agentId, apiPayload);
      if (result.success) {
        toast.success('Scheduled trigger created successfully');
        router.push(redirectPath);
      } else {
        toast.error(result.error || 'Failed to create scheduled trigger');
      }
    } catch (error) {
      console.error(`Failed to ${mode} scheduled trigger:`, error);
      toast.error(`Failed to ${mode} scheduled trigger. Please try again.`);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6">
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

        {/* Agent Version */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Agent Version
            </CardTitle>
            <CardDescription>
              Choose which branch of agent configuration this trigger runs against. Use this to test
              agent changes on a feature branch before merging.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isBranchesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading branches...
              </div>
            ) : (
              <GenericSelect
                control={form.control}
                name="ref"
                label="Branch"
                description="Defaults to main if not specified. Select a feature branch to run the trigger against that branch's agent configuration."
                options={branches.map((branch) => ({
                  value: branch.isDefault ? '' : branch.name,
                  label: branch.name,
                }))}
                placeholder="main"
                selectTriggerClassName="w-full"
              />
            )}
          </CardContent>
        </Card>

        {/* Execution Identity */}
        <Card>
          <CardHeader>
            <CardTitle>Execution Identity</CardTitle>
            <CardDescription>
              Choose which user identity the trigger should run as. This determines whose
              credentials and permissions are used during execution.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isAdminLoading || isMembersLoading || isLoadingUsers ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading users...
              </div>
            ) : (
              <FormField
                control={form.control}
                name="runAsUserIds"
                render={({ field }) => {
                  const runAsUserIds = field.value ?? [];

                  return isAdmin ? (
                    <FormItem className="grid gap-2">
                      <FormLabel>Run as Users</FormLabel>
                      <Popover open={multiUserOpen} onOpenChange={setMultiUserOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-between"
                            role="combobox"
                            aria-expanded={multiUserOpen}
                          >
                            <span className="truncate">
                              {runAsUserIds.length === 0
                                ? 'None'
                                : runAsUserIds.length === 1
                                  ? getMemberDisplayName(runAsUserIds[0])
                                  : `${runAsUserIds.length} users selected`}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[--radix-popover-trigger-width] p-0"
                          align="start"
                        >
                          <Command>
                            <CommandInput placeholder="Search users..." />
                            <CommandList>
                              <CommandEmpty>No users found.</CommandEmpty>
                              <CommandGroup>
                                {selectableMembers.map((member) => (
                                  <CommandItem
                                    key={member.id}
                                    value={`${member.name} ${member.email}`}
                                    onSelect={() => {
                                      field.onChange(
                                        runAsUserIds.includes(member.id)
                                          ? runAsUserIds.filter((id) => id !== member.id)
                                          : [...runAsUserIds, member.id]
                                      );
                                    }}
                                  >
                                    <Checkbox
                                      checked={runAsUserIds.includes(member.id)}
                                      className="mr-2"
                                    />
                                    <div className="flex flex-col">
                                      <span>{member.name || member.email}</span>
                                      <span className="text-xs text-muted-foreground">
                                        {member.email}
                                      </span>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {runAsUserIds.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {runAsUserIds.map((id) => (
                            <Badge
                              key={id}
                              variant="secondary"
                              className="cursor-pointer"
                              onClick={() =>
                                field.onChange(runAsUserIds.filter((uid) => uid !== id))
                              }
                            >
                              {getMemberDisplayName(id)} &times;
                            </Badge>
                          ))}
                        </div>
                      )}
                      <FormDescription>
                        {mode === 'create'
                          ? 'Select users whose identity this trigger will run as. One execution per user at each scheduled tick.'
                          : 'Manage the users associated with this trigger. Changes are saved when you update the trigger.'}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  ) : (
                    <FormItem>
                      <FormLabel>Run as User</FormLabel>
                      <Select
                        value={runAsUserIds[0] || NONE_VALUE}
                        onValueChange={(value) =>
                          field.onChange(value === NONE_VALUE ? [] : [value])
                        }
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select user" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>None</SelectItem>
                          {selectableMembers.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.name || member.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Choose whose identity and credentials this trigger uses when running.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            )}
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
              selectTriggerClassName="w-full"
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
                        timezone={cronTimezone}
                        onTimezoneChange={(tz) =>
                          form.setValue('cronTimezone', tz, { shouldDirty: true })
                        }
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
            <FormField
              control={form.control}
              name="dispatchDelayMs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dispatch Delay (ms)</FormLabel>
                  <FormControl>
                    <Input
                      ref={field.ref}
                      name={field.name}
                      onBlur={field.onBlur}
                      disabled={field.disabled}
                      value={field.value != null ? String(field.value) : ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        field.onChange(val === '' ? undefined : Number(val));
                      }}
                      type="number"
                      min={0}
                      max={600_000}
                      placeholder="0"
                    />
                  </FormControl>
                  <FormDescription>
                    Delay in milliseconds between dispatching each user&apos;s execution (0-600000).
                    Useful for managing MCP tool rate limits with multi-user triggers.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
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
