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
  max?: string;
  disabled?: boolean;
  description?: string | React.ReactNode;
  isRequired?: boolean;
}

export function GenericInput<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  type = 'text',
  min,
  max,
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
          max={max}
          disabled={disabled}
          {...field}
          value={field.value ?? ''}
          onChange={(e) => {
            const value = e.target.value;
            if (type === 'number') {
              // For number inputs, convert empty string to null, otherwise parse as number
              field.onChange(value === '' ? null : Number(value));
            } else {
              field.onChange(value);
            }
          }}
        />
      )}
    </FormFieldWrapper>
  );
}
