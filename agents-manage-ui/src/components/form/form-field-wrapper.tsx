'use client';

import type React from 'react';

import type { Control, ControllerRenderProps, FieldPath, FieldValues } from 'react-hook-form';
import { FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

export interface FormFieldWrapperProps<
  FV extends FieldValues,
  TV extends FieldValues,
  TName extends FieldPath<FV>,
> {
  control: Control<FV, unknown, TV>;
  name: TName;
  label: string | React.JSX.Element;
  children: (field: ControllerRenderProps<FV, TName>) => React.ReactNode;
  description?: React.ReactNode;
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
  isRequired,
}: FormFieldWrapperProps<FV, TV, TName>) {
  return (
    <FormField
      control={control}
      name={name}
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
