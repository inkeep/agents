'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ApiProvider } from '@nangohq/types';
import { useForm } from 'react-hook-form';
import * as z from 'zod/v4';
import { GenericInput } from '@/components/form/generic-input';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { ProviderIcon } from '@/components/icons/provider-icon';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { type FieldConfig, type FormSection, getFormConfig } from './auth-form-config';

interface GenericAuthFormProps {
  provider: ApiProvider;
  onBack: () => void;
  onSubmit: (credentials: Record<string, any>) => void;
  loading?: boolean;
}

/**
 * Creates a dynamic Zod schema based on form configuration
 */
function createFormSchema(formConfig: NonNullable<ReturnType<typeof getFormConfig>>) {
  const allFields = formConfig.sections.flatMap((section) => section.fields);
  const schemaObject: Record<string, z.ZodTypeAny> = {};

  for (const field of allFields) {
    let fieldSchema: z.ZodTypeAny = z.string();

    // Apply custom validation if provided
    if (field.validate) {
      fieldSchema = fieldSchema.refine(
        (value: unknown) => {
          const stringValue = String(value || '');
          if (!stringValue && !field.required) return true; // Allow empty for non-required fields
          const error = field.validate ? field.validate(stringValue) : undefined;
          return !error;
        },
        {
          message: `Invalid ${field.label.toLowerCase()}`,
        }
      );
    }

    // Handle required vs optional fields
    if (field.required) {
      fieldSchema = z.string().min(1, `${field.label} is required`);
    } else {
      fieldSchema = z.string().optional().or(z.literal(''));
    }

    schemaObject[field.key] = fieldSchema;
  }

  return z.object(schemaObject);
}

export function GenericAuthForm({
  provider,
  onBack,
  onSubmit,
  loading = false,
}: GenericAuthFormProps) {
  const formConfig = getFormConfig(provider.auth_mode);

  // Move hooks before any early returns
  const allFields = formConfig?.sections.flatMap((section) => section.fields) || [];

  // Create a minimal schema if no config is available
  const FormSchema = formConfig
    ? createFormSchema(formConfig)
    : z.object({ _placeholder: z.string().optional() });

  type FormData = Record<string, string>;
  const defaultValues: FormData = Object.fromEntries(allFields.map((field) => [field.key, '']));

  const form = useForm<FormData>({
    resolver: formConfig ? zodResolver(FormSchema as any) : undefined,
    defaultValues,
  });

  if (!formConfig) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack}>
            ← Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Configuration Not Available</h1>
            <p className="text-muted-foreground">
              No configuration form is available for {provider.auth_mode} authentication mode.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = (data: FormData) => {
    // Prepare credentials object - only include non-empty values
    const credentials: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      const trimmedValue = value?.toString().trim();
      if (trimmedValue) {
        credentials[key] = trimmedValue;
      }
    }

    onSubmit(credentials);
  };

  const renderField = (field: FieldConfig) => {
    const isPrivateKey = field.key === 'private_key';
    const label = `${field.label}${field.required ? ' *' : ''}`;

    if (field.component === 'textarea') {
      return (
        <div key={field.key} className="space-y-2">
          <GenericTextarea
            control={form.control}
            name={field.key}
            label={label}
            placeholder={field.placeholder}
            className={isPrivateKey ? 'font-mono text-sm min-h-[120px]' : 'min-h-[80px]'}
          />
          {field.helpText && <p className="text-sm text-muted-foreground">{field.helpText}</p>}
        </div>
      );
    }

    return (
      <div key={field.key} className="space-y-2">
        <GenericInput
          control={form.control}
          name={field.key}
          label={label}
          type={field.type}
          placeholder={field.placeholder}
          disabled={loading}
        />
        {field.helpText && <p className="text-sm text-muted-foreground">{field.helpText}</p>}
      </div>
    );
  };

  const renderSection = (section: FormSection, index: number) => (
    <div key={index} className="space-y-4">
      {section.title && (
        <div>
          <h3 className="text-lg font-medium">{section.title}</h3>
          {section.description && (
            <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
          )}
        </div>
      )}

      {section.fields.map(renderField)}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <ProviderIcon provider={provider.name} size={24} />
          <div>
            <h1 className="text-lg font-medium">Setup {provider.display_name || provider.name}</h1>
            <p className="text-muted-foreground">
              Complete the required fields to set up this credential.
            </p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          {formConfig.sections.map(renderSection)}

          <div className="flex gap-3 pt-4">
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating Credential...' : 'Create Credential'}
            </Button>
            <Button type="button" variant="outline" onClick={onBack} disabled={loading}>
              Cancel
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
