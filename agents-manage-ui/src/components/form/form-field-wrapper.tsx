'use client';

import type React from 'react';
import type {
  Control,
  ControllerRenderProps,
  FieldPath,
  FieldValues,
  RegisterOptions,
} from 'react-hook-form';
import { FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

interface FormFieldWrapperProps<
  FV extends FieldValues,
  TV extends FieldValues,
  TName extends FieldPath<FV>,
> {
  control: Control<FV, any, TV>;
  name: TName;
  label: string;
  children: (field: ControllerRenderProps<FV, TName>) => React.ReactNode;
  description?: React.ReactNode;
  rules?: RegisterOptions<FV, TName>;
  isRequired?: boolean;
}

export function FormFieldWrapper<
  FV extends FieldValues,
  TV extends FieldValues,
  TName extends FieldPath<FV>,
>({
  control,
  name,
  label,
  children,
  description,
  rules,
  isRequired,
}: FormFieldWrapperProps<FV, TV, TName>) {
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
