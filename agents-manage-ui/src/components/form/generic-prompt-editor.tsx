import { useState } from 'react';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { AddVariableAction } from '@/components/editors/expandable-prompt-editor';
import { PromptEditor } from '@/components/editors/prompt-editor';
import type { FormFieldWrapperProps } from '@/components/form/form-field-wrapper';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { cn } from '@/lib/utils';
import { Editor } from '@/components/editors/editor';

export function GenericPromptEditor<
  FV extends FieldValues,
  TV extends FieldValues,
  TName extends FieldPath<FV>,
>({
  control,
  name,
  description,
  isRequired,
  label,
  className,
  placeholder,
}: Omit<FormFieldWrapperProps<FV, TV, TName>, 'children'> & {
  className?: string;
  placeholder: string;
}) {
  'use memo';
  const [open, onOpenChange] = useState(false);
  const uri = `${open ? 'expanded-' : ''}${name}.template` as const;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        return (
          <FormItem>
            <Editor.Dialog open={open} onOpenChange={onOpenChange} label={label}>
              <FormLabel isRequired={isRequired}>
                {label}
                <AddVariableAction uri={uri} className="ml-auto" />
                {!open && <Editor.DialogTrigger />}
              </FormLabel>
              <FormControl>
                <PromptEditor
                  uri={uri}
                  autoFocus={open}
                  className={cn(!open && 'max-h-96', 'min-h-16', className)}
                  hasDynamicHeight={!open}
                  placeholder={placeholder}
                  // aria-labelledby={id}
                  {...field}
                />
              </FormControl>
              {description && <FormDescription>{description}</FormDescription>}
              <FormMessage />
            </Editor.Dialog>
          </FormItem>
        );
      }}
    />
  );
}
