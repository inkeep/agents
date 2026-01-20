'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { Switch } from '@/components/ui/switch';
import { createTriggerAction, updateTriggerAction } from '@/lib/actions/triggers';
import type { Trigger } from '@/lib/api/triggers';

// Authentication type options
const authTypeOptions: SelectOption[] = [
  { value: 'none', label: 'None' },
  { value: 'api_key', label: 'API Key' },
  { value: 'basic_auth', label: 'Basic Auth' },
  { value: 'bearer_token', label: 'Bearer Token' },
];

// Transform type options
const transformTypeOptions: SelectOption[] = [
  { value: 'none', label: 'None' },
  { value: 'object_transformation', label: 'Object Transformation (Simple)' },
  { value: 'jmespath', label: 'JMESPath (Advanced)' },
];

// Zod schema for the form
const triggerFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().default(''),
  enabled: z.boolean(),
  messageTemplate: z.string().min(1, 'Message template is required'),
  inputSchemaJson: z.string().default(''),
  transformType: z.enum(['none', 'object_transformation', 'jmespath']),
  jmespath: z.string().default(''),
  objectTransformationJson: z.string().default(''),
  authType: z.enum(['none', 'api_key', 'basic_auth', 'bearer_token']),
  // API Key fields
  apiKeyName: z.string().default(''),
  apiKeyValue: z.string().default(''),
  // Basic Auth fields
  basicAuthUsername: z.string().default(''),
  basicAuthPassword: z.string().default(''),
  // Bearer Token fields
  bearerToken: z.string().default(''),
  // Signing secret
  signingSecret: z.string().default(''),
});

type TriggerFormData = z.infer<typeof triggerFormSchema>;

interface TriggerFormProps {
  tenantId: string;
  projectId: string;
  agentId: string;
  trigger?: Trigger;
  mode: 'create' | 'edit';
}

export function TriggerForm({ tenantId, projectId, agentId, trigger, mode }: TriggerFormProps) {
  const router = useRouter();

  // Initialize form with default values or existing trigger data
  const getDefaultValues = (): TriggerFormData => {
    if (!trigger) {
      return {
        enabled: true,
        name: '',
        description: '',
        messageTemplate: '',
        inputSchemaJson: '',
        transformType: 'none',
        jmespath: '',
        objectTransformationJson: '',
        authType: 'none',
        apiKeyName: '',
        apiKeyValue: '',
        basicAuthUsername: '',
        basicAuthPassword: '',
        bearerToken: '',
        signingSecret: '',
      };
    }

    // Extract authentication details
    const auth = trigger.authentication as any;
    let authType: 'none' | 'api_key' | 'basic_auth' | 'bearer_token' = 'none';
    let apiKeyName = '';
    let apiKeyValue = '';
    let basicAuthUsername = '';
    let basicAuthPassword = '';
    let bearerToken = '';

    if (auth && typeof auth === 'object' && 'type' in auth) {
      authType = auth.type;
      if (auth.type === 'api_key' && auth.data) {
        apiKeyName = auth.data.name || '';
        apiKeyValue = auth.data.value || '';
      } else if (auth.type === 'basic_auth' && auth.data) {
        basicAuthUsername = auth.data.username || '';
        basicAuthPassword = auth.data.password || '';
      } else if (auth.type === 'bearer_token' && auth.data) {
        bearerToken = auth.data.token || '';
      }
    }

    // Determine transform type from existing data
    let transformType: 'none' | 'object_transformation' | 'jmespath' = 'none';
    if (trigger.outputTransform?.jmespath) {
      transformType = 'jmespath';
    } else if (trigger.outputTransform?.objectTransformation) {
      transformType = 'object_transformation';
    }

    return {
      id: trigger.id,
      name: trigger.name,
      description: trigger.description || '',
      enabled: trigger.enabled,
      messageTemplate: trigger.messageTemplate,
      inputSchemaJson: trigger.inputSchema ? JSON.stringify(trigger.inputSchema, null, 2) : '',
      transformType,
      jmespath: trigger.outputTransform?.jmespath || '',
      objectTransformationJson: trigger.outputTransform?.objectTransformation
        ? JSON.stringify(trigger.outputTransform.objectTransformation, null, 2)
        : '',
      authType,
      apiKeyName,
      apiKeyValue,
      basicAuthUsername,
      basicAuthPassword,
      bearerToken,
      signingSecret: trigger.signingSecret || '',
    };
  };

  const defaultValues = getDefaultValues();

  const form = useForm<TriggerFormData>({
    resolver: zodResolver(triggerFormSchema) as any,
    defaultValues,
  });

  const { isSubmitting } = form.formState;
  const authType = form.watch('authType');
  const transformType = form.watch('transformType');

  const onSubmit = async (data: TriggerFormData) => {
    try {
      // Parse JSON fields
      let inputSchema: Record<string, unknown> | undefined;
      if (data.inputSchemaJson?.trim()) {
        try {
          inputSchema = JSON.parse(data.inputSchemaJson);
        } catch {
          toast.error('Invalid input schema JSON');
          return;
        }
      }

      // Build output transform based on selected transform type
      let outputTransform: { jmespath?: string; objectTransformation?: Record<string, unknown> } | undefined;
      
      if (data.transformType === 'jmespath' && data.jmespath?.trim()) {
        outputTransform = { jmespath: data.jmespath };
      } else if (data.transformType === 'object_transformation' && data.objectTransformationJson?.trim()) {
        try {
          const objectTransformation = JSON.parse(data.objectTransformationJson);
          outputTransform = { objectTransformation };
        } catch {
          toast.error('Invalid object transformation JSON');
          return;
        }
      }

      // Build authentication object
      let authentication: any;
      if (data.authType !== 'none') {
        switch (data.authType) {
          case 'api_key':
            if (!data.apiKeyName || !data.apiKeyValue) {
              toast.error('API Key name and value are required');
              return;
            }
            authentication = {
              type: 'api_key',
              data: {
                name: data.apiKeyName,
                value: data.apiKeyValue,
              },
              add_position: 'header',
            };
            break;
          case 'basic_auth':
            if (!data.basicAuthUsername || !data.basicAuthPassword) {
              toast.error('Username and password are required');
              return;
            }
            authentication = {
              type: 'basic_auth',
              data: {
                username: data.basicAuthUsername,
                password: data.basicAuthPassword,
              },
              add_position: 'header',
            };
            break;
          case 'bearer_token':
            if (!data.bearerToken) {
              toast.error('Bearer token is required');
              return;
            }
            authentication = {
              type: 'bearer_token',
              data: {
                token: data.bearerToken,
              },
              add_position: 'header',
            };
            break;
        }
      }

      const payload: any = {
        id: data.id,
        name: data.name,
        description: data.description || undefined,
        enabled: data.enabled,
        messageTemplate: data.messageTemplate,
        inputSchema,
        outputTransform,
        authentication,
        signingSecret: data.signingSecret || undefined,
      };

      let result: { success: boolean; error?: string };
      if (mode === 'create') {
        result = await createTriggerAction(tenantId, projectId, agentId, payload);
      } else if (trigger) {
        result = await updateTriggerAction(tenantId, projectId, agentId, trigger.id, payload);
      } else {
        toast.error('Trigger not found');
        return;
      }

      if (result.success) {
        toast.success(`Trigger ${mode === 'create' ? 'created' : 'updated'} successfully`);
        router.push(`/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`);
      } else {
        toast.error(result.error || `Failed to ${mode} trigger`);
      }
    } catch (error) {
      console.error(`Failed to ${mode} trigger:`, error);
      toast.error(`Failed to ${mode} trigger. Please try again.`);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Configure the basic settings for your trigger.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <GenericInput
              control={form.control}
              name="name"
              label="Name"
              placeholder="e.g., GitHub Webhook"
              isRequired
            />
            <GenericTextarea
              control={form.control}
              name="description"
              label="Description"
              placeholder="Describe what this trigger does"
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
                      Enable or disable this trigger. Disabled triggers will not accept webhook
                      requests.
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

        {/* Message Template */}
        <Card>
          <CardHeader>
            <CardTitle>Message Template</CardTitle>
            <CardDescription>
              Define the message template sent to the agent. Use {'{{placeholder}}'} syntax to
              reference fields from the transformed payload.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GenericTextarea
              control={form.control}
              name="messageTemplate"
              label="Template"
              placeholder="e.g., New issue created: {{issue.title}}"
              rows={4}
              isRequired
            />
          </CardContent>
        </Card>

        {/* Input Schema */}
        <Card>
          <CardHeader>
            <CardTitle>Input Schema (Optional)</CardTitle>
            <CardDescription>JSON Schema to validate incoming webhook payloads.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="inputSchemaJson"
              render={({ field, fieldState }) => (
                <FormItem>
                  <ExpandableJsonEditor
                    name="json-schema-trigger-input"
                    label="JSON Schema"
                    value={field.value || ''}
                    onChange={field.onChange}
                    placeholder={`{\n  "type": "object",\n  "properties": {\n    "event": { "type": "string" }\n  }\n}`}
                    error={fieldState.error?.message}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Output Transform */}
        <Card>
          <CardHeader>
            <CardTitle>Output Transform (Optional)</CardTitle>
            <CardDescription>
              Transform the incoming payload before interpolating the message template. Choose one
              approach: Object Transformation for simple field remapping, or JMESPath for complex
              transformations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <GenericSelect
              control={form.control}
              name="transformType"
              label="Transform Type"
              options={transformTypeOptions}
              placeholder="Select transform type"
            />

            {transformType === 'object_transformation' && (
              <FormField
                control={form.control}
                name="objectTransformationJson"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <ExpandableJsonEditor
                      name="trigger-object-transformation"
                      label="Object Transformation"
                      value={field.value || ''}
                      onChange={field.onChange}
                      placeholder={`{\n  "title": "issue.title",\n  "author": "issue.user.login"\n}`}
                      error={fieldState.error?.message}
                    />
                    <FormDescription>
                      Map output field names to JMESPath paths. Each key becomes a field in the
                      transformed payload, and each value is a path to extract from the input.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {transformType === 'jmespath' && (
              <>
                <GenericInput
                  control={form.control}
                  name="jmespath"
                  label="JMESPath Expression"
                  placeholder="e.g., { title: issue.title, author: issue.user.login }"
                />
                <FormDescription>
                  A JMESPath expression for complex transformations like filtering arrays or
                  restructuring nested data. See{' '}
                  <a
                    href="https://jmespath.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    jmespath.org
                  </a>{' '}
                  for syntax reference.
                </FormDescription>
              </>
            )}
          </CardContent>
        </Card>

        {/* Authentication */}
        <Card>
          <CardHeader>
            <CardTitle>Authentication</CardTitle>
            <CardDescription>
              Configure authentication for incoming webhook requests.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <GenericSelect
              control={form.control}
              name="authType"
              label="Authentication Type"
              options={authTypeOptions}
              placeholder="Select authentication type"
              isRequired
            />

            {authType === 'api_key' && (
              <>
                <GenericInput
                  control={form.control}
                  name="apiKeyName"
                  label="Header Name"
                  placeholder="e.g., X-API-Key"
                  isRequired
                />
                <GenericInput
                  control={form.control}
                  name="apiKeyValue"
                  label="API Key Value"
                  placeholder="Enter the expected API key"
                  type="password"
                  isRequired
                />
              </>
            )}

            {authType === 'basic_auth' && (
              <>
                <GenericInput
                  control={form.control}
                  name="basicAuthUsername"
                  label="Username"
                  placeholder="Enter username"
                  isRequired
                />
                <GenericInput
                  control={form.control}
                  name="basicAuthPassword"
                  label="Password"
                  placeholder="Enter password"
                  type="password"
                  isRequired
                />
              </>
            )}

            {authType === 'bearer_token' && (
              <GenericInput
                control={form.control}
                name="bearerToken"
                label="Bearer Token"
                placeholder="Enter bearer token"
                type="password"
                isRequired
              />
            )}

            <GenericInput
              control={form.control}
              name="signingSecret"
              label="Signing Secret (Optional)"
              placeholder="HMAC-SHA256 signing secret"
              type="password"
            />
            <FormDescription>
              If provided, webhook requests must include a valid X-Signature-256 header for
              verification.
            </FormDescription>
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              router.push(`/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`)
            }
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {mode === 'create' ? 'Create Trigger' : 'Update Trigger'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
