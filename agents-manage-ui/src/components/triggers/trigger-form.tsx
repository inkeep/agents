'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  validateJMESPath as coreValidateJMESPath,
  validateRegex as coreValidateRegex,
} from '@inkeep/agents-core/utils/signature-validation';
import { ArrowDown, ArrowUp, Check, ChevronDown, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { GenericInput } from '@/components/form/generic-input';
import type { SelectOption } from '@/components/form/generic-select';
import { GenericSelect } from '@/components/form/generic-select';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { ProviderIcon } from '@/components/icons/provider-icon';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Switch } from '@/components/ui/switch';
import { fetchCredentialsAction } from '@/lib/actions/credentials';
import { createTriggerAction, updateTriggerAction } from '@/lib/actions/triggers';
import type { Trigger } from '@/lib/api/triggers';

// Adapter functions that convert ValidationResult to string | undefined for form validation
const validateJMESPath = (value: string): string | undefined => {
  if (!value.trim()) return undefined;
  const result = coreValidateJMESPath(value);
  return result.valid ? undefined : result.error;
};

const validateRegex = (value: string): string | undefined => {
  if (!value.trim()) return undefined;
  const result = coreValidateRegex(value);
  return result.valid ? undefined : result.error;
};

// Transform type options
const transformTypeOptions: SelectOption[] = [
  { value: 'none', label: 'None' },
  { value: 'object_transformation', label: 'Object Transformation (Simple)' },
  { value: 'jmespath', label: 'JMESPath (Advanced)' },
];

// Algorithm options for signature verification
const algorithmOptions: SelectOption[] = [
  { value: 'sha256', label: 'SHA-256 (Recommended)' },
  { value: 'sha512', label: 'SHA-512' },
  { value: 'sha384', label: 'SHA-384' },
  { value: 'sha1', label: 'SHA-1 (Deprecated)' },
  { value: 'md5', label: 'MD5 (Deprecated)' },
];

// Encoding options for signature verification
const encodingOptions: SelectOption[] = [
  { value: 'hex', label: 'Hexadecimal (default)' },
  { value: 'base64', label: 'Base64' },
];

// Signature source options
const signatureSourceOptions: SelectOption[] = [
  { value: 'header', label: 'HTTP Header (default)' },
  { value: 'query', label: 'Query Parameter' },
  { value: 'body', label: 'Request Body (JMESPath)' },
];

// Signed component source options
const componentSourceOptions: SelectOption[] = [
  { value: 'header', label: 'HTTP Header' },
  { value: 'body', label: 'Request Body (JMESPath)' },
  { value: 'literal', label: 'Literal String' },
];

// Component join strategy options
const joinStrategyOptions: SelectOption[] = [{ value: 'concatenate', label: 'Concatenate' }];

// Provider presets for common webhook signature patterns
type ProviderPreset = {
  name: string;
  algorithm: 'sha256' | 'sha512' | 'sha384' | 'sha1' | 'md5';
  encoding: 'hex' | 'base64';
  signatureSource: 'header' | 'query' | 'body';
  signatureKey: string;
  signaturePrefix?: string;
  signatureRegex?: string;
  signedComponents: Array<{
    source: 'header' | 'body' | 'literal';
    key?: string;
    value?: string;
    regex?: string;
    required: boolean;
  }>;
  joinStrategy: 'concatenate';
  joinSeparator: string;
};

const providerPresets: Record<string, ProviderPreset> = {
  github: {
    name: 'GitHub',
    algorithm: 'sha256',
    encoding: 'hex',
    signatureSource: 'header',
    signatureKey: 'x-hub-signature-256',
    signaturePrefix: 'sha256=',
    signedComponents: [
      {
        source: 'body',
        required: true,
      },
    ],
    joinStrategy: 'concatenate',
    joinSeparator: '',
  },
  slack: {
    name: 'Slack',
    algorithm: 'sha256',
    encoding: 'hex',
    signatureSource: 'header',
    signatureKey: 'x-slack-signature',
    signaturePrefix: 'v0=',
    signedComponents: [
      {
        source: 'literal',
        value: 'v0',
        required: true,
      },
      {
        source: 'header',
        key: 'x-slack-request-timestamp',
        required: true,
      },
      {
        source: 'body',
        required: true,
      },
    ],
    joinStrategy: 'concatenate',
    joinSeparator: ':',
  },
  zendesk: {
    name: 'Zendesk',
    algorithm: 'sha256',
    encoding: 'base64',
    signatureSource: 'header',
    signatureKey: 'x-zendesk-webhook-signature',
    signedComponents: [
      {
        source: 'header',
        key: 'x-zendesk-webhook-signature-timestamp',
        required: true,
      },
      {
        source: 'body',
        required: true,
      },
    ],
    joinStrategy: 'concatenate',
    joinSeparator: '',
  },
  stripe: {
    name: 'Stripe',
    algorithm: 'sha256',
    encoding: 'hex',
    signatureSource: 'header',
    signatureKey: 'stripe-signature',
    signatureRegex: 't=([0-9]+),v1=([a-f0-9]+)',
    signedComponents: [
      {
        source: 'header',
        key: 'stripe-signature',
        regex: 't=([0-9]+)',
        required: true,
      },
      {
        source: 'body',
        required: true,
      },
    ],
    joinStrategy: 'concatenate',
    joinSeparator: '.',
  },
};

// Zod schema for the form
const triggerFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().default(''),
  enabled: z.boolean(),
  messageTemplate: z.string().default(''),
  inputSchemaJson: z.string().default(''),
  transformType: z.enum(['none', 'object_transformation', 'jmespath']),
  jmespath: z.string().default(''),
  objectTransformationJson: z.string().default(''),
  // Authentication headers - array of name/value pairs
  // existingValuePrefix is used to show that an existing value is configured (display only)
  authHeaders: z
    .array(
      z.object({
        name: z.string().min(1, 'Header name is required'),
        value: z.string(), // Can be empty if keeping existing value
        existingValuePrefix: z.string().optional(), // First 8 chars of existing value for display
      })
    )
    .default([]),
  // Signature verification toggle
  signatureVerificationEnabled: z.boolean().default(false),
  // Credential reference for signing secret
  signingSecretCredentialReferenceId: z.string().optional(),
  // Signature verification algorithm and encoding
  signatureAlgorithm: z.enum(['sha256', 'sha512', 'sha384', 'sha1', 'md5']).optional(),
  signatureEncoding: z.enum(['hex', 'base64']).optional(),
  // Signature source configuration
  signatureSource: z.enum(['header', 'query', 'body']).optional(),
  signatureKey: z.string().optional(),
  signaturePrefix: z.string().optional(),
  signatureRegex: z.string().optional(),
  // Signed components configuration
  signedComponents: z
    .array(
      z.object({
        source: z.enum(['header', 'body', 'literal']),
        key: z.string().optional(),
        value: z.string().optional(),
        regex: z.string().optional(),
        required: z.boolean().default(true),
      })
    )
    .default([]),
  // Component join configuration
  joinStrategy: z.enum(['concatenate']).optional(),
  joinSeparator: z.string().optional(),
  // Validation options
  headerCaseSensitive: z.boolean().optional(),
  allowEmptyBody: z.boolean().optional(),
  normalizeUnicode: z.boolean().optional(),
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
  const redirectPath = `/${tenantId}/projects/${projectId}/triggers?tab=webhooks`;
  const router = useRouter();
  const [credentials, setCredentials] = useState<SelectOption[]>([]);
  const [loadingCredentials, setLoadingCredentials] = useState(true);
  const [signatureKeyError, setSignatureKeyError] = useState<string | undefined>();
  const [signatureRegexError, setSignatureRegexError] = useState<string | undefined>();
  const [appliedPreset, setAppliedPreset] = useState<string | null>(null);
  const [presetsExpanded, setPresetsExpanded] = useState(true);

  // Fetch available credentials (only project-scoped credentials are allowed for triggers)
  useEffect(() => {
    async function loadCredentials() {
      setLoadingCredentials(true);
      try {
        const result = await fetchCredentialsAction(tenantId, projectId);
        if (result.success && result.data) {
          // Filter to only include project-scoped credentials (userId is null/undefined)
          // User-scoped credentials cannot be attached to triggers
          const projectScopedCredentials = result.data.filter((cred) => !cred.userId);
          const credentialOptions = projectScopedCredentials.map((cred) => ({
            value: cred.id,
            label: cred.name,
          }));
          setCredentials(credentialOptions);
        } else {
          toast.error('Failed to load credentials');
        }
      } catch (error) {
        console.error('Failed to fetch credentials:', error);
        toast.error('Failed to load credentials');
      } finally {
        setLoadingCredentials(false);
      }
    }
    loadCredentials();
  }, [tenantId, projectId]);

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
        signatureVerificationEnabled: false,
        signingSecretCredentialReferenceId: undefined,
        signatureAlgorithm: 'sha256',
        signatureEncoding: 'hex',
        signatureSource: 'header',
        signatureKey: '',
        signaturePrefix: '',
        signatureRegex: '',
        signedComponents: [],
        joinStrategy: 'concatenate',
        joinSeparator: '',
        headerCaseSensitive: false,
        allowEmptyBody: true,
        normalizeUnicode: false,
      };
    }

    // Extract authentication headers from stored format
    // Stored format has: { headers: [{ name, valueHash, valuePrefix }] }
    // We show the prefix for display but require new value on edit
    const auth = trigger.authentication as {
      headers?: Array<{ name: string; valuePrefix?: string }>;
      signingSecretHash?: string;
    } | null;
    const authHeaders: Array<{ name: string; value: string; existingValuePrefix?: string }> = [];

    if (auth?.headers && Array.isArray(auth.headers)) {
      for (const header of auth.headers) {
        // When editing, we show the header name and prefix indicator
        // Value is empty - user can optionally re-enter to update
        authHeaders.push({
          name: header.name,
          value: '', // User can optionally re-enter value to update
          existingValuePrefix: header.valuePrefix, // Shows first 8 chars as indicator
        });
      }
    }

    // Determine transform type from existing data
    let transformType: 'none' | 'object_transformation' | 'jmespath' = 'none';
    const outputTransform = trigger.outputTransform as
      | { jmespath?: string; objectTransformation?: Record<string, string> }
      | null
      | undefined;
    if (outputTransform?.jmespath) {
      transformType = 'jmespath';
    } else if (outputTransform?.objectTransformation) {
      transformType = 'object_transformation';
    }

    // Extract signature verification config from trigger
    const signatureVerification = (trigger as any).signatureVerification;
    const hasSigningCredential = !!(trigger as any).signingSecretCredentialReferenceId;

    // Signature verification is enabled if there's a signing credential configured
    const signatureVerificationEnabled = hasSigningCredential || !!signatureVerification;

    return {
      id: trigger.id,
      name: trigger.name,
      description: trigger.description || '',
      enabled: trigger.enabled,
      messageTemplate: trigger.messageTemplate || '',
      inputSchemaJson: trigger.inputSchema ? JSON.stringify(trigger.inputSchema, null, 2) : '',
      transformType,
      jmespath: outputTransform?.jmespath || '',
      objectTransformationJson: outputTransform?.objectTransformation
        ? JSON.stringify(outputTransform.objectTransformation, null, 2)
        : '',
      authHeaders,
      signatureVerificationEnabled,
      signingSecretCredentialReferenceId:
        (trigger as any).signingSecretCredentialReferenceId || undefined,
      signatureAlgorithm: signatureVerification?.algorithm || 'sha256',
      signatureEncoding: signatureVerification?.encoding || 'hex',
      signatureSource: signatureVerification?.signature?.source || 'header',
      signatureKey: signatureVerification?.signature?.key || '',
      signaturePrefix: signatureVerification?.signature?.prefix || '',
      signatureRegex: signatureVerification?.signature?.regex || '',
      signedComponents: signatureVerification?.signedComponents || [],
      joinStrategy: signatureVerification?.componentJoin?.strategy || 'concatenate',
      joinSeparator: signatureVerification?.componentJoin?.separator || '',
      headerCaseSensitive: signatureVerification?.validation?.headerCaseSensitive ?? false,
      allowEmptyBody: signatureVerification?.validation?.allowEmptyBody ?? true,
      normalizeUnicode: signatureVerification?.validation?.normalizeUnicode ?? false,
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

  const {
    fields: componentFields,
    append: appendComponent,
    remove: removeComponent,
    move: moveComponent,
  } = useFieldArray({
    control: form.control,
    name: 'signedComponents',
  });

  const { isSubmitting } = form.formState;
  const transformType = form.watch('transformType');
  const signatureSource = form.watch('signatureSource');

  // Apply provider preset to form fields
  const applyPreset = (presetKey: string) => {
    const preset = providerPresets[presetKey];
    if (!preset) return;

    // Set algorithm and encoding
    form.setValue('signatureAlgorithm', preset.algorithm);
    form.setValue('signatureEncoding', preset.encoding);

    // Set signature source configuration
    form.setValue('signatureSource', preset.signatureSource);
    form.setValue('signatureKey', preset.signatureKey);
    form.setValue('signaturePrefix', preset.signaturePrefix || '');
    form.setValue('signatureRegex', preset.signatureRegex || '');

    // Clear existing components
    while (componentFields.length > 0) {
      removeComponent(0);
    }

    // Add preset components
    for (const comp of preset.signedComponents) {
      appendComponent(comp);
    }

    // Set component join configuration
    form.setValue('joinStrategy', preset.joinStrategy);
    form.setValue('joinSeparator', preset.joinSeparator);

    // Track applied preset and collapse presets section
    setAppliedPreset(presetKey);
    setPresetsExpanded(false);

    toast.success(`Applied ${preset.name} preset`);
  };

  // Watch specific fields for request preview and conditional rendering
  const watchedAuthHeaders = form.watch('authHeaders');
  const watchedSignatureVerificationEnabled = form.watch('signatureVerificationEnabled');
  const watchedSigningCredential = form.watch('signingSecretCredentialReferenceId');
  const watchedSignatureKey = form.watch('signatureKey');
  const watchedSignaturePrefix = form.watch('signaturePrefix');
  const watchedSignatureAlgorithm = form.watch('signatureAlgorithm');
  const watchedSignatureEncoding = form.watch('signatureEncoding');
  const watchedSignedComponents = form.watch('signedComponents');
  const watchedJoinSeparator = form.watch('joinSeparator');

  // Generate request preview based on current form values
  const generateRequestPreview = useMemo(() => {
    const authHeaders = watchedAuthHeaders || [];
    const signatureVerificationEnabled = watchedSignatureVerificationEnabled;
    const signingCredential = watchedSigningCredential;
    const signatureKey = watchedSignatureKey;
    const signaturePrefix = watchedSignaturePrefix || '';
    const signatureAlgorithm = watchedSignatureAlgorithm || 'sha256';
    const signatureEncoding = watchedSignatureEncoding || 'hex';
    const signedComponents = watchedSignedComponents || [];
    const joinSeparator = watchedJoinSeparator || '';

    const lines: string[] = [];

    // HTTP method and path
    lines.push('POST /api/v1/webhooks/trigger/{trigger-id}');
    lines.push('Content-Type: application/json');

    // Auth headers
    for (const header of authHeaders) {
      if (header.name) {
        lines.push(`${header.name}: ••••••••`);
      }
    }

    // Signature header if configured and enabled
    if (signatureVerificationEnabled && signingCredential && signatureKey) {
      lines.push(`${signatureKey}: ${signaturePrefix}<${signatureAlgorithm}-hmac>`);

      // Add any timestamp headers from signed components
      for (const comp of signedComponents) {
        if (comp.source === 'header' && comp.key && comp.key !== signatureKey) {
          lines.push(`${comp.key}: <timestamp-or-value>`);
        }
      }
    }

    lines.push('');
    lines.push('{');
    lines.push('  "event": "example.event",');
    lines.push('  "data": { ... }');
    lines.push('}');

    // Add signature computation explanation if configured and enabled
    if (signatureVerificationEnabled && signingCredential && signedComponents.length > 0) {
      lines.push('');
      lines.push('---');
      lines.push('Signature computed from:');
      const componentDescriptions = signedComponents.map((comp) => {
        if (comp.source === 'body') return '<request-body>';
        if (comp.source === 'literal') return `"${comp.value || ''}"`;
        if (comp.source === 'header') return `<${comp.key || 'header'}-value>`;
        return '<component>';
      });
      lines.push(`  ${componentDescriptions.join(` ${joinSeparator || '+'} `)}`);
      lines.push(`  Algorithm: HMAC-${signatureAlgorithm.toUpperCase()}`);
      lines.push(`  Encoding: ${signatureEncoding}`);
    }

    return lines.join('\n');
  }, [
    watchedAuthHeaders,
    watchedSignatureVerificationEnabled,
    watchedSigningCredential,
    watchedSignatureKey,
    watchedSignaturePrefix,
    watchedSignatureAlgorithm,
    watchedSignatureEncoding,
    watchedSignedComponents,
    watchedJoinSeparator,
  ]);

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

      // Build authentication object with headers
      // For edit mode: headers with existingValuePrefix but no new value should keep existing
      // Headers with new values will update, headers with no value and no existing will be skipped
      const headersToSend: Array<{ name: string; value?: string; keepExisting?: boolean }> = [];

      for (const h of data.authHeaders) {
        if (!h.name) continue; // Skip headers without a name

        if (h.value) {
          // User provided a new value - update it
          headersToSend.push({ name: h.name, value: h.value });
        } else if (h.existingValuePrefix) {
          // Existing value, no new value - keep existing
          headersToSend.push({ name: h.name, keepExisting: true });
        }
        // If no value and no existing prefix, skip this header entirely
      }

      // Build authentication payload
      // Always send { headers: [...] } to ensure explicit update:
      // - Non-empty array: update with new headers
      // - Empty array: clear all authentication headers
      const authentication = {
        headers: headersToSend.map((h) => ({
          name: h.name,
          value: h.value,
          keepExisting: h.keepExisting,
        })),
      };

      // Trim messageTemplate to match backend validation behavior
      const trimmedMessageTemplate = data.messageTemplate?.trim() || '';

      // Build signature verification config (only if enabled)
      let signatureVerification: any;
      if (
        data.signatureVerificationEnabled &&
        data.signingSecretCredentialReferenceId &&
        data.signatureAlgorithm &&
        data.signatureEncoding &&
        data.signatureSource &&
        data.signatureKey &&
        data.signedComponents &&
        data.signedComponents.length > 0 &&
        data.joinStrategy &&
        data.joinSeparator !== undefined
      ) {
        // Build validation options object (only include if non-default values)
        const validation: any = {};
        if (data.headerCaseSensitive !== undefined && data.headerCaseSensitive !== false) {
          validation.headerCaseSensitive = data.headerCaseSensitive;
        }
        if (data.allowEmptyBody !== undefined && data.allowEmptyBody !== true) {
          validation.allowEmptyBody = data.allowEmptyBody;
        }
        if (data.normalizeUnicode !== undefined && data.normalizeUnicode !== false) {
          validation.normalizeUnicode = data.normalizeUnicode;
        }

        signatureVerification = {
          algorithm: data.signatureAlgorithm,
          encoding: data.signatureEncoding,
          signature: {
            source: data.signatureSource,
            key: data.signatureKey,
            ...(data.signaturePrefix && { prefix: data.signaturePrefix }),
            ...(data.signatureRegex && { regex: data.signatureRegex }),
          },
          signedComponents: data.signedComponents.map((comp) => ({
            source: comp.source,
            ...(comp.key && { key: comp.key }),
            ...(comp.value && { value: comp.value }),
            ...(comp.regex && { regex: comp.regex }),
            required: comp.required,
          })),
          componentJoin: {
            strategy: data.joinStrategy,
            separator: data.joinSeparator,
          },
          ...(Object.keys(validation).length > 0 && { validation }),
        };
      }

      const payload: any = {
        id: data.id,
        name: data.name,
        description: data.description || undefined,
        enabled: data.enabled,
        // Send null to explicitly clear messageTemplate, undefined to keep existing
        messageTemplate:
          trimmedMessageTemplate === ''
            ? mode === 'edit' && trigger?.messageTemplate
              ? null // Explicitly clear if editing and had a value before
              : undefined // Don't set if creating or never had a value
            : trimmedMessageTemplate,
        inputSchema,
        outputTransform,
        // Only include auth-related fields when they have actual values
        ...(headersToSend.length > 0 && { authentication }),
        // Only include signing credential and verification when enabled
        ...(data.signatureVerificationEnabled &&
          data.signingSecretCredentialReferenceId && {
            signingSecretCredentialReferenceId: data.signingSecretCredentialReferenceId,
          }),
        ...(signatureVerification && { signatureVerification }),
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
        router.push(redirectPath);
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
            <CardTitle>Message Template (Optional)</CardTitle>
            <CardDescription>
              Define an optional text message sent to the agent. Use {'{{placeholder}}'} syntax to
              reference fields from the transformed payload. The webhook payload is always included
              as structured data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GenericTextarea
              control={form.control}
              name="messageTemplate"
              label="Template"
              placeholder="e.g., New issue created: {{issue.title}}"
              rows={4}
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
                    className="min-w-0"
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
              selectTriggerClassName="w-full"
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

        {/* Authentication Headers */}
        <Card>
          <CardHeader>
            <CardTitle>Authentication Headers (Optional)</CardTitle>
            <CardDescription>
              Configure header-based authentication for incoming webhook requests. Add one or more
              headers that must be present and match the expected values.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Header list */}
            <div className="space-y-3">
              {fields.map((field, index) => {
                const existingPrefix = form.getValues(`authHeaders.${index}.existingValuePrefix`);
                const hasExistingValue = Boolean(existingPrefix);

                return (
                  <div key={field.id} className="space-y-2">
                    <div className="flex gap-3 items-start">
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
                                placeholder={
                                  hasExistingValue
                                    ? 'Enter new value to update'
                                    : 'Enter expected value'
                                }
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
                        className={index === 0 ? 'mt-[22px]' : ''}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {hasExistingValue && (
                      <div className="flex items-center gap-2 ml-1">
                        <Badge variant="secondary" className="text-xs font-normal gap-1.5">
                          <KeyRound className="h-3 w-3" />
                          <span>
                            Configured: <code className="font-mono">{existingPrefix}••••</code>
                          </span>
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Leave blank to keep existing value
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ name: '', value: '', existingValuePrefix: undefined })}
            >
              <Plus className="h-4 w-4" />
              Add Required Header
            </Button>
          </CardContent>
        </Card>

        {/* Signature Verification */}
        <Card>
          <CardHeader>
            <CardTitle>Signature Verification</CardTitle>
            <CardDescription>
              Enable HMAC signature verification to ensure webhook requests are authentic and
              haven't been tampered with.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Enable/Disable Toggle */}
            <FormField
              control={form.control}
              name="signatureVerificationEnabled"
              render={({ field }) => (
                // relative is needed b/c of the absolute positioning of the switch
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 relative">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Enable Signature Verification</FormLabel>
                    <FormDescription>
                      When enabled, incoming webhook requests must include a valid HMAC signature.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Signature Verification Configuration - only shown when enabled */}
            {watchedSignatureVerificationEnabled && (
              <div className="space-y-4 pt-4 border-t">
                {/* Provider Presets */}
                <Collapsible
                  open={presetsExpanded}
                  onOpenChange={setPresetsExpanded}
                  className="rounded-lg border p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium">Quick Setup Presets</h4>
                      {appliedPreset && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Check className="h-3 w-3" />
                          {providerPresets[appliedPreset]?.name}
                        </Badge>
                      )}
                    </div>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${presetsExpanded ? '' : '-rotate-90'}`}
                        />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent className="pt-3 space-y-3">
                    <FormDescription>
                      Apply a preset configuration for common webhook providers. This will auto-fill
                      all signature verification fields.
                    </FormDescription>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={appliedPreset === 'github' ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => applyPreset('github')}
                        className="justify-start gap-2"
                      >
                        <ProviderIcon provider="github" size={16} />
                        GitHub
                        {appliedPreset === 'github' && <Check className="h-3 w-3 ml-auto" />}
                      </Button>
                      <Button
                        type="button"
                        variant={appliedPreset === 'slack' ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => applyPreset('slack')}
                        className="justify-start gap-2"
                      >
                        <ProviderIcon provider="slack" size={16} />
                        Slack
                        {appliedPreset === 'slack' && <Check className="h-3 w-3 ml-auto" />}
                      </Button>
                      <Button
                        type="button"
                        variant={appliedPreset === 'zendesk' ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => applyPreset('zendesk')}
                        className="justify-start gap-2"
                      >
                        <ProviderIcon provider="zendesk" size={16} />
                        Zendesk
                        {appliedPreset === 'zendesk' && <Check className="h-3 w-3 ml-auto" />}
                      </Button>
                      <Button
                        type="button"
                        variant={appliedPreset === 'stripe' ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => applyPreset('stripe')}
                        className="justify-start gap-2"
                      >
                        <ProviderIcon provider="stripe" size={16} />
                        Stripe
                        {appliedPreset === 'stripe' && <Check className="h-3 w-3 ml-auto" />}
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Signing Secret Credential */}
                <GenericSelect
                  control={form.control}
                  name="signingSecretCredentialReferenceId"
                  label="Signing Secret Credential"
                  options={credentials}
                  placeholder={
                    loadingCredentials
                      ? 'Loading credentials...'
                      : credentials.length === 0
                        ? 'No project-scoped credentials available'
                        : 'Select a credential'
                  }
                  disabled={loadingCredentials}
                  isRequired
                  description="Select a project-scoped credential that contains the HMAC signing secret for webhook signature verification."
                />

                {/* Algorithm and Encoding selectors */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="signatureAlgorithm"
                    render={({ field: _field }) => (
                      <FormItem>
                        <FormLabel>HMAC Algorithm</FormLabel>
                        <GenericSelect
                          control={form.control}
                          name="signatureAlgorithm"
                          label=""
                          options={algorithmOptions}
                          placeholder="Select algorithm"
                        />
                        <FormDescription>
                          Choose the HMAC algorithm. SHA-256 is recommended for most use cases.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="signatureEncoding"
                    render={({ field: _field }) => (
                      <FormItem>
                        <FormLabel>Signature Encoding</FormLabel>
                        <GenericSelect
                          control={form.control}
                          name="signatureEncoding"
                          label=""
                          options={encodingOptions}
                          placeholder="Select encoding"
                        />
                        <FormDescription>
                          Choose how the signature is encoded. Hexadecimal is the most common.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Show deprecation warning for SHA-1 or MD5 */}
                {(form.watch('signatureAlgorithm') === 'sha1' ||
                  form.watch('signatureAlgorithm') === 'md5') && (
                  <Alert variant="warning">
                    <AlertDescription>
                      <strong>Warning:</strong> {form.watch('signatureAlgorithm')?.toUpperCase()} is
                      deprecated and should only be used for legacy systems. Consider upgrading to
                      SHA-256 or SHA-512 for better security.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Signature Source Configuration */}
                <div className="pt-4 border-t space-y-3">
                  <h4 className="text-sm font-medium">Signature Location</h4>
                  <FormField
                    control={form.control}
                    name="signatureSource"
                    render={({ field: _field }) => (
                      <FormItem>
                        <FormLabel>Signature Source</FormLabel>
                        <GenericSelect
                          control={form.control}
                          name="signatureSource"
                          label=""
                          options={signatureSourceOptions}
                          placeholder="Select signature source"
                        />
                        <FormDescription>
                          Choose where the signature is located in the webhook request. Most
                          providers send signatures in HTTP headers.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="signatureKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {signatureSource === 'header'
                            ? 'Header Name'
                            : signatureSource === 'query'
                              ? 'Query Parameter Name'
                              : 'JMESPath Expression'}
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={
                              signatureSource === 'header'
                                ? 'e.g., X-Hub-Signature-256'
                                : signatureSource === 'query'
                                  ? 'e.g., signature'
                                  : 'e.g., signature or headers."X-Signature"'
                            }
                            onBlur={(e) => {
                              field.onBlur();
                              if (signatureSource === 'body') {
                                const error = validateJMESPath(e.target.value);
                                setSignatureKeyError(error);
                              }
                            }}
                          />
                        </FormControl>
                        <FormDescription>
                          {signatureSource === 'header'
                            ? 'The name of the HTTP header containing the signature (case-insensitive by default).'
                            : signatureSource === 'query'
                              ? 'The name of the query parameter containing the signature.'
                              : 'A JMESPath expression to extract the signature from the request body.'}
                        </FormDescription>
                        {signatureKeyError && (
                          <p className="text-sm font-medium text-destructive">
                            {signatureKeyError}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="signaturePrefix"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Signature Prefix (Optional)</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder='e.g., "sha256=" or "v0="' />
                        </FormControl>
                        <FormDescription>
                          If the signature includes a prefix (like "sha256=" in GitHub webhooks),
                          specify it here. The prefix will be stripped before verification.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="signatureRegex"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Signature Regex (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder='e.g., "t=\\d+,v1=([a-f0-9]+)"'
                            onBlur={(e) => {
                              field.onBlur();
                              const error = validateRegex(e.target.value);
                              setSignatureRegexError(error);
                            }}
                          />
                        </FormControl>
                        <FormDescription>
                          A regular expression to extract the signature from the value. The first
                          capture group will be used as the signature. Useful for complex signature
                          formats like Stripe.
                        </FormDescription>
                        {signatureRegexError && (
                          <p className="text-sm font-medium text-destructive">
                            {signatureRegexError}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Signed Components Builder */}
                <div className="pt-4 border-t space-y-3">
                  <h4 className="text-sm font-medium">Signed Components</h4>
                  <FormDescription>
                    Define the components that are included in the signature. Components are joined
                    in order to create the signed payload.
                  </FormDescription>

                  {/* Signed Components List */}
                  <div className="space-y-3">
                    {componentFields.map((field, index) => {
                      const componentSource = form.watch(`signedComponents.${index}.source`);

                      return (
                        <div key={field.id} className="space-y-2 p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">Component {index + 1}</span>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => moveComponent(index, index - 1)}
                                disabled={index === 0}
                                className="h-7 w-7"
                              >
                                <ArrowUp className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => moveComponent(index, index + 1)}
                                disabled={index === componentFields.length - 1}
                                className="h-7 w-7"
                              >
                                <ArrowDown className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeComponent(index)}
                                className="h-7 w-7"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <FormField
                              control={form.control}
                              name={`signedComponents.${index}.source`}
                              render={({ field: _selectField }) => (
                                <FormItem>
                                  <FormLabel>Component Source</FormLabel>
                                  <GenericSelect
                                    control={form.control}
                                    name={`signedComponents.${index}.source`}
                                    label=""
                                    options={componentSourceOptions}
                                    placeholder="Select source"
                                  />
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {componentSource !== 'literal' && (
                              <FormField
                                control={form.control}
                                name={`signedComponents.${index}.key`}
                                render={({ field: inputField }) => (
                                  <FormItem>
                                    <FormLabel>
                                      {componentSource === 'header'
                                        ? 'Header Name'
                                        : 'JMESPath Expression'}
                                    </FormLabel>
                                    <FormControl>
                                      <Input
                                        {...inputField}
                                        placeholder={
                                          componentSource === 'header'
                                            ? 'e.g., X-Request-Timestamp'
                                            : 'e.g., timestamp or body.timestamp'
                                        }
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}

                            {componentSource === 'literal' && (
                              <FormField
                                control={form.control}
                                name={`signedComponents.${index}.value`}
                                render={({ field: inputField }) => (
                                  <FormItem>
                                    <FormLabel>Literal Value</FormLabel>
                                    <FormControl>
                                      <Input {...inputField} placeholder='e.g., "v0"' />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <FormField
                              control={form.control}
                              name={`signedComponents.${index}.regex`}
                              render={({ field: inputField }) => (
                                <FormItem>
                                  <FormLabel>Regex Extraction (Optional)</FormLabel>
                                  <FormControl>
                                    <Input {...inputField} placeholder='e.g., "([a-f0-9]+)"' />
                                  </FormControl>
                                  <FormDescription className="text-xs">
                                    Extract a portion of the component using a regex capture group.
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`signedComponents.${index}.required`}
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 mt-2">
                                  <div className="space-y-0.5">
                                    <FormLabel className="text-sm">Required</FormLabel>
                                    <FormDescription className="text-xs">
                                      If unchecked, missing component = empty string
                                    </FormDescription>
                                  </div>
                                  <FormControl>
                                    <Switch
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      appendComponent({
                        source: 'header',
                        key: '',
                        value: '',
                        regex: '',
                        required: true,
                      })
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add Signed Component
                  </Button>

                  {/* Component Join Configuration */}
                  <div className="pt-3 border-t space-y-3">
                    <h4 className="text-sm font-medium">Component Joining</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="joinStrategy"
                        render={({ field: _field }) => (
                          <FormItem>
                            <FormLabel>Join Strategy</FormLabel>
                            <GenericSelect
                              control={form.control}
                              name="joinStrategy"
                              label=""
                              options={joinStrategyOptions}
                              placeholder="Select strategy"
                            />
                            <FormDescription className="text-xs">
                              Strategy for combining components.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="joinSeparator"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Separator</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder='e.g., ":" or "."' />
                            </FormControl>
                            <FormDescription className="text-xs">
                              String to insert between components.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Advanced Validation Options */}
                  <div className="pt-4 border-t">
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-between">
                          <span className="text-sm font-medium">Advanced Validation Options</span>
                          <ChevronDown className="h-4 w-4 transition-transform" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3 space-y-3">
                        <FormDescription>
                          Configure advanced options for signature validation behavior.
                        </FormDescription>

                        <FormField
                          control={form.control}
                          name="headerCaseSensitive"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                              <div className="space-y-0.5">
                                <FormLabel className="text-sm">Case-Sensitive Headers</FormLabel>
                                <FormDescription className="text-xs">
                                  If enabled, header names are matched case-sensitively. Most
                                  providers are case-insensitive (default).
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="allowEmptyBody"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                              <div className="space-y-0.5">
                                <FormLabel className="text-sm">Allow Empty Body</FormLabel>
                                <FormDescription className="text-xs">
                                  If enabled, allows verification with an empty request body.
                                  Disable if your webhook always requires a body (default: enabled).
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="normalizeUnicode"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                              <div className="space-y-0.5">
                                <FormLabel className="text-sm">Normalize Unicode</FormLabel>
                                <FormDescription className="text-xs">
                                  If enabled, normalizes Unicode strings to NFC form before signing.
                                  Enable if you encounter signature mismatches with Unicode
                                  characters (default: disabled).
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Request Preview */}
        {((watchedAuthHeaders && watchedAuthHeaders.length > 0) ||
          (watchedSignatureVerificationEnabled && watchedSigningCredential)) && (
          <Card>
            <CardHeader>
              <CardTitle>Request Preview</CardTitle>
              <CardDescription>
                Example of what an incoming webhook request should look like based on your
                configuration. Secrets are not shown.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm font-mono whitespace-pre">
                {generateRequestPreview}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Form Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push(redirectPath)}>
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
