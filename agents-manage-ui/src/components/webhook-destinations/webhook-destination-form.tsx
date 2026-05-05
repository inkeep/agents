'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Textarea } from '@/components/ui/textarea';
import {
  createWebhookDestinationAction,
  updateWebhookDestinationAction,
} from '@/lib/actions/webhook-destinations';
import type { WebhookDestination } from '@/lib/api/webhook-destinations';

const EVENT_TYPES = [
  { value: 'conversation.created', label: 'Conversation Created' },
  { value: 'conversation.updated', label: 'Conversation Updated' },
  { value: 'feedback.created', label: 'Feedback Created' },
] as const;

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  enabled: z.boolean(),
  url: z.string().url('Must be a valid URL'),
  eventTypes: z.array(z.string()).min(1, 'Select at least one event type'),
  agentIds: z.array(z.string()),
});

type FormValues = z.infer<typeof formSchema>;

interface Agent {
  id: string;
  name: string;
}

interface WebhookDestinationFormProps {
  mode: 'create' | 'edit';
  tenantId: string;
  projectId: string;
  webhookDestination?: WebhookDestination;
  agents?: Agent[];
}

export function WebhookDestinationForm({
  mode,
  tenantId,
  projectId,
  webhookDestination,
  agents = [],
}: WebhookDestinationFormProps) {
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: webhookDestination?.name || '',
      description: webhookDestination?.description || '',
      enabled: webhookDestination?.enabled ?? true,
      url: webhookDestination?.url || '',
      eventTypes: webhookDestination?.eventTypes || [],
      agentIds: (webhookDestination as any)?.agentIds || [],
    },
  });

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name,
      description: values.description || undefined,
      enabled: values.enabled,
      url: values.url,
      eventTypes: values.eventTypes,
      agentIds: values.agentIds,
    };

    if (mode === 'create') {
      const result = await createWebhookDestinationAction(tenantId, projectId, payload);
      if (result.success) {
        toast.success('Outbound webhook created');
        router.push(`/${tenantId}/projects/${projectId}/webhook-destinations`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } else if (webhookDestination) {
      const result = await updateWebhookDestinationAction(
        tenantId,
        projectId,
        webhookDestination.id,
        payload
      );
      if (result.success) {
        toast.success('Outbound webhook updated');
        router.push(`/${tenantId}/projects/${projectId}/webhook-destinations`);
        router.refresh();
      } else {
        toast.error(result.error);
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
                ? 'Create Outbound Webhook'
                : 'Update Outbound Webhook'}
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
