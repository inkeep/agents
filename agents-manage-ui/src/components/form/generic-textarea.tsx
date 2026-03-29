'use client';

import type { JSX } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { FormControl } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { FormFieldWrapper } from './form-field-wrapper';

interface GenericTextareaProps<FV extends FieldValues, TV = FieldValues> {
  control: Control<FV, unknown, TV>;
  name: FieldPath<FV>;
  label: string | JSX.Element;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  isRequired?: boolean;
  rows?: number;
  description?: React.ReactNode;
}

export function GenericTextarea<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues,
>({
  control,
  name,
  label,
  placeholder,
  className,
  disabled,
  readOnly,
  isRequired = false,
  rows,
  description,
}: GenericTextareaProps<TFieldValues, TTransformedValues>) {
  return (
    <FormFieldWrapper
      control={control}
      name={name}
      label={label}
      isRequired={isRequired}
      description={description}
    >
      {(field) => (
        <FormControl>
          <Textarea
            placeholder={placeholder}
            className={className}
            rows={rows}
            {...field}
            value={field.value ?? ''}
            readOnly={readOnly}
            disabled={disabled}
          />
        </FormControl>
      )}
    </FormFieldWrapper>
  );
}
