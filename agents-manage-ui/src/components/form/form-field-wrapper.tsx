'use client';

import type React from 'react';

import type { Control, ControllerRenderProps, FieldPath, FieldValues } from 'react-hook-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

export interface FormFieldWrapperProps<
  FV extends FieldValues,
  TV extends FieldValues,
  TName extends FieldPath<FV>,
> {
  control: Control<FV, any, TV>;
  name: TName;
  label: string | React.JSX.Element;
  children: (field: ControllerRenderProps<FV, TName>) => React.ReactNode;
  description?: string | React.ReactNode;
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
          <FormControl>{children(field)}</FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
