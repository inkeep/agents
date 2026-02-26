'use client';

import { type ComponentProps, type ReactNode, useId, useState } from 'react';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { CodeEditor } from '@/components/editors/code-editor';
import { Editor } from '@/components/editors/editor';
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

export function GenericCodeEditor<
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
  actions,
  ...props
}: Omit<FormFieldWrapperProps<FV, TV, TName>, 'children'> & {
  className?: string;
  placeholder: string;
  uri?: ComponentProps<typeof CodeEditor>['uri'];
  actions?: ReactNode;
}) {
  'use memo';
  const [open, onOpenChange] = useState(false);
  const $uri = props.uri ?? `${name}.js`;
  const uri = `${open ? 'expanded-' : ''}${$uri}` as const;
  const id = useId();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <Editor.Dialog open={open} onOpenChange={onOpenChange} label={label}>
            <div className="flex">
              <FormLabel isRequired={isRequired} className="inline-flex grow" id={id}>
                {label}
              </FormLabel>
              {actions}
              {!open && <Editor.DialogTrigger />}
            </div>
            <FormControl>
              <CodeEditor
                uri={uri}
                autoFocus={open}
                className={cn(!open && 'max-h-96', 'min-h-16', className)}
                hasDynamicHeight={!open}
                placeholder={placeholder}
                aria-labelledby={id}
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
