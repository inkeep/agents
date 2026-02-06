'use client';

import type { ComponentProps, FC } from 'react';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { JsonEditor } from '@/components/editors/json-editor';
import type { FormFieldWrapperProps } from '@/components/form/form-field-wrapper';
import { Button } from '@/components/ui/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { basicSchemaTemplate } from '@/lib/templates';

type JsonEditorProps = ComponentProps<typeof JsonEditor>;

interface StandaloneJsonEditorProps
  extends Pick<
    JsonEditorProps,
    'value' | 'placeholder' | 'disabled' | 'id' | 'className' | 'readOnly' | 'aria-invalid' | 'uri'
  > {
  onChange: NonNullable<JsonEditorProps['onChange']>;
  name?: string;
  customTemplate?: string;
}

export const StandaloneJsonEditor: FC<StandaloneJsonEditorProps> = ({
  value = '',
  onChange,
  customTemplate = basicSchemaTemplate,
  name,
  readOnly,
  ...props
}) => {
  'use memo';
  // Construct uri from name if not provided (matches ExpandableJsonEditor behavior)
  const uri = props.uri ?? (name ? (`${name}.json` as const) : undefined);

  return (
    <JsonEditor value={value} onChange={onChange} readOnly={readOnly} uri={uri} {...props}>
      {!readOnly && (
        <Button
          type="button"
          onClick={() => {
            onChange(customTemplate);
          }}
          variant="outline"
          size="sm"
          className="backdrop-blur-xl h-6 px-2 text-xs rounded-sm"
        >
          Template
        </Button>
      )}
    </JsonEditor>
  );
};

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
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel isRequired={isRequired}>{label}</FormLabel>
          <FormControl>
            <StandaloneJsonEditor
              placeholder={placeholder}
              customTemplate={customTemplate}
              {...field}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
