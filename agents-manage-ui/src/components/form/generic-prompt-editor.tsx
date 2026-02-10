'use client';

import { type ComponentProps, useState } from 'react';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { Editor } from '@/components/editors/editor';
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
  ...props
}: Omit<FormFieldWrapperProps<FV, TV, TName>, 'children'> & {
  className?: string;
  placeholder: string;
  uri?: ComponentProps<typeof PromptEditor>['uri'];
}) {
  'use memo';
  const [open, onOpenChange] = useState(false);
  const $uri = props.uri ?? `${name}.template`;
  const uri = `${open ? 'expanded-' : ''}${$uri}` as const;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <Editor.Dialog open={open} onOpenChange={onOpenChange} label={label}>
            <div className="flex">
              <FormLabel isRequired={isRequired} className="inline-flex">
                {label}
              </FormLabel>
              <AddVariableAction uri={uri} className="ml-auto" />
              {!open && <Editor.DialogTrigger />}
            </div>
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
      )}
    />
  );
}
