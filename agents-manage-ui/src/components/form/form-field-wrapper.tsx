'use client';

import type { JSX, ReactNode } from 'react';

import type { Control, ControllerRenderProps, FieldPath, FieldValues } from 'react-hook-form';
import { FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

export interface FormFieldWrapperProps<
  FV extends FieldValues,
  TV extends FieldValues,
  TName extends FieldPath<FV>,
> {
  control: Control<FV, unknown, TV>;
  name: TName;
  label: string | JSX.Element;
  children: (field: ControllerRenderProps<FV, TName>) => ReactNode;
  description?: ReactNode;
  isRequired?: boolean;
  tooltip?: string;
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
  tooltip,
}: FormFieldWrapperProps<FV, TV, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="relative">
          <FormLabel isRequired={isRequired} tooltip={tooltip}>
            {label}
          </FormLabel>
          {children(field)}
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
