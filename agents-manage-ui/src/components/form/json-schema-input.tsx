'use client';

import { useState } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { FormFieldWrapper } from './form-field-wrapper';
import { Switch } from '@/components/ui/switch';
import { StandaloneJsonEditor } from '../editors/standalone-json-editor';
import { JsonSchemaBuilder } from '@/components/form/json-schema-builder';

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
  const [isAdvanced, setIsAdvanced] = useState(false);

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
            {isAdvanced ? (
              <StandaloneJsonEditor
                placeholder={placeholder}
                {...field}
                value={value}
                onChange={field.onChange}
                readOnly={readOnly}
                disabled={disabled}
              />
            ) : (
              <JsonSchemaBuilder value={value} onChange={field.onChange} />
            )}
            <span className="absolute flex items-center end-0 top-0 gap-2 text-sm">
              Advanced
              <Switch onCheckedChange={setIsAdvanced} />
            </span>
          </div>
        );
      }}
    </FormFieldWrapper>
  );
}
