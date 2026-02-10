import type { FieldPath, FieldValues } from 'react-hook-form';
import { StandaloneJsonEditor } from '@/components/editors/standalone-json-editor';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../ui/form';
import type { FormFieldWrapperProps } from './form-field-wrapper';
import { Editor } from '@/components/editors/editor';
import { useState } from 'react';

export function GenericJsonEditor<
  FV extends FieldValues,
  TV extends FieldValues,
  TName extends FieldPath<FV>,
>({
  control,
  name,
  description,
  isRequired,
  label,
  placeholder,
  customTemplate,
}: Omit<FormFieldWrapperProps<FV, TV, TName>, 'children'> & {
  placeholder: string;
  customTemplate: string;
}) {
  const [open, onOpenChange] = useState(false);
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <Editor.Dialog open={open} onOpenChange={onOpenChange} label={label}>
            <FormLabel isRequired={isRequired}>
              {label}
              {!open && <Editor.DialogTrigger />}
            </FormLabel>
            <FormControl>
              <StandaloneJsonEditor
                placeholder={placeholder}
                customTemplate={customTemplate}
                {...field}
              />
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </Editor.Dialog>
        </FormItem>
      )}
    />
  );
}
