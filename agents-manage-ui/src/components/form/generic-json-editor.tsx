import { useState } from 'react';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { Editor } from '@/components/editors/editor';
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
import { cn } from '@/lib/utils';

/** @lintignore */
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
  const uri = `${open ? 'expanded-' : ''}${name}.json` as const;
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <Editor.Dialog open={open} onOpenChange={onOpenChange} label={label}>
            <FormLabel isRequired={isRequired}>
              {label}
              <Editor.DialogTrigger className={cn('ml-auto', open && 'invisible')} />
            </FormLabel>
            <FormControl>
              <StandaloneJsonEditor
                uri={uri}
                placeholder={placeholder}
                customTemplate={customTemplate}
                hasDynamicHeight={!open}
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
