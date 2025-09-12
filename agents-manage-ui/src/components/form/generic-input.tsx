'use client';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { FormFieldWrapper } from './form-field-wrapper';

interface GenericInputProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  type?: string;
  min?: string;
  disabled?: boolean;
  description?: string;
  isRequired?: boolean;
}

export function GenericInput<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  type = 'text',
  min,
  disabled,
  description,
  isRequired = false,
}: GenericInputProps<T>) {
  return (
    <FormFieldWrapper
      control={control}
      name={name}
      label={label}
      description={description}
      isRequired={isRequired}
    >
      {(field) => (
        <Input
          type={type}
          placeholder={placeholder}
          min={min}
          disabled={disabled}
          {...field}
          value={field.value ?? ''}
          onChange={(e) => {
            const value = e.target.value;
            if (type === 'number') {
              // For number inputs, convert empty string to undefined, otherwise parse as number
              field.onChange(value === '' ? undefined : Number(value));
            } else {
              field.onChange(value);
            }
          }}
        />
      )}
    </FormFieldWrapper>
  );
}
