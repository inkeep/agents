'use client';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { FormFieldWrapper } from './form-field-wrapper';
import { StandaloneJsonEditor } from '../editors/standalone-json-editor';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { JsonSchemaBuilder } from '@/components/form/json-schema-builder';

interface JsonSchemaInputProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  description?: string;
  readOnly?: boolean;
  isRequired?: boolean;
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
}: JsonSchemaInputProps<T>) {
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
          <StandaloneJsonEditor
            placeholder={placeholder}
            {...field}
            value={value}
            onChange={field.onChange}
            readOnly={readOnly}
            disabled={disabled}
            actions={
              <Dialog defaultOpen>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="backdrop-blur-xl h-6 px-2 text-xs rounded-sm"
                  >
                    Simple Edit
                  </Button>
                </DialogTrigger>
                <DialogContent className="!max-w-4xl">
                  <DialogHeader>
                    <DialogTitle>Structured output (JSON)</DialogTitle>
                    <DialogDescription>
                      The model will generate a JSON object that matches this schema.
                    </DialogDescription>
                    <JsonSchemaBuilder value={value} onChange={field.onChange} />
                  </DialogHeader>
                  {/*<DialogFooter>*/}
                  {/* TODO */}
                  {/*<Button variant="secondary">*/}
                  {/*  <SquarePenIcon />*/}
                  {/*  Generate*/}
                  {/*</Button>*/}
                  {/*</DialogFooter>*/}
                </DialogContent>
              </Dialog>
            }
          />
        );
      }}
    </FormFieldWrapper>
  );
}
