'use client';

import { type Control, type FieldPath, type FieldValues, useFormState } from 'react-hook-form';
import { JsonSchemaBuilder } from '@/components/form/json-schema-builder';
import { Switch } from '@/components/ui/switch';
import { useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';
import { StandaloneJsonEditor } from '../editors/standalone-json-editor';
import { FormFieldWrapper } from './form-field-wrapper';

interface JsonSchemaInputProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  description?: string;
  readOnly?: boolean;
  isRequired?: boolean;
  hasInPreview?: boolean;
}

export function JsonSchemaInput<T extends FieldValues>({
  control,
  name,
  label = 'JSON Schema',
  placeholder,
  disabled,
  description,
  readOnly,
  isRequired = false,
  hasInPreview,
  uri,
}: JsonSchemaInputProps<T>) {
  const isJsonSchemaModeChecked = useAgentStore((state) => state.jsonSchemaMode);
  const { setJsonSchemaMode } = useAgentActions();
  const formState = useFormState({ name });
  const fieldState = control.getFieldState(name, formState);

  return (
    <FormFieldWrapper
      control={control}
      name={name}
      label={label}
      description={description}
      isRequired={isRequired}
    >
      {(field) => {
        const value = field.value || ''; // can be `null`

        return (
          <div className="pt-2 flex flex-col gap-2">
            {isJsonSchemaModeChecked ? (
              <StandaloneJsonEditor
                placeholder={placeholder}
                {...field}
                value={value}
                onChange={field.onChange}
                readOnly={readOnly}
                disabled={disabled}
                aria-invalid={!!fieldState.error}
                uri={uri}
              />
            ) : (
              <JsonSchemaBuilder
                value={value}
                onChange={field.onChange}
                hasInPreview={hasInPreview}
                hasError={!!fieldState.error}
              />
            )}
            <span className="absolute flex items-center end-0 -top-[2.5px] gap-2 text-sm font-medium">
              JSON
              <Switch checked={isJsonSchemaModeChecked} onCheckedChange={setJsonSchemaMode} />
            </span>
          </div>
        );
      }}
    </FormFieldWrapper>
  );
}
