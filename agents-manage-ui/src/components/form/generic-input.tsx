'use client';

import type { JSX, ReactNode } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { FormFieldWrapper } from './form-field-wrapper';

interface GenericInputProps<FV extends FieldValues, TV = FieldValues> {
  control: Control<FV, unknown, TV>;
  name: FieldPath<FV>;
  label: string | JSX.Element;
  placeholder?: string;
  type?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  description?: ReactNode;
  isRequired?: boolean;
}

export function GenericInput<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues,
>({
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
}: GenericInputProps<TFieldValues, TTransformedValues>) {
  return (
    <FormFieldWrapper
      control={control}
      name={name}
      label={label}
      description={description}
      isRequired={isRequired}
    >
      {(field) => (
        <FormControl>
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
        </FormControl>
      )}
    </FormFieldWrapper>
  );
}
