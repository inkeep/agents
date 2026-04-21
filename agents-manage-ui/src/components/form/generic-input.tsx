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
  tooltip?: string;
  transformValue?: (value: string) => string | number | null;
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
  tooltip,
  transformValue,
}: GenericInputProps<TFieldValues, TTransformedValues>) {
  const transform =
    transformValue ??
    (type === 'number'
      ? // For number inputs, convert empty string to null, otherwise parse as number
        (value) => (value === '' ? null : Number(value))
      : (value) => value);

  return (
    <FormFieldWrapper
      control={control}
      name={name}
      label={label}
      description={description}
      isRequired={isRequired}
      tooltip={tooltip}
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
              field.onChange(transform(e.target.value));
            }}
          />
        </FormControl>
      )}
    </FormFieldWrapper>
  );
}
