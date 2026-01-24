'use client';

import type { FieldValues } from 'react-hook-form';
import { Textarea } from '@/components/ui/textarea';
import { FormFieldWrapper, type FormFieldWrapperProps } from './form-field-wrapper';

interface GenericTextareaProps<T extends FieldValues>
  extends Omit<FormFieldWrapperProps<T>, 'children'> {
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  rows?: number;
}

export function GenericTextarea<T extends FieldValues>({
  placeholder,
  className,
  disabled,
  readOnly,
  rows,
  ...props
}: GenericTextareaProps<T>) {
  return (
    <FormFieldWrapper {...props}>
      {(field) => (
        <Textarea
          placeholder={placeholder}
          className={className}
          rows={rows}
          {...field}
          value={field.value ?? ''}
          readOnly={readOnly}
          disabled={disabled}
        />
      )}
    </FormFieldWrapper>
  );
}
