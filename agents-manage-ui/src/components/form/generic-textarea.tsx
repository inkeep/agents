'use client';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { Textarea } from '@/components/ui/textarea';
import { FormFieldWrapper } from './form-field-wrapper';

interface GenericTextareaProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  isRequired?: boolean;
}

export function GenericTextarea<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  className,
  disabled,
  readOnly,
  isRequired = false,
}: GenericTextareaProps<T>) {
  return (
    <FormFieldWrapper control={control} name={name} label={label} isRequired={isRequired}>
      {(field) => (
        <Textarea
          placeholder={placeholder}
          className={className}
          {...field}
          readOnly={readOnly}
          disabled={disabled}
        />
      )}
    </FormFieldWrapper>
  );
}
