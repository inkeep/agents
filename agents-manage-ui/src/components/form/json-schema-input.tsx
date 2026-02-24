'use client';

import { type Control, type FieldPath, type FieldValues, useFormState } from 'react-hook-form';
import { FormFieldWrapper } from './form-field-wrapper';
import { JsonSchemaEditor } from '@/components/editors/json-schema-editor';

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
      {({ value, ...args }) => (
        <JsonSchemaEditor
          value={value ?? ''} // can be `null`
          {...args}
          placeholder={placeholder}
          readOnly={readOnly}
          disabled={disabled}
          uri={uri}
          customTemplate={customTemplate}
          aria-invalid={!!fieldState.error}
          hasInPreview={hasInPreview}
          allRequired={allRequired}
        />
      )}
    </FormFieldWrapper>
  );
}
