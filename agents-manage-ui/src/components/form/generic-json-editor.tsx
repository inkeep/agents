'use client';

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
} from '@/components/ui/form';
import { useMonacoActions } from '@/features/agent/state/use-monaco-store';
import type { FormFieldWrapperProps } from './form-field-wrapper';

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
  customTemplate = placeholder,
  readOnly,
}: Omit<FormFieldWrapperProps<FV, TV, TName>, 'children'> & {
  placeholder: string;
  customTemplate?: string;
  readOnly?: boolean;
}) {
  'use memo';
  const [open, onOpenChange] = useState(false);
  const uri = `${open ? 'expanded-' : ''}${name}.json` as const;
  const { getEditorByUri } = useMonacoActions();

  function focusEditor() {
    getEditorByUri(uri)?.focus();
  }
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <Editor.Dialog open={open} onOpenChange={onOpenChange} label={label}>
            <div className="flex">
              <FormLabel isRequired={isRequired} className="inline-flex grow" onClick={focusEditor}>
                {label}
              </FormLabel>
              {!open && <Editor.DialogTrigger />}
            </div>
            <FormControl>
              <StandaloneJsonEditor
                uri={uri}
                placeholder={placeholder}
                customTemplate={customTemplate}
                hasDynamicHeight={!open}
                readOnly={readOnly}
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
