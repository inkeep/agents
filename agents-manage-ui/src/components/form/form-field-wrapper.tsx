'use client';

import type React from 'react';

import type { Control, FieldPath, FieldValues, RegisterOptions } from 'react-hook-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

interface FormFieldWrapperProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  children: (field: FieldValues) => React.ReactNode;
  description?: string;
  rules?: RegisterOptions<T, FieldPath<T>>;
  isRequired?: boolean;
}

export function FormFieldWrapper<T extends FieldValues>({
  control,
  name,
  label,
  children,
  description,
  rules,
  isRequired,
}: FormFieldWrapperProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      rules={rules}
      render={({ field }) => (
        <FormItem className="relative">
          <FormLabel isRequired={isRequired}>{label}</FormLabel>
          <FormControl>{children(field)}</FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
