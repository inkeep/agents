'use client';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { FormControl } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { FormFieldWrapper } from './form-field-wrapper';

interface GenericTextareaProps<FV extends FieldValues, C = any, TV = FieldValues> {
  control: Control<FV, C, TV>;
  name: FieldPath<FV>;
  label: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  isRequired?: boolean;
  rows?: number;
}

export function GenericTextarea<FV extends FieldValues, TV extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  className,
  disabled,
  readOnly,
  isRequired = false,
  rows,
}: GenericTextareaProps<FV, TV>) {
  return (
    <FormFieldWrapper control={control} name={name} label={label} isRequired={isRequired}>
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
