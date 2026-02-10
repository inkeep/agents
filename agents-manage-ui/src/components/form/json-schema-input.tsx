'use client';

import { type Control, type FieldPath, type FieldValues, useFormState } from 'react-hook-form';
import { JsonSchemaBuilder } from '@/components/form/json-schema-builder';
import { Switch } from '@/components/ui/switch';
import { useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';
import { StandaloneJsonEditor } from '../editors/standalone-json-editor';
import { FormFieldWrapper } from './form-field-wrapper';

interface JsonSchemaInputProps<FV extends FieldValues, TV = FV> {
  control: Control<FV, unknown, TV>;
  name: FieldPath<FV>;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  description?: string;
  readOnly?: boolean;
  isRequired?: boolean;
  hasInPreview?: boolean;
  allRequired?: boolean;
  /**
   * URIs that start with `json-schema-...` are validated against the JSON schema.
   * In artifacts, we use custom JSON schemas with `inPreview` fields. To skip
   * JSON schema validation, use a URI that starts with `custom-json-schema-...`.
   */
  uri?: `${string}json-schema-${string}.json`;
  customTemplate?: string;
}

export function JsonSchemaInput<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues,
>({
  control,
  name,
  label = 'JSON Schema',
  placeholder,
  disabled,
  description,
  readOnly,
  isRequired = false,
  hasInPreview,
  allRequired = false,
  uri,
  customTemplate,
}: JsonSchemaInputProps<TFieldValues, TTransformedValues>) {
  const isJsonSchemaModeChecked = useAgentStore((state) => state.jsonSchemaMode);
  const { setJsonSchemaMode } = useAgentActions();
  const formState = useFormState({ name });
  const fieldState = control.getFieldState(name, formState);

  return (
    <FormFieldWrapper
      control={control}
      name={name}
      label={label}
      description={description}
      isRequired={isRequired}
    >
      {(field) => {
        const value = field.value || ''; // can be `null`

        return (
          <div className="pt-2 flex flex-col gap-2">
            {isJsonSchemaModeChecked ? (
              <StandaloneJsonEditor
                placeholder={placeholder}
                {...field}
                value={value}
                onChange={field.onChange}
                readOnly={readOnly}
                disabled={disabled}
                aria-invalid={!!fieldState.error}
                uri={uri}
                customTemplate={customTemplate}
              />
            ) : (
              <JsonSchemaBuilder
                value={value}
                onChange={field.onChange}
                hasInPreview={hasInPreview}
                hasError={!!fieldState.error}
                allRequired={allRequired}
                readOnly={readOnly}
              />
            )}
            <span className="absolute flex items-center end-0 -top-[2.5px] gap-2 text-sm font-medium">
              JSON
              <Switch checked={isJsonSchemaModeChecked} onCheckedChange={setJsonSchemaMode} />
            </span>
          </div>
        );
      }}
    </FormFieldWrapper>
  );
}
