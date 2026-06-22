'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, Hash, Lock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Control } from 'react-hook-form';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  keyValuePairsToRecord,
  recordToKeyValuePairs,
} from '@/components/credentials/views/credential-form-validation';
import { GenericKeyValueInput } from '@/components/form/generic-key-value-input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { slackApi } from '@/features/work-apps/slack/api/slack-api';
import {
  createWebhookDestinationAction,
  updateWebhookDestinationAction,
} from '@/lib/actions/webhook-destinations';
import type { WebhookDestination } from '@/lib/api/webhook-destinations';
import { ConversationErrorsEventGroup } from './conversation-errors-event-group';

const EVENT_TYPES = [
  { value: 'conversation.created', label: 'Conversation Created' },
  { value: 'conversation.updated', label: 'Conversation Updated' },
  { value: 'feedback.created', label: 'Feedback Created' },
  { value: 'event.created', label: 'Event Created' },
  { value: 'evaluation.failed', label: 'Evaluation Failed' },
] as const;

type DestinationMode = 'webhook' | 'slack';

const formSchema = z
  .object({
    destinationMode: z.enum(['webhook', 'slack']),
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional(),
    enabled: z.boolean(),
    url: z.string().optional(),
    slackChannelId: z.string().optional(),
    eventTypes: z.array(z.string()).min(1, 'Select at least one event type'),
    agentIds: z.array(z.string()),
    evaluatorIds: z.array(z.string()),
    headers: z.array(z.object({ key: z.string(), value: z.string() })),
  })
  .superRefine((data, ctx) => {
    if (data.destinationMode === 'webhook' && !data.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'URL is required for webhook destinations',
        path: ['url'],
      });
    }
    if (data.destinationMode === 'webhook' && data.url) {
      try {
        new URL(data.url);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Must be a valid URL',
          path: ['url'],
        });
      }
    }
    if (data.destinationMode === 'slack' && !data.slackChannelId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a Slack channel',
        path: ['slackChannelId'],
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
}

function formatHeaderValidationError(rawError: string | undefined): string {
  if (!rawError) return 'Unknown error';
  try {
    const parsed = JSON.parse(rawError);
    const issues = Array.isArray(parsed) ? parsed : null;
    if (!issues) return rawError;
    const lines = issues.map((issue) => {
      const leaf = issue?.issues?.[0]?.message ?? issue?.message ?? 'Invalid';
      const path = Array.isArray(issue?.path) ? issue.path : [];
      const hint =
        path[0] === 'headers' && typeof path[1] === 'string' ? `Custom Header "${path[1]}"` : null;
      return hint ? `${hint}: ${leaf}` : leaf;
    });
    return lines.join('; ');
  } catch {
    return rawError;
  }
}

interface Agent {
  id: string;
  name: string;
}

interface Evaluator {
  id: string;
  name: string;
}

interface WebhookDestinationFormProps {
  mode: 'create' | 'edit';
  tenantId: string;
  projectId: string;
  webhookDestination?: WebhookDestination;
  agents?: Agent[];
  evaluators?: Evaluator[];
  destinationType?: DestinationMode;
}

function EvaluatorScopeSection({
  evaluators,
  control,
  tenantId,
  projectId,
  onEvaluatorChecked,
}: {
  evaluators: Evaluator[];
  control: Control<FormValues>;
  tenantId: string;
  projectId: string;
  onEvaluatorChecked: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-6">
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
        Advanced
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-6 mt-1 space-y-2">
        {evaluators.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No evaluators configured.{' '}
            <Link
              href={`/${tenantId}/projects/${projectId}/evaluators`}
              className="text-primary underline hover:no-underline"
            >
              Create an evaluator
            </Link>{' '}
            to scope this webhook to specific evaluators.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Scope to specific evaluators. Leave all unchecked to receive failures from all
              evaluators.
            </p>
            {evaluators.map((ev) => (
              <FormField
                key={ev.id}
                control={control}
                name="evaluatorIds"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value?.includes(ev.id)}
                        onCheckedChange={(checked) => {
                          const current = field.value || [];
                          if (checked) {
                            field.onChange([...current, ev.id]);
                            onEvaluatorChecked();
                          } else {
                            field.onChange(current.filter((v: string) => v !== ev.id));
                          }
                        }}
                      />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">{ev.name}</FormLabel>
                  </FormItem>
                )}
              />
            ))}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function WebhookDestinationForm({
  mode,
  tenantId,
  projectId,
  webhookDestination,
  agents = [],
  evaluators = [],
  destinationType,
}: WebhookDestinationFormProps) {
  const router = useRouter();
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
  const [slackLoading, setSlackLoading] = useState(false);
  const [slackError, setSlackError] = useState<string | null>(null);

  const resolvedMode: DestinationMode =
    destinationType ?? (webhookDestination?.slackChannelId ? 'slack' : 'webhook');

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      destinationMode: resolvedMode,
      name: webhookDestination?.name || '',
      description: webhookDestination?.description || '',
      enabled: webhookDestination?.enabled ?? true,
      url: webhookDestination?.url || '',
      slackChannelId: webhookDestination?.slackChannelId || '',
      eventTypes: webhookDestination?.eventTypes || [],
      agentIds: webhookDestination?.agentIds ?? [],
      evaluatorIds: webhookDestination?.evaluatorIds ?? [],
      headers: recordToKeyValuePairs(webhookDestination?.headers ?? undefined),
    },
  });

  const selectedEventTypes = useWatch({ control: form.control, name: 'eventTypes' });
  const hasEvaluationFailed = selectedEventTypes.includes('evaluation.failed');

  useEffect(() => {
    if (resolvedMode !== 'slack') return;
    let cancelled = false;
    setSlackLoading(true);
    setSlackError(null);

    slackApi
      .listWorkspaceInstallations()
      .then(async ({ workspaces }) => {
        if (cancelled) return;
        if (workspaces.length === 0) {
          setSlackError('No Slack workspace connected. Install the Slack app first.');
          setSlackLoading(false);
          return;
        }
        const { channels } = await slackApi.listChannels(workspaces[0].teamId);
        if (!cancelled) {
          setSlackChannels(
            channels.map((ch) => ({ id: ch.id, name: ch.name, isPrivate: ch.isPrivate }))
          );
        }
      })
      .catch((err) => {
        if (!cancelled)
          setSlackError(err instanceof Error ? err.message : 'Failed to load channels');
      })
      .finally(() => {
        if (!cancelled) setSlackLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedMode]);

  async function onSubmit(values: FormValues) {
    const headersRecord = keyValuePairsToRecord(values.headers);
    const isSlack = resolvedMode === 'slack';
    const payload = {
      name: values.name,
      description: values.description || undefined,
      enabled: values.enabled,
      url: isSlack ? undefined : values.url,
      slackChannelId: isSlack ? values.slackChannelId : undefined,
      eventTypes: values.eventTypes,
      agentIds: values.agentIds,
      evaluatorIds: hasEvaluationFailed ? values.evaluatorIds : [],
      headers: isSlack
        ? undefined
        : Object.keys(headersRecord).length > 0
          ? headersRecord
          : undefined,
    };

    if (mode === 'create') {
      const result = await createWebhookDestinationAction(tenantId, projectId, payload);
      if (result.success) {
        toast.success(isSlack ? 'Slack alert destination created' : 'Outbound webhook created');
        router.push(`/${tenantId}/projects/${projectId}/webhook-destinations`);
        router.refresh();
      } else {
        toast.error(formatHeaderValidationError(result.error));
      }
    } else if (webhookDestination) {
      const result = await updateWebhookDestinationAction(
        tenantId,
        projectId,
        webhookDestination.id,
        payload
      );
      if (result.success) {
        toast.success(isSlack ? 'Slack alert destination updated' : 'Outbound webhook updated');
        router.push(`/${tenantId}/projects/${projectId}/webhook-destinations`);
        router.refresh();
      } else {
        toast.error(formatHeaderValidationError(result.error));
      }
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="My Webhook" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Optional description" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {resolvedMode === 'webhook' && (
          <>
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Destination URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://example.com/webhook" {...field} />
                  </FormControl>
                  <FormDescription>
                    Events will be sent as HTTP POST requests to this URL.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <GenericKeyValueInput
              control={form.control}
              name="headers"
              label="Custom Headers"
              description="Add custom HTTP headers to include in webhook delivery requests. Header names are case-insensitive and may be received in lowercase by the destination."
              keyPlaceholder="Header name"
              valuePlaceholder="Header value"
              addButtonLabel="Add Header"
            />
          </>
        )}

        {resolvedMode === 'slack' && (
          <FormField
            control={form.control}
            name="slackChannelId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Slack Channel</FormLabel>
                {slackError ? (
                  <p className="text-sm text-muted-foreground">{slackError}</p>
                ) : slackLoading ? (
                  <p className="text-sm text-muted-foreground">Loading channels...</p>
                ) : (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a channel" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {slackChannels.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id}>
                          <span className="flex items-center gap-1.5">
                            {channel.isPrivate ? (
                              <Lock className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <Hash className="h-3 w-3 text-muted-foreground" />
                            )}
                            {channel.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <FormDescription>
                  Alerts will be posted to this channel via the Inkeep Slack bot. The bot must be a
                  member of the channel.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="eventTypes"
          render={() => (
            <FormItem>
              <FormLabel>Event Types</FormLabel>
              <FormDescription>
                Select which events should be delivered to this webhook.
              </FormDescription>
              <div className="space-y-2 mt-2">
                {EVENT_TYPES.map((eventType) => (
                  <FormField
                    key={eventType.value}
                    control={form.control}
                    name="eventTypes"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value?.includes(eventType.value)}
                            onCheckedChange={(checked) => {
                              const current = field.value || [];
                              if (checked) {
                                field.onChange([...current, eventType.value]);
                              } else {
                                field.onChange(
                                  current.filter((v: string) => v !== eventType.value)
                                );
                                if (eventType.value === 'evaluation.failed') {
                                  form.setValue('evaluatorIds', []);
                                }
                              }
                            }}
                          />
                        </FormControl>
                        <FormLabel className="font-normal cursor-pointer">
                          {eventType.label}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                ))}
                <EvaluatorScopeSection
                  evaluators={evaluators}
                  control={form.control}
                  tenantId={tenantId}
                  projectId={projectId}
                  onEvaluatorChecked={() => {
                    const current = form.getValues('eventTypes') || [];
                    if (!current.includes('evaluation.failed')) {
                      form.setValue('eventTypes', [...current, 'evaluation.failed']);
                    }
                  }}
                />
                <FormField
                  control={form.control}
                  name="eventTypes"
                  render={({ field }) => (
                    <ConversationErrorsEventGroup
                      selectedEventTypes={field.value || []}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {agents.length > 0 && (
          <FormField
            control={form.control}
            name="agentIds"
            render={() => (
              <FormItem>
                <FormLabel>Agents</FormLabel>
                <FormDescription>
                  Select specific agents to scope this webhook to. Leave all unchecked to receive
                  events from all agents in the project.
                </FormDescription>
                <div className="space-y-2 mt-2">
                  {agents.map((agent) => (
                    <FormField
                      key={agent.id}
                      control={form.control}
                      name="agentIds"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value?.includes(agent.id)}
                              onCheckedChange={(checked) => {
                                const current = field.value || [];
                                if (checked) {
                                  field.onChange([...current, agent.id]);
                                } else {
                                  field.onChange(current.filter((v: string) => v !== agent.id));
                                }
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer">{agent.name}</FormLabel>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="enabled"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <FormLabel>Enabled</FormLabel>
                <FormDescription>
                  When enabled, events will be delivered to this outbound webhook.
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? 'Saving...'
              : mode === 'create'
                ? 'Create Destination'
                : 'Update Destination'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/${tenantId}/projects/${projectId}/webhook-destinations`)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
