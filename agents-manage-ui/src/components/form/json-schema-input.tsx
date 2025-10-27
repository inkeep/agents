'use client';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { FormFieldWrapper } from './form-field-wrapper';
import { StandaloneJsonEditor } from '../editors/standalone-json-editor';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader } from '@/components/ui/table';

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
      {(field) => (
        <Tabs>
          <TabsList className="absolute -top-2 right-0 h-auto">
            <TabsTrigger value="simple" className="py-0.5">
              Simple
            </TabsTrigger>
            <TabsTrigger value="advanced" className="py-0.5">
              Advanced
            </TabsTrigger>
          </TabsList>
          <TabsContent value="simple">
            <Table>
              <TableHeader>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Value</TableHead>
              </TableHeader>
              <TableBody>
                <TableCell>Foo</TableCell>
                <TableCell>Bar</TableCell>
                <TableCell>Qyz</TableCell>
              </TableBody>
            </Table>
          </TabsContent>
          <TabsContent value="advanced">
            <StandaloneJsonEditor
              placeholder={placeholder}
              {...field}
              value={field.value || ''} // can be `null`
              onChange={field.onChange}
              readOnly={readOnly}
              disabled={disabled}
            />
          </TabsContent>
        </Tabs>
      )}
    </FormFieldWrapper>
  );
}
