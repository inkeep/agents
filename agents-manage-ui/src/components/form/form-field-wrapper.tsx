'use client';

import type React from 'react';

import type { Control, FieldPath, FieldValues, RegisterOptions } from 'react-hook-form';
import { FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

interface FormFieldWrapperProps<FV extends FieldValues, C = any, TV = FieldValues> {
  control: Control<FV, C, TV>;
  name: FieldPath<FV>;
  label: string;
  children: (field: FV) => React.ReactNode;
  description?: string | React.ReactNode;
  rules?: RegisterOptions<FV, FieldPath<FV>>;
  isRequired?: boolean;
}

export function FormFieldWrapper<FV extends FieldValues, TV extends FieldValues>({
  control,
  name,
  label,
  children,
  description,
  rules,
  isRequired,
}: FormFieldWrapperProps<FV, TV>) {
  return (
    <FormField
      control={control}
      name={name}
      rules={rules}
      render={({ field }) => (
        <FormItem className="relative">
          <FormLabel isRequired={isRequired}>{label}</FormLabel>
          {children(field)}
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
