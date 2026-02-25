'use client';

import type { ReactNode, JSX } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';

export interface FormFieldWrapperProps<
  FV extends FieldValues,
  TV extends FieldValues,
  TName extends FieldPath<FV>,
> {
  control: Control<FV, unknown, TV>;
  name: TName;
  label: string | JSX.Element;
  description?: ReactNode;
  isRequired?: boolean;
}

export function GenericCheckbox<
  FV extends FieldValues,
  TV extends FieldValues,
  TName extends FieldPath<FV>,
>({ control, name, label, description, isRequired }: FormFieldWrapperProps<FV, TV, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <div className="flex gap-2">
            <FormControl>
              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
            <FormLabel isRequired={isRequired}>{label}</FormLabel>
          </div>
          {description && <FormDescription className="text-xs">{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
