'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm } from 'react-hook-form';
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
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { createTriggerAction, updateTriggerAction } from '@/lib/actions/triggers';
import type { Trigger } from '@/lib/api/triggers';

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
  // Authentication headers - array of name/value pairs
  authHeaders: z
    .array(
      z.object({
        name: z.string().min(1, 'Header name is required'),
        value: z.string().min(1, 'Header value is required'),
      })
    )
    .default([]),
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
        authHeaders: [],
        signingSecret: '',
      };
    }

    // Extract authentication headers from stored format
    // Stored format has: { headers: [{ name, valueHash, valuePrefix }] }
    // We show the prefix for display but require new value on edit
    const auth = trigger.authentication as {
      headers?: Array<{ name: string; valuePrefix?: string }>;
    } | null;
    const authHeaders: Array<{ name: string; value: string }> = [];

    if (auth?.headers && Array.isArray(auth.headers)) {
      for (const header of auth.headers) {
        // When editing, we show the header name but require user to re-enter the value
        // since we only store the hash, not the original value
        authHeaders.push({
          name: header.name,
          value: '', // User must re-enter value
        });
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
      authHeaders,
      signingSecret: '', // User must re-enter if they want to change it
    };
  };

  const defaultValues = getDefaultValues();

  const form = useForm<TriggerFormData>({
    resolver: zodResolver(triggerFormSchema) as any,
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'authHeaders',
  });

  const { isSubmitting } = form.formState;
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
      let outputTransform:
        | { jmespath?: string; objectTransformation?: Record<string, unknown> }
        | undefined;

      if (data.transformType === 'jmespath' && data.jmespath?.trim()) {
        outputTransform = { jmespath: data.jmespath };
      } else if (
        data.transformType === 'object_transformation' &&
        data.objectTransformationJson?.trim()
      ) {
        try {
          const objectTransformation = JSON.parse(data.objectTransformationJson);
          outputTransform = { objectTransformation };
        } catch {
          toast.error('Invalid object transformation JSON');
          return;
        }
      }

      // Build authentication object with headers (only if headers have values)
      // Filter out headers where user didn't provide a new value (for edit mode)
      const validHeaders = data.authHeaders.filter((h) => h.name && h.value);
      const authentication =
        validHeaders.length > 0
          ? { headers: validHeaders.map((h) => ({ name: h.name, value: h.value })) }
          : undefined;

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
              Configure header-based authentication for incoming webhook requests. Add one or more
              headers that must be present and match the expected values.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Header list */}
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-3 items-start">
                  <FormField
                    control={form.control}
                    name={`authHeaders.${index}.name`}
                    render={({ field: inputField }) => (
                      <FormItem className="flex-1">
                        {index === 0 && <FormLabel>Header Name</FormLabel>}
                        <FormControl>
                          <Input {...inputField} placeholder="e.g., X-API-Key" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`authHeaders.${index}.value`}
                    render={({ field: inputField }) => (
                      <FormItem className="flex-1">
                        {index === 0 && <FormLabel>Header Value</FormLabel>}
                        <FormControl>
                          <Input
                            {...inputField}
                            type="password"
                            placeholder="Enter expected value"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                    className={index === 0 ? 'mt-8' : ''}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ name: '', value: '' })}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Authentication Header
            </Button>

            {mode === 'edit' && fields.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Note: Header values are stored securely (hashed). You must re-enter the value to
                update it.
              </p>
            )}

            <div className="pt-4 border-t">
              <GenericInput
                control={form.control}
                name="signingSecret"
                label="Signing Secret (Optional)"
                placeholder="HMAC-SHA256 signing secret"
                type="password"
              />
              <FormDescription className="mt-2">
                If provided, webhook requests must include a valid X-Signature-256 header for
                verification.
              </FormDescription>
            </div>
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
