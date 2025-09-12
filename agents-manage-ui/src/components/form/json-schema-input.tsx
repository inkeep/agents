'use client';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { FormFieldWrapper } from './form-field-wrapper';
import { StandaloneJsonEditor } from './standalone-json-editor';

interface JsonSchemaInputProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  description?: string;
  readOnly?: boolean;
  isRequired?: boolean;
}

export function JsonSchemaInput<T extends FieldValues>({
  control,
  name,
  label = 'JSON Schema',
  placeholder,
  disabled,
  description,
  readOnly,
  isRequired = false,
}: JsonSchemaInputProps<T>) {
  return (
    <FormFieldWrapper
      control={control}
      name={name}
      label={label}
      description={description}
      isRequired={isRequired}
    >
      {(field) => (
        <StandaloneJsonEditor
          placeholder={placeholder}
          {...field}
          onChange={field.onChange}
          readOnly={readOnly}
          disabled={disabled}
        />
      )}
    </FormFieldWrapper>
  );
}
