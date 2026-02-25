'use client';

import type { ReactNode, JSX } from 'react';
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
  control: Control<FV, unknown, TV>;
  name: TName;
  label: string | JSX.Element;
  children: (field: ControllerRenderProps<FV, TName>) => ReactNode;
  description?: ReactNode;
  isRequired?: boolean;
}

export function GenericCheckbox<
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
